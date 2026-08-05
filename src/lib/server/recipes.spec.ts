import { describe, expect, it, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import {
	compositions,
	compositionSteps,
	ingredients,
	ingredientUsages,
	recipes,
	recipeVersions,
	steps
} from './db/schema';
import { createIngredient } from './ingredients';
import {
	BlankInstructionError,
	BlankTitleError,
	BlankVariantNameError,
	CompositionNotFoundError,
	CompositionStepNotFoundError,
	IngredientNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	RecipeVersionNotFoundError,
	addIngredientUsage,
	addStep,
	createRecipe,
	createVariant,
	formatQuantity,
	getCompositionDetail,
	getDefaultComposition,
	getOtherCompositionsReferencingStep,
	getRecipe,
	listCompositions,
	listRecipeVersions,
	listRecipes,
	overrideStep,
	removeStepFromComposition,
	renderInstruction,
	revertToVersion,
	updateStepInstruction
} from './recipes';

describe('recipes', () => {
	beforeEach(() => {
		db.delete(recipeVersions).run();
		db.delete(ingredientUsages).run();
		db.delete(compositionSteps).run();
		db.delete(steps).run();
		db.delete(compositions).run();
		db.delete(recipes).run();
		db.delete(ingredients).run();
	});

	it('creates a recipe with a title', () => {
		const recipe = createRecipe('Chilli con carne');

		expect(recipe.title).toEqual('Chilli con carne');
		expect(recipe.id).toEqual(expect.any(Number));
	});

	it('rejects a blank title', () => {
		expect(() => createRecipe('   ')).toThrow(BlankTitleError);
	});

	it('trims surrounding whitespace from title', () => {
		const recipe = createRecipe('  Chilli con carne  ');
		expect(recipe.title).toEqual('Chilli con carne');
	});

	it('creates a default composition alongside the recipe', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);

		expect(composition).toMatchObject({ recipeId: recipe.id, name: null, isDefault: true });
	});

	it('lists no recipes initially', () => {
		expect(listRecipes()).toEqual([]);
	});

	it('lists created recipes', () => {
		createRecipe('Chilli con carne');
		createRecipe('Banana bread');

		expect(listRecipes().map((r) => r.title)).toEqual(['Chilli con carne', 'Banana bread']);
	});

	describe('steps', () => {
		it('adds a step with instruction text and no duration', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Brown the mince.'
			});

			expect(step).toMatchObject({
				recipeId: recipe.id,
				instruction: 'Brown the mince.',
				durationKind: null,
				durationMin: null,
				durationMax: null,
				durationUnit: null
			});
			expect(compositionStep).toMatchObject({
				compositionId: defaultComposition.id,
				position: 1,
				poolStepId: step.id,
				overrideStepId: null
			});
		});

		it('adds a step with a duration', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Simmer.',
				duration: { kind: 'cook', min: 45, unit: 'minutes' }
			});

			expect(step).toMatchObject({
				durationKind: 'cook',
				durationMin: 45,
				durationMax: null,
				durationUnit: 'minutes'
			});
		});

		it('adds a step with a duration range', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Simmer.',
				duration: { kind: 'cook', min: 30, max: 45, unit: 'minutes' }
			});

			expect(step).toMatchObject({ durationMin: 30, durationMax: 45 });
		});

		it('rejects a blank instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			expect(() => addStep(defaultComposition.id, { instruction: '   ' })).toThrow(
				BlankInstructionError
			);
		});

		it('rejects an unknown duration kind', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			expect(() =>
				addStep(defaultComposition.id, {
					instruction: 'Simmer.',
					duration: { kind: 'bogus', min: 10, unit: 'minutes' }
				})
			).toThrow(InvalidDurationError);
		});

		it('rejects a duration max smaller than min', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			expect(() =>
				addStep(defaultComposition.id, {
					instruction: 'Simmer.',
					duration: { kind: 'cook', min: 45, max: 10, unit: 'minutes' }
				})
			).toThrow(InvalidDurationError);
		});

		it('rejects a step for a non-existent composition', () => {
			expect(() => addStep(999999, { instruction: 'Brown the mince.' })).toThrow(
				CompositionNotFoundError
			);
		});

		it('assigns increasing positions to successive steps', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const { compositionStep } = addStep(defaultComposition.id, { instruction: 'Simmer.' });

			expect(compositionStep.position).toEqual(2);
		});

		it('updates a step instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

			const updated = updateStepInstruction(step.id, 'Brown {{1}} of mince.');
			expect(updated.instruction).toEqual('Brown {{1}} of mince.');
		});
	});

	describe('ingredient usages', () => {
		it('adds an ingredient usage to a step', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const beef = createIngredient({ baseTerm: 'beef mince' });

			const usage = addIngredientUsage(step.id, {
				ingredientId: beef.id,
				quantityValue: 500,
				quantityUnit: 'g'
			});

			expect(usage).toMatchObject({
				stepId: step.id,
				ingredientId: beef.id,
				position: 1,
				quantityValue: 500,
				quantityUnit: 'g',
				prepAttribute: null,
				note: null
			});
		});

		it('carries an optional prep attribute and note', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Add the onion.' });
			const onion = createIngredient({ baseTerm: 'onion' });

			const usage = addIngredientUsage(step.id, {
				ingredientId: onion.id,
				quantityValue: 1,
				quantityUnit: '',
				prepAttribute: 'diced',
				note: 'the yellow one, not white'
			});

			expect(usage).toMatchObject({
				prepAttribute: 'diced',
				note: 'the yellow one, not white'
			});
		});

		it('rejects a negative quantity', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Add the onion.' });
			const onion = createIngredient({ baseTerm: 'onion' });

			expect(() =>
				addIngredientUsage(step.id, { ingredientId: onion.id, quantityValue: -1 })
			).toThrow(InvalidQuantityError);
		});

		it('rejects a usage referencing a non-existent ingredient', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Add the onion.' });

			expect(() => addIngredientUsage(step.id, { ingredientId: 999999, quantityValue: 1 })).toThrow(
				IngredientNotFoundError
			);
		});

		it('assigns increasing positions to successive usages on the same step', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Add aromatics.' });
			const onion = createIngredient({ baseTerm: 'onion' });
			const garlic = createIngredient({ baseTerm: 'garlic' });

			addIngredientUsage(step.id, { ingredientId: onion.id, quantityValue: 1 });
			const second = addIngredientUsage(step.id, { ingredientId: garlic.id, quantityValue: 2 });

			expect(second.position).toEqual(2);
		});
	});

	describe('formatQuantity', () => {
		it('displays the exact value when rounding is off', () => {
			const banana = createIngredient({ baseTerm: 'banana', roundToWholeUnit: false });
			expect(formatQuantity(2.5, '', banana)).toEqual('2.5');
		});

		it('displays a unit alongside the value', () => {
			const flour = createIngredient({ baseTerm: 'flour' });
			expect(formatQuantity(200, 'g', flour)).toEqual('200 g');
		});

		it('rounds and marks the value as approximate when rounding is on and it differs', () => {
			const egg = createIngredient({ baseTerm: 'egg', roundToWholeUnit: true });
			expect(formatQuantity(4.5, '', egg)).toEqual('~5');
		});

		it('does not mark an already-whole value as approximate', () => {
			const egg = createIngredient({ baseTerm: 'egg', roundToWholeUnit: true });
			expect(formatQuantity(4, '', egg)).toEqual('4');
		});

		it('never changes the underlying stored quantity', () => {
			const egg = createIngredient({ baseTerm: 'egg', roundToWholeUnit: true });
			const recipe = createRecipe('Pancakes');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Whisk the eggs.' });

			const usage = addIngredientUsage(step.id, { ingredientId: egg.id, quantityValue: 4.5 });

			expect(usage.quantityValue).toEqual(4.5);
			expect(formatQuantity(usage.quantityValue, usage.quantityUnit, egg)).toEqual('~5');
		});
	});

	describe('renderInstruction', () => {
		it('weaves a usage quantity into the instruction text at its token', () => {
			const flour = createIngredient({ baseTerm: 'flour' });
			const recipe = createRecipe('Bread');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Mix in {{1}} of flour.' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: flour.id,
				quantityValue: 200,
				quantityUnit: 'g'
			});

			expect(renderInstruction(step.instruction, [{ ...usage, ingredient: flour }])).toEqual(
				'Mix in 200 g of flour.'
			);
		});

		it('leaves a token with no matching usage untouched', () => {
			expect(renderInstruction('Add {{1}} of salt.', [])).toEqual('Add {{1}} of salt.');
		});
	});

	describe('getRecipe', () => {
		it('returns undefined for a non-existent recipe', () => {
			expect(getRecipe(999999)).toBeUndefined();
		});

		it("defaults to the recipe's default composition", () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);

			const detail = getRecipe(recipe.id);
			expect(detail?.composition.id).toEqual(defaultComposition.id);
			expect(detail?.compositions).toHaveLength(1);
		});

		it('returns steps in order, each with its usages and rendered instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const onion = createIngredient({ baseTerm: 'onion', roundToWholeUnit: true });

			const { step: step1 } = addStep(defaultComposition.id, {
				instruction: 'Brown {{1}} of mince.'
			});
			addIngredientUsage(step1.id, {
				ingredientId: beef.id,
				quantityValue: 500,
				quantityUnit: 'g'
			});

			const { step: step2 } = addStep(defaultComposition.id, {
				instruction: 'Add {{1}} onion, diced.',
				duration: { kind: 'active', min: 5, unit: 'minutes' }
			});
			addIngredientUsage(step2.id, {
				ingredientId: onion.id,
				quantityValue: 1.5,
				prepAttribute: 'diced'
			});

			const detail = getRecipe(recipe.id);

			expect(detail?.title).toEqual('Chilli con carne');
			expect(detail?.composition.steps).toHaveLength(2);
			expect(detail?.composition.steps[0]).toMatchObject({
				instruction: 'Brown {{1}} of mince.',
				renderedInstruction: 'Brown 500 g of mince.',
				isOverride: false
			});
			expect(detail?.composition.steps[0].usages).toHaveLength(1);
			expect(detail?.composition.steps[1]).toMatchObject({
				renderedInstruction: 'Add ~2 onion, diced.',
				durationKind: 'active'
			});
			expect(detail?.composition.steps[1].usages[0]).toMatchObject({ prepAttribute: 'diced' });
		});

		it("applies the ingredient rounding toggle to each usage's display quantity, without touching the stored value", () => {
			const recipe = createRecipe('Pancakes');
			const defaultComposition = getDefaultComposition(recipe.id);
			const egg = createIngredient({ baseTerm: 'egg', roundToWholeUnit: true });
			const { step } = addStep(defaultComposition.id, { instruction: 'Whisk the eggs.' });
			addIngredientUsage(step.id, { ingredientId: egg.id, quantityValue: 4.5 });

			const usage = getRecipe(recipe.id)?.composition.steps[0].usages[0];

			expect(usage).toMatchObject({ quantityValue: 4.5, displayQuantity: '~5' });
		});

		it('gives the whole-recipe ingredient list and the inline per-step display the same underlying usages', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const detail = getRecipe(recipe.id);
			const wholeRecipeList = detail?.composition.steps.flatMap((s) => s.usages) ?? [];
			const inlinePerStep = detail?.composition.steps[0].usages ?? [];

			expect(wholeRecipeList).toEqual(inlinePerStep);
		});

		it('returns steps with no usages as an empty array', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Preheat the oven.' });

			const detail = getRecipe(recipe.id);
			expect(detail?.composition.steps[0].usages).toEqual([]);
		});
	});

	describe('compositions and variants', () => {
		it('rejects a blank variant name', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			expect(() => createVariant(recipe.id, '   ', defaultComposition.id)).toThrow(
				BlankVariantNameError
			);
		});

		it('rejects seeding from a composition on a different recipe', () => {
			const recipeA = createRecipe('Chilli con carne');
			const recipeB = createRecipe('Banana bread');
			const defaultOfB = getDefaultComposition(recipeB.id);
			expect(() => createVariant(recipeA.id, 'Chilli sin carne', defaultOfB.id)).toThrow(
				CompositionNotFoundError
			);
		});

		it("seeds a variant with the default composition's current step list, as unmodified references", () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			addStep(defaultComposition.id, { instruction: 'Simmer.' });

			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			expect(variant).toMatchObject({
				recipeId: recipe.id,
				name: 'Chilli sin carne',
				isDefault: false,
				seededFromCompositionId: defaultComposition.id
			});

			const detail = getCompositionDetail(variant.id);
			expect(detail?.steps.map((s) => s.instruction)).toEqual(['Brown the mince.', 'Simmer.']);
			expect(detail?.steps.every((s) => !s.isOverride)).toBe(true);
		});

		it('lists compositions with the default first', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			expect(listCompositions(recipe.id).map((c) => c.id)).toEqual([
				defaultComposition.id,
				variant.id
			]);
		});

		it('editing a shared, unoverridden step updates every composition that references it', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			updateStepInstruction(step.id, 'Brown the mince well.');

			const defaultDetail = getCompositionDetail(defaultComposition.id);
			const variantDetail = getCompositionDetail(variant.id);
			expect(defaultDetail?.steps[0].instruction).toEqual('Brown the mince well.');
			expect(variantDetail?.steps[0].instruction).toEqual('Brown the mince well.');
		});

		it("overrides a step's content in one composition without affecting others", () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Brown the mince.'
			});
			const beef = createIngredient({ baseTerm: 'beef mince' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);
			const variantDetail = getCompositionDetail(variant.id);
			const variantCompositionStepId = variantDetail!.steps[0].compositionStepId;

			const overridden = overrideStep(variantCompositionStepId, {
				instruction: 'Sauté the mushrooms.'
			});
			const mushrooms = createIngredient({ baseTerm: 'mushrooms' });
			addIngredientUsage(overridden.id, {
				ingredientId: mushrooms.id,
				quantityValue: 300,
				quantityUnit: 'g'
			});

			const defaultDetail = getCompositionDetail(defaultComposition.id);
			const updatedVariantDetail = getCompositionDetail(variant.id);

			expect(defaultDetail?.steps[0]).toMatchObject({
				instruction: 'Brown the mince.',
				isOverride: false
			});
			expect(defaultDetail?.steps[0].usages[0].ingredient.baseTerm).toEqual('beef mince');

			expect(updatedVariantDetail?.steps[0]).toMatchObject({
				instruction: 'Sauté the mushrooms.',
				isOverride: true
			});
			// The override starts as a copy of the slot's previous usages, on top
			// of which the author can add more.
			expect(updatedVariantDetail?.steps[0].usages.map((u) => u.ingredient.baseTerm)).toEqual([
				'beef mince',
				'mushrooms'
			]);

			// The original composition step id is stable across the override.
			expect(compositionStep.id).not.toEqual(variantCompositionStepId);
		});

		it('adds a step that exists only in one composition', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			addStep(variant.id, { instruction: 'Stir in jalapeño.' });

			expect(getCompositionDetail(variant.id)?.steps.map((s) => s.instruction)).toEqual([
				'Brown the mince.',
				'Stir in jalapeño.'
			]);
			expect(getCompositionDetail(defaultComposition.id)?.steps.map((s) => s.instruction)).toEqual([
				'Brown the mince.'
			]);
		});

		it('warns which other compositions reference a shared step before removal', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			const others = getOtherCompositionsReferencingStep(step.id, defaultComposition.id);
			expect(others.map((c) => c.id)).toEqual([variant.id]);
		});

		it('removing a step from only one composition leaves other compositions untouched', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Brown the mince.'
			});
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			removeStepFromComposition(compositionStep.id);

			expect(getCompositionDetail(defaultComposition.id)?.steps).toEqual([]);
			expect(getCompositionDetail(variant.id)?.steps).toHaveLength(1);
		});

		it('removing a step from every referencing composition drops it from the pool', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Brown the mince.'
			});
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			removeStepFromComposition(compositionStep.id, [variant.id]);

			expect(getCompositionDetail(defaultComposition.id)?.steps).toEqual([]);
			expect(getCompositionDetail(variant.id)?.steps).toEqual([]);
			expect(db.select().from(steps).where(eq(steps.id, step.id)).all()).toEqual([]);
		});

		it('removing an overridden step also removes its override step', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);
			const variantCompositionStepId = getCompositionDetail(variant.id)!.steps[0].compositionStepId;
			const overridden = overrideStep(variantCompositionStepId, {
				instruction: 'Sauté mushrooms.'
			});

			removeStepFromComposition(variantCompositionStepId);

			expect(getCompositionDetail(variant.id)?.steps).toEqual([]);
			expect(db.select().from(steps).where(eq(steps.id, overridden.id)).all()).toEqual([]);
		});

		it("re-overriding an already-overridden step carries over its usages, not the original pool step's", () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const beef = createIngredient({ baseTerm: 'beef mince' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);
			const compositionStepId = getCompositionDetail(variant.id)!.steps[0].compositionStepId;

			const firstOverride = overrideStep(compositionStepId, { instruction: 'Sauté mushrooms.' });
			const mushrooms = createIngredient({ baseTerm: 'mushrooms' });
			addIngredientUsage(firstOverride.id, {
				ingredientId: mushrooms.id,
				quantityValue: 300,
				quantityUnit: 'g'
			});

			overrideStep(compositionStepId, { instruction: 'Sauté mushrooms well.' });

			const usages = getCompositionDetail(variant.id)!.steps[0].usages;
			expect(usages.map((u) => u.ingredient.baseTerm)).toEqual(['beef mince', 'mushrooms']);
		});

		it('rejects removing a non-existent composition step', () => {
			expect(() => removeStepFromComposition(999999)).toThrow(CompositionStepNotFoundError);
		});

		it('renumbers remaining steps after a removal', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { compositionStep: first } = addStep(defaultComposition.id, { instruction: 'One.' });
			addStep(defaultComposition.id, { instruction: 'Two.' });
			addStep(defaultComposition.id, { instruction: 'Three.' });

			removeStepFromComposition(first.id);

			const detail = getCompositionDetail(defaultComposition.id);
			expect(detail?.steps.map((s) => s.instruction)).toEqual(['Two.', 'Three.']);
		});
	});

	describe('version history', () => {
		it('creates a first version alongside the recipe', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(listRecipeVersions(recipe.id)).toHaveLength(1);
		});

		it('creates a new version on the shared timeline for every edit to the pool or a composition', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);

			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Brown the mince.'
			});
			const beef = createIngredient({ baseTerm: 'beef mince' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });
			updateStepInstruction(step.id, 'Brown {{1}} of mince.');
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);
			removeStepFromComposition(compositionStep.id, [variant.id]);

			// create, addStep, addIngredientUsage, updateStepInstruction,
			// createVariant, removeStepFromComposition.
			expect(listRecipeVersions(recipe.id)).toHaveLength(6);
		});

		it('lists versions oldest first', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			addStep(defaultComposition.id, { instruction: 'Simmer.' });

			const versionIds = listRecipeVersions(recipe.id).map((v) => v.id);
			expect(versionIds).toEqual([...versionIds].sort((a, b) => a - b));
		});

		it('reverting restores the pool and every composition to that point, unambiguously', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			const [versionBeforeSecondStep] = listRecipeVersions(recipe.id).slice(-1);

			addStep(defaultComposition.id, { instruction: 'Simmer.' });
			const variantCompositionStepId = getCompositionDetail(variant.id)!.steps[0].compositionStepId;
			overrideStep(variantCompositionStepId, { instruction: 'Sauté mushrooms.' });

			expect(getCompositionDetail(defaultComposition.id)?.steps).toHaveLength(2);
			expect(getCompositionDetail(variant.id)?.steps[0].isOverride).toBe(true);

			revertToVersion(recipe.id, versionBeforeSecondStep.id);

			const restoredRecipe = getRecipe(recipe.id, defaultComposition.id);
			const restoredVariant = getRecipe(recipe.id, variant.id);
			expect(restoredRecipe?.composition.steps.map((s) => s.instruction)).toEqual([
				'Brown the mince.'
			]);
			expect(restoredVariant?.composition.steps.map((s) => s.instruction)).toEqual([
				'Brown the mince.'
			]);
			expect(restoredVariant?.composition.steps[0].isOverride).toBe(false);
			// The recipe still has a default and a variant composition after
			// reverting - lineage and composition count are restored too.
			expect(restoredRecipe?.compositions).toHaveLength(2);
		});

		it('reverting carries over ingredient usages exactly as they were at that version', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown {{1}} of mince.' });
			const beef = createIngredient({ baseTerm: 'beef mince' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const [versionWithOneUsage] = listRecipeVersions(recipe.id).slice(-1);

			const mushrooms = createIngredient({ baseTerm: 'mushrooms' });
			addIngredientUsage(step.id, {
				ingredientId: mushrooms.id,
				quantityValue: 200,
				quantityUnit: 'g'
			});

			revertToVersion(recipe.id, versionWithOneUsage.id);

			const detail = getRecipe(recipe.id, defaultComposition.id);
			expect(detail?.composition.steps[0].usages.map((u) => u.ingredient.baseTerm)).toEqual([
				'beef mince'
			]);
		});

		it('reverting appends a new version rather than truncating history', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

			const versionsBeforeRevert = listRecipeVersions(recipe.id);
			const target = versionsBeforeRevert[0];

			const newVersion = revertToVersion(recipe.id, target.id);

			const versionsAfterRevert = listRecipeVersions(recipe.id);
			expect(versionsAfterRevert).toHaveLength(versionsBeforeRevert.length + 1);
			expect(versionsAfterRevert.map((v) => v.id)).toEqual([
				...versionsBeforeRevert.map((v) => v.id),
				newVersion.id
			]);
			expect(newVersion.revertedFromVersionId).toEqual(target.id);
		});

		it('rejects reverting to a version from a different recipe', () => {
			const recipeA = createRecipe('Chilli con carne');
			const recipeB = createRecipe('Banana bread');
			const versionOfB = listRecipeVersions(recipeB.id)[0];

			expect(() => revertToVersion(recipeA.id, versionOfB.id)).toThrow(RecipeVersionNotFoundError);
		});

		it('rejects reverting to a non-existent version', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(() => revertToVersion(recipe.id, 999999)).toThrow(RecipeVersionNotFoundError);
		});
	});
});
