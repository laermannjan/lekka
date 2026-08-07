import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { cooks, recipeVersions, scalingFormulas, steps } from './db/schema';
import { createIngredient } from './ingredients';
import {
	addCookLogAnnotation,
	listAnnotationsForCooks,
	listCooksForRecipe,
	logCook
} from './cooks';
import { createProfile } from './profiles';
import type { RecipeSnapshot } from './recipe-versions';
import {
	BlankInstructionError,
	BlankTitleError,
	BlankVariantNameError,
	CompositionNotFoundError,
	CompositionStepNotFoundError,
	IngredientNotFoundError,
	IngredientUsageNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	InvalidServingsError,
	RecipeNotFoundError,
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
	setUsageAlternative,
	updateServings,
	updateStepInstruction
} from './recipes';
import {
	InvalidScalingFormulaError,
	ScalingStepNotFoundError,
	ScalingUsageNotFoundError,
	removeDurationScalingFormula,
	removeQuantityScalingFormula,
	setDurationScalingFormula,
	setQuantityScalingFormula
} from './scaling';

describe('recipes', () => {
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

	it('lists created most recently added first by default', () => {
		createRecipe('Chilli con carne');
		createRecipe('Banana bread');

		expect(listRecipes().map((r) => r.title)).toEqual(['Banana bread', 'Chilli con carne']);
	});

	describe('sorting and searching', () => {
		it('sorts alphabetically', () => {
			createRecipe('Chilli con carne');
			createRecipe('Banana bread');
			createRecipe('Apple pie');

			expect(listRecipes({ sort: 'alphabetical' }).map((r) => r.title)).toEqual([
				'Apple pie',
				'Banana bread',
				'Chilli con carne'
			]);
		});

		it('sorts by recently-added, newest first', () => {
			createRecipe('Chilli con carne');
			createRecipe('Banana bread');

			expect(listRecipes({ sort: 'recently-added' }).map((r) => r.title)).toEqual([
				'Banana bread',
				'Chilli con carne'
			]);
		});

		it('sorts by last-cooked, most recent first, recipes with no Cooks last', () => {
			const chilli = createRecipe('Chilli con carne');
			const banana = createRecipe('Banana bread');
			createRecipe('Apple pie');
			const profile = createProfile('Alex');
			const chilliComposition = getDefaultComposition(chilli.id);
			const bananaComposition = getDefaultComposition(banana.id);

			logCook(chilli.id, {
				compositionId: chilliComposition.id,
				actingProfileId: profile.id,
				dinerProfileIds: [],
				cookedAt: '2024-01-01',
				outcome: 'worked-well'
			});
			logCook(banana.id, {
				compositionId: bananaComposition.id,
				actingProfileId: profile.id,
				dinerProfileIds: [],
				cookedAt: '2024-06-01',
				outcome: 'worked-well'
			});

			expect(listRecipes({ sort: 'last-cooked' }).map((r) => r.title)).toEqual([
				'Banana bread',
				'Chilli con carne',
				'Apple pie'
			]);
		});

		it('sorts by most-cooked, recipes with no Cooks last', () => {
			const chilli = createRecipe('Chilli con carne');
			const banana = createRecipe('Banana bread');
			createRecipe('Apple pie');
			const profile = createProfile('Alex');
			const chilliComposition = getDefaultComposition(chilli.id);
			const bananaComposition = getDefaultComposition(banana.id);

			logCook(chilli.id, {
				compositionId: chilliComposition.id,
				actingProfileId: profile.id,
				dinerProfileIds: [],
				cookedAt: '2024-01-01',
				outcome: 'worked-well'
			});
			logCook(chilli.id, {
				compositionId: chilliComposition.id,
				actingProfileId: profile.id,
				dinerProfileIds: [],
				cookedAt: '2024-02-01',
				outcome: 'worked-well'
			});
			logCook(banana.id, {
				compositionId: bananaComposition.id,
				actingProfileId: profile.id,
				dinerProfileIds: [],
				cookedAt: '2024-06-01',
				outcome: 'worked-well'
			});

			expect(listRecipes({ sort: 'most-cooked' }).map((r) => r.title)).toEqual([
				'Chilli con carne',
				'Banana bread',
				'Apple pie'
			]);
		});

		it('searches by substring on title, case-insensitively', () => {
			createRecipe('Chilli con carne');
			createRecipe('Banana bread');
			createRecipe('Apple pie');

			expect(listRecipes({ search: 'an' }).map((r) => r.title)).toEqual(['Banana bread']);
			expect(listRecipes({ search: 'BREAD' }).map((r) => r.title)).toEqual(['Banana bread']);
			expect(listRecipes({ search: 'zzz' })).toEqual([]);
		});
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

		it('declares an alternative ingredient on the usage', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });

			const usage = addIngredientUsage(step.id, {
				ingredientId: butter.id,
				quantityValue: 100,
				quantityUnit: 'g',
				alternativeIngredientId: margarine.id
			});

			expect(usage.alternativeIngredientId).toEqual(margarine.id);
		});

		it('rejects a usage whose alternative ingredient does not exist', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });

			expect(() =>
				addIngredientUsage(step.id, {
					ingredientId: butter.id,
					quantityValue: 100,
					alternativeIngredientId: 999999
				})
			).toThrow(IngredientNotFoundError);
		});

		it('defaults to no alternative ingredient', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });

			const usage = addIngredientUsage(step.id, { ingredientId: butter.id, quantityValue: 100 });

			expect(usage.alternativeIngredientId).toBeNull();
		});
	});

	describe('setUsageAlternative', () => {
		it('sets an alternative on an existing usage', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });
			const usage = addIngredientUsage(step.id, { ingredientId: butter.id, quantityValue: 100 });

			const updated = setUsageAlternative(usage.id, margarine.id);

			expect(updated.alternativeIngredientId).toEqual(margarine.id);
		});

		it('clears an alternative when passed null', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: butter.id,
				quantityValue: 100,
				alternativeIngredientId: margarine.id
			});

			const updated = setUsageAlternative(usage.id, null);

			expect(updated.alternativeIngredientId).toBeNull();
		});

		it('rejects an alternative ingredient that does not exist', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });
			const usage = addIngredientUsage(step.id, { ingredientId: butter.id, quantityValue: 100 });

			expect(() => setUsageAlternative(usage.id, 999999)).toThrow(IngredientNotFoundError);
		});

		it('throws when the usage does not exist', () => {
			expect(() => setUsageAlternative(999999, null)).toThrow(IngredientUsageNotFoundError);
		});

		it('scopes the alternative to this usage only, not other usages of the same ingredient', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step: step1 } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const { step: step2 } = addStep(defaultComposition.id, {
				instruction: 'Spread the butter.'
			});
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });

			addIngredientUsage(step1.id, {
				ingredientId: butter.id,
				quantityValue: 100,
				alternativeIngredientId: margarine.id
			});
			const secondUsage = addIngredientUsage(step2.id, {
				ingredientId: butter.id,
				quantityValue: 20
			});

			expect(secondUsage.alternativeIngredientId).toBeNull();
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

		it("resolves a usage's alternative ingredient to its full record", () => {
			const recipe = createRecipe('Pancakes');
			const defaultComposition = getDefaultComposition(recipe.id);
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			addIngredientUsage(step.id, {
				ingredientId: butter.id,
				quantityValue: 50,
				quantityUnit: 'g',
				alternativeIngredientId: margarine.id
			});

			const detail = getRecipe(recipe.id);

			expect(detail?.composition.steps[0].usages[0].alternativeIngredient).toMatchObject({
				id: margarine.id,
				baseTerm: 'margarine'
			});
		});

		it('leaves alternativeIngredient null when no alternative was declared', () => {
			const recipe = createRecipe('Pancakes');
			const defaultComposition = getDefaultComposition(recipe.id);
			const butter = createIngredient({ baseTerm: 'butter' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			addIngredientUsage(step.id, { ingredientId: butter.id, quantityValue: 50 });

			const detail = getRecipe(recipe.id);

			expect(detail?.composition.steps[0].usages[0].alternativeIngredient).toBeNull();
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

		it("carries a usage's alternative ingredient through a variant seed and a step override", () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Melt the butter.' });
			const butter = createIngredient({ baseTerm: 'butter' });
			const margarine = createIngredient({ baseTerm: 'margarine' });
			addIngredientUsage(step.id, {
				ingredientId: butter.id,
				quantityValue: 50,
				quantityUnit: 'g',
				alternativeIngredientId: margarine.id
			});

			const variant = createVariant(recipe.id, 'Vegan', defaultComposition.id);
			const seededDetail = getCompositionDetail(variant.id);
			expect(seededDetail?.steps[0].usages[0].alternativeIngredient?.baseTerm).toEqual('margarine');

			const variantCompositionStepId = seededDetail!.steps[0].compositionStepId;
			overrideStep(variantCompositionStepId, { instruction: 'Melt the butter carefully.' });

			const overriddenDetail = getCompositionDetail(variant.id);
			expect(overriddenDetail?.steps[0].usages[0].alternativeIngredient?.baseTerm).toEqual(
				'margarine'
			);
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

	describe('servings', () => {
		it('defaults a new recipe to 4 servings', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(recipe.servings).toEqual(4);
		});

		it('accepts an explicit servings count on creation', () => {
			const recipe = createRecipe('Chilli con carne', 6);
			expect(recipe.servings).toEqual(6);
		});

		it('rejects a non-positive or non-integer servings count', () => {
			expect(() => createRecipe('Chilli con carne', 0)).toThrow(InvalidServingsError);
			expect(() => createRecipe('Chilli con carne', -1)).toThrow(InvalidServingsError);
			expect(() => createRecipe('Chilli con carne', 2.5)).toThrow(InvalidServingsError);
		});

		it('updates a recipe’s usual servings', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const updated = updateServings(recipe.id, 8);
			expect(updated.servings).toEqual(8);
		});

		it('rejects updating servings on a non-existent recipe', () => {
			expect(() => updateServings(999999, 4)).toThrow(RecipeNotFoundError);
		});

		it('records a version when the usual servings change', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const versionsBefore = listRecipeVersions(recipe.id);

			updateServings(recipe.id, 8);

			expect(listRecipeVersions(recipe.id)).toHaveLength(versionsBefore.length + 1);
		});

		it('recomputes every usage quantity linearly by default when servings change', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown {{1}} of mince.' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(1000);
			expect(at8?.composition.steps[0].renderedInstruction).toEqual('Brown 1000 g of mince.');

			const at2 = getRecipe(recipe.id, undefined, 2);
			expect(at2?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(250);
		});

		it('leaves a duration constant by default when servings change', () => {
			const recipe = createRecipe('Bread', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let rise.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps.find((s) => s.id === step.id)?.scaledDurationMin).toEqual(60);
		});
	});

	describe('quantity scaling formulas', () => {
		it('rejects an unknown kind', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const usage = addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500 });

			expect(() =>
				// @ts-expect-error deliberately invalid kind
				setQuantityScalingFormula(usage.id, { kind: 'bogus' })
			).toThrow(InvalidScalingFormulaError);
		});

		it('rejects the vs_other_usage template on a Quantity', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
			const usage = addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500 });

			expect(() =>
				setQuantityScalingFormula(usage.id, {
					kind: 'vs_other_usage',
					otherUsageId: usage.id,
					perUnitAmount: 1,
					direction: 'increase',
					thresholdSide: 'short'
				})
			).toThrow(InvalidScalingFormulaError);
		});

		it('rejects a non-existent usage', () => {
			expect(() => setQuantityScalingFormula(999999, { kind: 'fixed' })).toThrow(
				ScalingUsageNotFoundError
			);
		});

		it('applies a rate_vs_servings formula slower than linear', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const salt = createIngredient({ baseTerm: 'salt' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Add {{1}} salt.' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: salt.id,
				quantityValue: 1,
				quantityUnit: 'tsp'
			});

			setQuantityScalingFormula(usage.id, { kind: 'rate_vs_servings', ratePercent: 50 });

			const at8 = getRecipe(recipe.id, undefined, 8);
			// linear would be 2 tsp; at 50% rate it's 1.5 tsp
			expect(at8?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(1.5);
		});

		it('keeps a fixed quantity unchanged regardless of servings', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const chili = createIngredient({ baseTerm: 'chili flakes' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Add {{1}}.' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: chili.id,
				quantityValue: 1,
				quantityUnit: 'pinch'
			});

			setQuantityScalingFormula(usage.id, { kind: 'fixed' });

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(1);
		});

		it('replaces a previous formula rather than stacking', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const salt = createIngredient({ baseTerm: 'salt' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Add salt.' });
			const usage = addIngredientUsage(step.id, { ingredientId: salt.id, quantityValue: 1 });

			setQuantityScalingFormula(usage.id, { kind: 'rate_vs_servings', ratePercent: 50 });
			setQuantityScalingFormula(usage.id, { kind: 'fixed' });

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(1);
		});

		it('removes a formula, reverting to default linear scaling', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const salt = createIngredient({ baseTerm: 'salt' });
			const { step } = addStep(defaultComposition.id, { instruction: 'Add salt.' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: salt.id,
				quantityValue: 1
			});

			setQuantityScalingFormula(usage.id, { kind: 'fixed' });
			removeQuantityScalingFormula(usage.id);

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(2);
		});
	});

	describe('duration scaling formulas', () => {
		it('rejects attaching a formula to a step with no duration', () => {
			const recipe = createRecipe('Chilli con carne', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Preheat.' });

			expect(() => setDurationScalingFormula(step.id, { kind: 'fixed' })).toThrow(
				InvalidScalingFormulaError
			);
		});

		it('rejects a non-existent step', () => {
			expect(() => setDurationScalingFormula(999999, { kind: 'fixed' })).toThrow(
				ScalingStepNotFoundError
			);
		});

		it('applies a rate_vs_servings formula to a duration', () => {
			const recipe = createRecipe('Bread', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let rise.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps.find((s) => s.id === step.id)?.scaledDurationMin).toEqual(120);
		});

		it('rejects vs_other_usage referencing a usage from a different step', () => {
			const recipe = createRecipe('Bread', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const flour = createIngredient({ baseTerm: 'flour' });
			const { step: otherStep } = addStep(defaultComposition.id, { instruction: 'Mix flour.' });
			const otherUsage = addIngredientUsage(otherStep.id, {
				ingredientId: flour.id,
				quantityValue: 200
			});
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let rise.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});

			expect(() =>
				setDurationScalingFormula(step.id, {
					kind: 'vs_other_usage',
					otherUsageId: otherUsage.id,
					perUnitAmount: 3,
					direction: 'increase',
					thresholdSide: 'short'
				})
			).toThrow(InvalidScalingFormulaError);
		});

		it('applies a vs_other_usage formula, increasing as the reference falls short', () => {
			const recipe = createRecipe('Bread', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const starter = createIngredient({ baseTerm: 'sourdough starter' });
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let {{1}} rise.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});
			const starterUsage = addIngredientUsage(step.id, {
				ingredientId: starter.id,
				quantityValue: 100,
				quantityUnit: 'g'
			});

			setDurationScalingFormula(step.id, {
				kind: 'vs_other_usage',
				otherUsageId: starterUsage.id,
				perUnitAmount: 3,
				direction: 'increase',
				thresholdSide: 'short'
			});

			// halving servings halves the starter usage too (100g -> 50g, 50g short)
			const at2 = getRecipe(recipe.id, undefined, 2);
			expect(at2?.composition.steps[0].scaledDurationMin).toEqual(240 + 3 * 50);

			// at usual servings, the reference usage is at its usual quantity
			const at4 = getRecipe(recipe.id, undefined, 4);
			expect(at4?.composition.steps[0].scaledDurationMin).toEqual(240);
		});

		it('removes a duration formula, reverting to default constant', () => {
			const recipe = createRecipe('Bread', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let rise.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });
			removeDurationScalingFormula(step.id);

			const at8 = getRecipe(recipe.id, undefined, 8);
			expect(at8?.composition.steps.find((s) => s.id === step.id)?.scaledDurationMin).toEqual(60);
		});
	});

	// A Scaling Formula is part of a Step's content, so it has to travel with
	// that content wherever a Step is copied into a fresh Step row - overriding
	// a slot, and seeding a Variant from a Composition holding an override.
	describe('scaling formulas across step copies', () => {
		// A salt usage scaling at half the rate of servings: 10 g at a base of 4
		// resolves to 15 at 8, not the strict-linear 20.
		function saltAtHalfRate(recipeTitle = 'Chilli con carne') {
			const recipe = createRecipe(recipeTitle, 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Season the pot.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});
			const salt = createIngredient({ baseTerm: 'salt' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: salt.id,
				quantityValue: 10,
				quantityUnit: 'g'
			});
			setQuantityScalingFormula(usage.id, { kind: 'rate_vs_servings', ratePercent: 50 });
			return { recipe, defaultComposition, step, compositionStep, usage };
		}

		// A rise time that lengthens by 3 minutes for every gram of starter the
		// scaled quantity falls short of its usual 100 g.
		function starterVsRiseTime() {
			const recipe = createRecipe('Sourdough', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step, compositionStep } = addStep(defaultComposition.id, {
				instruction: 'Let {{1}} rise.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});
			const starter = createIngredient({ baseTerm: 'sourdough starter' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: starter.id,
				quantityValue: 100,
				quantityUnit: 'g'
			});
			setDurationScalingFormula(step.id, {
				kind: 'vs_other_usage',
				otherUsageId: usage.id,
				perUnitAmount: 3,
				direction: 'increase',
				thresholdSide: 'short'
			});
			return { recipe, defaultComposition, step, compositionStep, usage };
		}

		it("carries a usage's quantity scaling formula through a step override", () => {
			const { recipe, defaultComposition, compositionStep } = saltAtHalfRate();

			const before = getRecipe(recipe.id, defaultComposition.id, 8);
			expect(before?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(15);

			overrideStep(compositionStep.id, {
				instruction: 'Season the pot generously.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 8);
			const copiedUsage = after!.composition.steps[0].usages[0];
			expect(copiedUsage.scaledQuantityValue).toEqual(15);
			expect(copiedUsage.scalingFormula).toMatchObject({
				kind: 'rate_vs_servings',
				ratePercent: 50,
				// keyed to the copied usage, not the one it was copied from
				ingredientUsageId: copiedUsage.id
			});
		});

		it("carries a step's duration scaling formula through a step override", () => {
			const { recipe, defaultComposition, step, compositionStep } = saltAtHalfRate();
			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });

			const before = getRecipe(recipe.id, defaultComposition.id, 8);
			expect(before?.composition.steps[0].scaledDurationMin).toEqual(120);

			const overridden = overrideStep(compositionStep.id, {
				instruction: 'Season the pot generously.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 8);
			expect(after?.composition.steps[0].scaledDurationMin).toEqual(120);
			expect(after?.composition.steps[0].durationScalingFormula).toMatchObject({
				kind: 'rate_vs_servings',
				ratePercent: 100,
				stepId: overridden.id
			});
		});

		it('remaps a vs_other_usage duration formula onto the copied usage on override', () => {
			const { recipe, defaultComposition, compositionStep } = starterVsRiseTime();

			// halving servings halves the starter usage too (100g -> 50g, 50g short)
			const before = getRecipe(recipe.id, defaultComposition.id, 2);
			expect(before?.composition.steps[0].scaledDurationMin).toEqual(240 + 3 * 50);

			overrideStep(compositionStep.id, {
				instruction: 'Let {{1}} rise, covered.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 2);
			const copiedStep = after!.composition.steps[0];
			expect(copiedStep.scaledDurationMin).toEqual(240 + 3 * 50);
			expect(copiedStep.durationScalingFormula?.otherUsageId).toEqual(copiedStep.usages[0].id);
		});

		it('drops a duration formula whose override no longer has a duration to scale', () => {
			const { recipe, defaultComposition, step, compositionStep } = saltAtHalfRate();
			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });

			const overridden = overrideStep(compositionStep.id, { instruction: 'Season the pot.' });

			const after = getRecipe(recipe.id, defaultComposition.id, 8);
			expect(after?.composition.steps[0].durationScalingFormula).toBeNull();
			expect(
				db.select().from(scalingFormulas).where(eq(scalingFormulas.stepId, overridden.id)).all()
			).toEqual([]);
		});

		it('drops a vs_other_usage duration formula when the override changes the duration unit', () => {
			const { recipe, defaultComposition, compositionStep } = starterVsRiseTime();

			// the same 4 hours the source Step stated as 240 minutes: the rule's
			// "3 per gram short" was authored in minutes and means nothing per hour
			const overridden = overrideStep(compositionStep.id, {
				instruction: 'Let {{1}} rise, covered.',
				duration: { kind: 'wait', min: 4, unit: 'hours' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 2);
			const copiedStep = after!.composition.steps[0];
			expect(copiedStep.durationScalingFormula).toBeNull();
			// the duration stays as written rather than picking up 3 hours per gram
			expect(copiedStep.scaledDurationMin).toEqual(4);
			expect(
				db.select().from(scalingFormulas).where(eq(scalingFormulas.stepId, overridden.id)).all()
			).toEqual([]);
		});

		it('carries a unit-independent duration formula through a duration unit change', () => {
			const { recipe, defaultComposition, step, compositionStep } = saltAtHalfRate();
			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });

			const overridden = overrideStep(compositionStep.id, {
				instruction: 'Season the pot generously.',
				duration: { kind: 'wait', min: 1, unit: 'hours' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 8);
			expect(after?.composition.steps[0].scaledDurationMin).toEqual(2);
			expect(after?.composition.steps[0].durationScalingFormula).toMatchObject({
				kind: 'rate_vs_servings',
				ratePercent: 100,
				stepId: overridden.id
			});
		});

		it('carries the scaling formulas of an overridden slot into a variant seeded from it', () => {
			const { recipe, defaultComposition, step, compositionStep } = saltAtHalfRate();
			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });
			overrideStep(compositionStep.id, {
				instruction: 'Season the pot generously.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

			const source = getRecipe(recipe.id, defaultComposition.id, 8);
			const seeded = getRecipe(recipe.id, variant.id, 8);
			expect(seeded?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(
				source!.composition.steps[0].usages[0].scaledQuantityValue
			);
			expect(seeded?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(15);
			expect(seeded?.composition.steps[0].scaledDurationMin).toEqual(120);
			// each copy owns its own formula rows, keyed to its own step and usages
			expect(seeded?.composition.steps[0].usages[0].scalingFormula?.ingredientUsageId).toEqual(
				seeded?.composition.steps[0].usages[0].id
			);
			expect(seeded?.composition.steps[0].durationScalingFormula?.stepId).toEqual(
				seeded?.composition.steps[0].id
			);
		});

		it('remaps a vs_other_usage duration formula when a variant is seeded from an override', () => {
			const { recipe, defaultComposition, compositionStep } = starterVsRiseTime();
			overrideStep(compositionStep.id, {
				instruction: 'Let {{1}} rise, covered.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});

			const variant = createVariant(recipe.id, 'Overnight', defaultComposition.id);

			const seeded = getRecipe(recipe.id, variant.id, 2);
			const seededStep = seeded!.composition.steps[0];
			expect(seededStep.scaledDurationMin).toEqual(240 + 3 * 50);
			expect(seededStep.durationScalingFormula?.otherUsageId).toEqual(seededStep.usages[0].id);
		});

		it('re-overriding an already-overridden step keeps the formulas it just copied', () => {
			const { recipe, defaultComposition, step, compositionStep } = saltAtHalfRate();
			setDurationScalingFormula(step.id, { kind: 'rate_vs_servings', ratePercent: 100 });

			overrideStep(compositionStep.id, {
				instruction: 'Season the pot generously.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});
			const second = overrideStep(compositionStep.id, {
				instruction: 'Season the pot very generously.',
				duration: { kind: 'wait', min: 60, unit: 'minutes' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 8);
			const reOverridden = after!.composition.steps[0];
			expect(reOverridden.usages[0].scaledQuantityValue).toEqual(15);
			expect(reOverridden.scaledDurationMin).toEqual(120);
			expect(reOverridden.usages[0].scalingFormula?.ingredientUsageId).toEqual(
				reOverridden.usages[0].id
			);
			// the discarded override step took its own formula rows with it, and
			// left the pool step's alone: one quantity and one duration formula
			// each for the pool step and the live override, nothing stale.
			const allFormulas = db.select().from(scalingFormulas).all();
			expect(allFormulas).toHaveLength(4);
			const durationFormulaStepIds = allFormulas.flatMap((f) =>
				f.stepId === null ? [] : [f.stepId]
			);
			expect(durationFormulaStepIds.sort((a, b) => a - b)).toEqual([step.id, second.id]);
		});

		it('re-overriding keeps a vs_other_usage duration formula from cascading away', () => {
			const { recipe, defaultComposition, compositionStep } = starterVsRiseTime();

			overrideStep(compositionStep.id, {
				instruction: 'Let {{1}} rise, covered.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});
			overrideStep(compositionStep.id, {
				instruction: 'Let {{1}} rise, covered, overnight.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});

			const after = getRecipe(recipe.id, defaultComposition.id, 2);
			const reOverridden = after!.composition.steps[0];
			expect(reOverridden.scaledDurationMin).toEqual(240 + 3 * 50);
			expect(reOverridden.durationScalingFormula?.otherUsageId).toEqual(reOverridden.usages[0].id);
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

		it('reverting restores each usage’s Alternative Ingredient as it was at that version', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, { instruction: 'Brown {{1}} of mince.' });
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const turkey = createIngredient({ baseTerm: 'turkey mince' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: beef.id,
				quantityValue: 500,
				quantityUnit: 'g',
				alternativeIngredientId: turkey.id
			});

			const [versionWithAlternative] = listRecipeVersions(recipe.id).slice(-1);

			setUsageAlternative(usage.id, null);
			expect(
				getRecipe(recipe.id, defaultComposition.id)?.composition.steps[0].usages[0]
					.alternativeIngredient
			).toBeNull();

			revertToVersion(recipe.id, versionWithAlternative.id);

			const restoredUsage = getRecipe(recipe.id, defaultComposition.id)?.composition.steps[0]
				.usages[0];
			expect(restoredUsage?.alternativeIngredient?.baseTerm).toEqual('turkey mince');
		});

		it('reverting restores each usage’s and step’s Scaling Formula as it was at that version', () => {
			const recipe = createRecipe('Chilli con carne');
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Brown {{1}} of mince.',
				duration: { kind: 'active', min: 10, unit: 'minutes' }
			});
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: beef.id,
				quantityValue: 500,
				quantityUnit: 'g'
			});
			setQuantityScalingFormula(usage.id, { kind: 'rate_vs_servings', ratePercent: 50 });
			setDurationScalingFormula(step.id, { kind: 'fixed' });

			const [versionWithFormulas] = listRecipeVersions(recipe.id).slice(-1);

			removeQuantityScalingFormula(usage.id);
			removeDurationScalingFormula(step.id);

			revertToVersion(recipe.id, versionWithFormulas.id);

			const restoredStep = getRecipe(recipe.id, defaultComposition.id)?.composition.steps[0];
			expect(restoredStep?.usages[0].scalingFormula?.kind).toEqual('rate_vs_servings');
			expect(restoredStep?.usages[0].scalingFormula?.ratePercent).toEqual(50);
			expect(restoredStep?.durationScalingFormula?.kind).toEqual('fixed');
		});

		// A Formula is rebuilt by every revert, so `otherUsageId` goes through
		// the same remap as `stepId` and `ingredientUsageId` - onto whichever
		// row the revert leaves the target Usage on. A Usage the target Version
		// still holds keeps its own id (#51), so the remap is the identity here;
		// it is a fresh id only for a Usage the revert has to re-insert.
		it('reverting remaps a vs_other_usage duration formula onto the restored usage', () => {
			const recipe = createRecipe('Sourdough', 4);
			const defaultComposition = getDefaultComposition(recipe.id);
			const { step } = addStep(defaultComposition.id, {
				instruction: 'Let {{1}} rise.',
				duration: { kind: 'wait', min: 240, unit: 'minutes' }
			});
			const starter = createIngredient({ baseTerm: 'sourdough starter' });
			const usage = addIngredientUsage(step.id, {
				ingredientId: starter.id,
				quantityValue: 100,
				quantityUnit: 'g'
			});
			setDurationScalingFormula(step.id, {
				kind: 'vs_other_usage',
				otherUsageId: usage.id,
				perUnitAmount: 3,
				direction: 'increase',
				thresholdSide: 'short'
			});

			const [versionWithFormula] = listRecipeVersions(recipe.id).slice(-1);

			removeDurationScalingFormula(step.id);

			revertToVersion(recipe.id, versionWithFormula.id);

			const restoredStep = getRecipe(recipe.id, defaultComposition.id, 2)?.composition.steps[0];
			expect(restoredStep?.durationScalingFormula).toMatchObject({
				kind: 'vs_other_usage',
				perUnitAmount: 3,
				stepId: restoredStep!.id,
				// the live Usage the revert leaves on the Step
				otherUsageId: restoredStep!.usages[0].id
			});
			// and that Usage is the same row it was before the revert, not a copy
			// of it - what keeps a Cook Log Annotation pinned to it (#51)
			expect(restoredStep!.usages[0].id).toEqual(usage.id);
			// and it still computes: 100g -> 50g at half servings, 3 minutes a gram
			expect(restoredStep?.scaledDurationMin).toEqual(240 + 3 * 50);
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

		// A Cook is append-only household history, never a part of the Recipe a
		// Version restores (see CONTEXT.md's Cook). Reverting used to rebuild the
		// Recipe by deleting every Composition and Step, which cascade-deleted
		// every Cook, Cook Diner and Cook Log Annotation with them - silently,
		// and invisibly to the whole suite (#51).
		describe('cook history across a revert', () => {
			// A Recipe whose first Step - and the Version holding just it - predate
			// a second Step, so reverting to that Version really does change the
			// Recipe rather than being a no-op.
			function recipeWithVersionBeforeSecondStep() {
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				const { step } = addStep(defaultComposition.id, { instruction: 'Brown {{1}} of mince.' });
				const beef = createIngredient({ baseTerm: 'beef mince' });
				const usage = addIngredientUsage(step.id, {
					ingredientId: beef.id,
					quantityValue: 500,
					quantityUnit: 'g'
				});

				const [target] = listRecipeVersions(recipe.id).slice(-1);
				addStep(defaultComposition.id, { instruction: 'Simmer.' });

				return { recipe, defaultComposition, step, usage, target };
			}

			it('leaves every Cook intact, with its Diners', () => {
				const jan = createProfile('Jan');
				const alex = createProfile('Alex');
				const { recipe, defaultComposition, target } = recipeWithVersionBeforeSecondStep();

				logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id, alex.id],
					cookedAt: '2026-08-01',
					outcome: 'worked-well',
					summary: 'Needed more chipotle.'
				});

				revertToVersion(recipe.id, target.id);

				const cooksAfter = listCooksForRecipe(recipe.id);
				expect(cooksAfter).toHaveLength(1);
				expect(cooksAfter[0].summary).toEqual('Needed more chipotle.');
				expect(cooksAfter[0].outcome).toEqual('worked-well');
				expect(cooksAfter[0].actingProfile?.name).toEqual('Jan');
				expect(cooksAfter[0].diners.map((d) => d.name).sort()).toEqual(['Alex', 'Jan']);
				expect(db.select().from(cooks).where(eq(cooks.recipeId, recipe.id)).all()).toHaveLength(1);
			});

			it('keeps each Cook pointing at the Composition it was cooked on', () => {
				const jan = createProfile('Jan');
				const { recipe, defaultComposition, target } = recipeWithVersionBeforeSecondStep();

				logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'worked-well'
				});

				revertToVersion(recipe.id, target.id);

				expect(listCooksForRecipe(recipe.id)[0].compositionId).toEqual(defaultComposition.id);
			});

			it('keeps a Cook whose Composition the revert removes, with nothing left to point at', () => {
				const jan = createProfile('Jan');
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

				const [versionBeforeVariant] = listRecipeVersions(recipe.id).slice(-1);
				const variant = createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

				const cook = logCook(recipe.id, {
					compositionId: variant.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'worked-well',
					summary: 'The sin carne line.'
				});

				revertToVersion(recipe.id, versionBeforeVariant.id);

				const cooksAfter = listCooksForRecipe(recipe.id);
				expect(cooksAfter.map((c) => c.id)).toEqual([cook.id]);
				expect(cooksAfter[0].summary).toEqual('The sin carne line.');
				expect(cooksAfter[0].diners.map((d) => d.name)).toEqual(['Jan']);
				expect(cooksAfter[0].compositionId).toBeNull();
			});

			it('keeps each Cook Log Annotation pinned to the Step or Usage it was written against', () => {
				const jan = createProfile('Jan');
				const { recipe, defaultComposition, step, usage, target } =
					recipeWithVersionBeforeSecondStep();

				const cook = logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'needs-tweaks'
				});
				addCookLogAnnotation(cook.id, { stepId: step.id, note: 'Browned it far too long.' });
				addCookLogAnnotation(cook.id, { ingredientUsageId: usage.id, note: 'Used turkey mince.' });

				revertToVersion(recipe.id, target.id);

				const annotations = listAnnotationsForCooks([cook.id]).get(cook.id) ?? [];
				expect(annotations.map((a) => a.note)).toEqual([
					'Browned it far too long.',
					'Used turkey mince.'
				]);

				// Still pointing at the live rows, not at ids the revert orphaned.
				const restoredStep = getRecipe(recipe.id, defaultComposition.id)!.composition.steps[0];
				expect(annotations[0].stepId).toEqual(restoredStep.id);
				expect(annotations[1].ingredientUsageId).toEqual(restoredStep.usages[0].id);
			});

			// The boundary docs/adr/0005 draws: an Annotation is a pointer into the
			// Recipe as it currently stands, so one pinned to a Step the revert
			// genuinely removes goes with it. The Cook itself does not.
			it('drops an Annotation pinned to a Step the revert removes, keeping the Cook', () => {
				const jan = createProfile('Jan');
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

				const [target] = listRecipeVersions(recipe.id).slice(-1);
				const { step: laterStep } = addStep(defaultComposition.id, { instruction: 'Simmer.' });

				const cook = logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'needs-tweaks',
					summary: 'Simmered it dry.'
				});
				addCookLogAnnotation(cook.id, { stepId: laterStep.id, note: 'Boiled over.' });

				revertToVersion(recipe.id, target.id);

				expect(listAnnotationsForCooks([cook.id]).get(cook.id)).toBeUndefined();
				expect(listCooksForRecipe(recipe.id).map((c) => c.summary)).toEqual(['Simmered it dry.']);
			});

			it('keeps Annotations pinned when the same Version is reverted to twice', () => {
				const jan = createProfile('Jan');
				const { recipe, defaultComposition, step, target } = recipeWithVersionBeforeSecondStep();

				const cook = logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'needs-tweaks'
				});
				addCookLogAnnotation(cook.id, { stepId: step.id, note: 'Browned it far too long.' });

				revertToVersion(recipe.id, target.id);
				addStep(defaultComposition.id, { instruction: 'Simmer again.' });
				revertToVersion(recipe.id, target.id);

				const annotations = listAnnotationsForCooks([cook.id]).get(cook.id) ?? [];
				const restoredStep = getRecipe(recipe.id, defaultComposition.id)!.composition.steps[0];
				expect(annotations.map((a) => a.stepId)).toEqual([restoredStep.id]);
			});

			// The same loss as #51, one revert deeper: the first revert has to
			// re-create a Step the Recipe had dropped, and everything logged
			// against that re-created row is at the mercy of what the *second*
			// revert does with it. Restoring under the snapshot's own id is what
			// makes a Version restore the same Recipe every time it's applied.
			it('keeps an Annotation written against a Step an earlier revert re-created', () => {
				const jan = createProfile('Jan');
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
				const { compositionStep: simmer } = addStep(defaultComposition.id, {
					instruction: 'Simmer.'
				});

				const [target] = listRecipeVersions(recipe.id).slice(-1);
				removeStepFromComposition(simmer.id);
				revertToVersion(recipe.id, target.id);

				// Written against the Step as the first revert brought it back.
				const recreated = getRecipe(recipe.id, defaultComposition.id)!.composition.steps[1];
				const cook = logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'needs-tweaks'
				});
				addCookLogAnnotation(cook.id, { stepId: recreated.id, note: 'Simmered it dry.' });

				addStep(defaultComposition.id, { instruction: 'Season.' });
				revertToVersion(recipe.id, target.id);

				const annotations = listAnnotationsForCooks([cook.id]).get(cook.id) ?? [];
				expect(annotations.map((a) => a.note)).toEqual(['Simmered it dry.']);
				const stepsAfter = getRecipe(recipe.id, defaultComposition.id)!.composition.steps;
				expect(stepsAfter.map((s) => s.instruction)).toEqual(['Brown the mince.', 'Simmer.']);
				expect(annotations[0].stepId).toEqual(stepsAfter[1].id);
			});

			// The other edge of that boundary: an Annotation names a place in the
			// Recipe, not a version of its text, so it stays put when a revert
			// rewrites the instruction under it - exactly as it does when the
			// instruction is edited directly. Dropping it instead would destroy
			// Cook history to protect a caption (see docs/adr/0005).
			it('keeps an Annotation pinned to a Step whose instruction the revert rewrites', () => {
				const jan = createProfile('Jan');
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				const { step } = addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

				const [target] = listRecipeVersions(recipe.id).slice(-1);
				updateStepInstruction(step.id, 'Sauté the onions.');

				const cook = logCook(recipe.id, {
					compositionId: defaultComposition.id,
					actingProfileId: jan.id,
					dinerProfileIds: [jan.id],
					cookedAt: '2026-08-01',
					outcome: 'needs-tweaks'
				});
				addCookLogAnnotation(cook.id, { stepId: step.id, note: 'Onions burned.' });

				revertToVersion(recipe.id, target.id);

				const annotations = listAnnotationsForCooks([cook.id]).get(cook.id) ?? [];
				expect(annotations.map((a) => a.note)).toEqual(['Onions burned.']);
				expect(annotations[0].stepId).toEqual(step.id);
				// The Step reads as the restored Version has it, and the Cook still
				// records the Version it was cooked at, whose snapshot holds the
				// instruction the note was written against.
				const restored = getRecipe(recipe.id, defaultComposition.id)!.composition.steps[0];
				expect(restored.instruction).toEqual('Brown the mince.');
			});

			// Variant order is creation order, and a revert that brings a Variant
			// back is restoring the one that was there - not creating a newer one
			// that jumps to the end of the recipe page's tabs.
			it('restores a removed Variant to its old place in the Variant list', () => {
				const recipe = createRecipe('Chilli con carne');
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });
				createVariant(recipe.id, 'Chilli sin carne', defaultComposition.id);

				const [target] = listRecipeVersions(recipe.id).slice(-1);
				const later = createVariant(recipe.id, 'Chilli con pollo', defaultComposition.id);
				// Reverting past `later` removes it; reverting back to it restores
				// the sin carne line, which was created first.
				const [withBoth] = listRecipeVersions(recipe.id).slice(-1);
				revertToVersion(recipe.id, target.id);
				revertToVersion(recipe.id, withBoth.id);

				expect(listCompositions(recipe.id).map((c) => c.name)).toEqual([
					null,
					'Chilli sin carne',
					'Chilli con pollo'
				]);
				expect(listCompositions(recipe.id).map((c) => c.id)).toContain(later.id);
			});

			it('leaves the last-cooked and most-cooked browse sorts untouched', () => {
				const profile = createProfile('Alex');
				const {
					recipe: chilli,
					defaultComposition: chilliComposition,
					target
				} = recipeWithVersionBeforeSecondStep();
				const banana = createRecipe('Banana bread');
				const bananaComposition = getDefaultComposition(banana.id);
				createRecipe('Apple pie');

				logCook(chilli.id, {
					compositionId: chilliComposition.id,
					actingProfileId: profile.id,
					dinerProfileIds: [],
					cookedAt: '2024-01-01',
					outcome: 'worked-well'
				});
				logCook(chilli.id, {
					compositionId: chilliComposition.id,
					actingProfileId: profile.id,
					dinerProfileIds: [],
					cookedAt: '2024-02-01',
					outcome: 'worked-well'
				});
				logCook(banana.id, {
					compositionId: bananaComposition.id,
					actingProfileId: profile.id,
					dinerProfileIds: [],
					cookedAt: '2024-06-01',
					outcome: 'worked-well'
				});

				revertToVersion(chilli.id, target.id);

				expect(listRecipes({ sort: 'last-cooked' }).map((r) => r.title)).toEqual([
					'Banana bread',
					'Chilli con carne',
					'Apple pie'
				]);
				expect(listRecipes({ sort: 'most-cooked' }).map((r) => r.title)).toEqual([
					'Chilli con carne',
					'Banana bread',
					'Apple pie'
				]);
			});
		});

		// Base servings (see CONTEXT.md) is part of the whole Recipe a Version
		// restores; `RecipeSnapshot.servings` says why. These cover both halves
		// of #56: changing it used to record no Version at all, and the snapshot
		// had no field to carry it.
		describe('base servings across a revert', () => {
			it('carries the base servings in the version snapshot', () => {
				const recipe = createRecipe('Chilli con carne', 4);

				const [version] = listRecipeVersions(recipe.id).slice(-1);
				expect((JSON.parse(version.snapshot) as RecipeSnapshot).servings).toEqual(4);
			});

			it('restores the base servings of the target version alongside the pool', () => {
				const recipe = createRecipe('Chilli con carne', 4);
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

				const [versionAtFour] = listRecipeVersions(recipe.id).slice(-1);

				updateServings(recipe.id, 8);
				addStep(defaultComposition.id, { instruction: 'Simmer.' });

				revertToVersion(recipe.id, versionAtFour.id);

				const reverted = getRecipe(recipe.id, defaultComposition.id);
				expect(reverted?.servings).toEqual(4);
				expect(reverted?.targetServings).toEqual(4);
				expect(reverted?.composition.steps.map((s) => s.instruction)).toEqual(['Brown the mince.']);
			});

			it('reads a scaled quantity against the restored baseline, not the one it was changed to', () => {
				const recipe = createRecipe('Chilli con carne', 4);
				const defaultComposition = getDefaultComposition(recipe.id);
				const beef = createIngredient({ baseTerm: 'beef mince' });
				const { step } = addStep(defaultComposition.id, { instruction: 'Brown {{1}} of mince.' });
				addIngredientUsage(step.id, {
					ingredientId: beef.id,
					quantityValue: 500,
					quantityUnit: 'g'
				});

				// At this Version the line reads "500 g feeds 4", so cooking for 8
				// asks for 1000 g.
				const [versionAtFour] = listRecipeVersions(recipe.id).slice(-1);
				expect(
					getRecipe(recipe.id, defaultComposition.id, 8)?.composition.steps[0].usages[0]
						.scaledQuantityValue
				).toEqual(1000);

				// Re-authored around a bigger pot: the same stored 500 g now feeds 8.
				updateServings(recipe.id, 8);
				expect(
					getRecipe(recipe.id, defaultComposition.id, 8)?.composition.steps[0].usages[0]
						.scaledQuantityValue
				).toEqual(500);

				revertToVersion(recipe.id, versionAtFour.id);

				const atEight = getRecipe(recipe.id, defaultComposition.id, 8);
				expect(atEight?.composition.steps[0].usages[0].scaledQuantityValue).toEqual(1000);
				expect(atEight?.composition.steps[0].renderedInstruction).toEqual('Brown 1000 g of mince.');
			});

			it('leaves the live base servings alone when the target snapshot predates the servings field', () => {
				const recipe = createRecipe('Chilli con carne', 4);
				const defaultComposition = getDefaultComposition(recipe.id);
				addStep(defaultComposition.id, { instruction: 'Brown the mince.' });

				// What every recipe_versions row in an existing database looks like:
				// valid JSON, no `servings` key at all.
				const [target] = listRecipeVersions(recipe.id).slice(-1);
				const legacySnapshot = JSON.parse(target.snapshot) as Record<string, unknown>;
				delete legacySnapshot.servings;
				db.update(recipeVersions)
					.set({ snapshot: JSON.stringify(legacySnapshot) })
					.where(eq(recipeVersions.id, target.id))
					.run();

				updateServings(recipe.id, 8);
				addStep(defaultComposition.id, { instruction: 'Simmer.' });

				revertToVersion(recipe.id, target.id);

				// The pool comes back; the servings count the snapshot never recorded
				// stays as the household last set it.
				const reverted = getRecipe(recipe.id, defaultComposition.id);
				expect(reverted?.composition.steps.map((s) => s.instruction)).toEqual(['Brown the mince.']);
				expect(reverted?.servings).toEqual(8);
			});
		});
	});
});
