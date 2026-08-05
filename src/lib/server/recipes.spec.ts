import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';
import { ingredients, ingredientUsages, recipes, steps } from './db/schema';
import { createIngredient } from './ingredients';
import {
	BlankInstructionError,
	BlankTitleError,
	IngredientNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	addIngredientUsage,
	addStep,
	createRecipe,
	formatQuantity,
	getRecipe,
	listRecipes,
	renderInstruction,
	updateStepInstruction
} from './recipes';

describe('recipes', () => {
	beforeEach(() => {
		db.delete(ingredientUsages).run();
		db.delete(steps).run();
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
			const step = addStep(recipe.id, { instruction: 'Brown the mince.' });

			expect(step).toMatchObject({
				recipeId: recipe.id,
				position: 1,
				instruction: 'Brown the mince.',
				durationKind: null,
				durationMin: null,
				durationMax: null,
				durationUnit: null
			});
		});

		it('adds a step with a duration', () => {
			const recipe = createRecipe('Chilli con carne');
			const step = addStep(recipe.id, {
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
			const step = addStep(recipe.id, {
				instruction: 'Simmer.',
				duration: { kind: 'cook', min: 30, max: 45, unit: 'minutes' }
			});

			expect(step).toMatchObject({ durationMin: 30, durationMax: 45 });
		});

		it('rejects a blank instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(() => addStep(recipe.id, { instruction: '   ' })).toThrow(BlankInstructionError);
		});

		it('rejects an unknown duration kind', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(() =>
				addStep(recipe.id, {
					instruction: 'Simmer.',
					duration: { kind: 'bogus', min: 10, unit: 'minutes' }
				})
			).toThrow(InvalidDurationError);
		});

		it('rejects a duration max smaller than min', () => {
			const recipe = createRecipe('Chilli con carne');
			expect(() =>
				addStep(recipe.id, {
					instruction: 'Simmer.',
					duration: { kind: 'cook', min: 45, max: 10, unit: 'minutes' }
				})
			).toThrow(InvalidDurationError);
		});

		it('assigns increasing positions to successive steps', () => {
			const recipe = createRecipe('Chilli con carne');
			addStep(recipe.id, { instruction: 'Brown the mince.' });
			const second = addStep(recipe.id, { instruction: 'Simmer.' });

			expect(second.position).toEqual(2);
		});

		it('updates a step instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			const step = addStep(recipe.id, { instruction: 'Brown the mince.' });

			const updated = updateStepInstruction(step.id, 'Brown {{1}} of mince.');
			expect(updated.instruction).toEqual('Brown {{1}} of mince.');
		});
	});

	describe('ingredient usages', () => {
		it('adds an ingredient usage to a step', () => {
			const recipe = createRecipe('Chilli con carne');
			const step = addStep(recipe.id, { instruction: 'Brown the mince.' });
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
			const step = addStep(recipe.id, { instruction: 'Add the onion.' });
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
			const step = addStep(recipe.id, { instruction: 'Add the onion.' });
			const onion = createIngredient({ baseTerm: 'onion' });

			expect(() =>
				addIngredientUsage(step.id, { ingredientId: onion.id, quantityValue: -1 })
			).toThrow(InvalidQuantityError);
		});

		it('rejects a usage referencing a non-existent ingredient', () => {
			const recipe = createRecipe('Chilli con carne');
			const step = addStep(recipe.id, { instruction: 'Add the onion.' });

			expect(() => addIngredientUsage(step.id, { ingredientId: 999999, quantityValue: 1 })).toThrow(
				IngredientNotFoundError
			);
		});

		it('assigns increasing positions to successive usages on the same step', () => {
			const recipe = createRecipe('Chilli con carne');
			const step = addStep(recipe.id, { instruction: 'Add aromatics.' });
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
			const step = addStep(recipe.id, { instruction: 'Whisk the eggs.' });

			const usage = addIngredientUsage(step.id, { ingredientId: egg.id, quantityValue: 4.5 });

			expect(usage.quantityValue).toEqual(4.5);
			expect(formatQuantity(usage.quantityValue, usage.quantityUnit, egg)).toEqual('~5');
		});
	});

	describe('renderInstruction', () => {
		it('weaves a usage quantity into the instruction text at its token', () => {
			const flour = createIngredient({ baseTerm: 'flour' });
			const recipe = createRecipe('Bread');
			const step = addStep(recipe.id, { instruction: 'Mix in {{1}} of flour.' });
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

		it('returns steps in order, each with its usages and rendered instruction', () => {
			const recipe = createRecipe('Chilli con carne');
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const onion = createIngredient({ baseTerm: 'onion', roundToWholeUnit: true });

			const step1 = addStep(recipe.id, { instruction: 'Brown {{1}} of mince.' });
			addIngredientUsage(step1.id, {
				ingredientId: beef.id,
				quantityValue: 500,
				quantityUnit: 'g'
			});

			const step2 = addStep(recipe.id, {
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
			expect(detail?.steps).toHaveLength(2);
			expect(detail?.steps[0]).toMatchObject({
				instruction: 'Brown {{1}} of mince.',
				renderedInstruction: 'Brown 500 g of mince.'
			});
			expect(detail?.steps[0].usages).toHaveLength(1);
			expect(detail?.steps[1]).toMatchObject({
				renderedInstruction: 'Add ~2 onion, diced.',
				durationKind: 'active'
			});
			expect(detail?.steps[1].usages[0]).toMatchObject({ prepAttribute: 'diced' });
		});

		it("applies the ingredient rounding toggle to each usage's display quantity, without touching the stored value", () => {
			const recipe = createRecipe('Pancakes');
			const egg = createIngredient({ baseTerm: 'egg', roundToWholeUnit: true });
			const step = addStep(recipe.id, { instruction: 'Whisk the eggs.' });
			addIngredientUsage(step.id, { ingredientId: egg.id, quantityValue: 4.5 });

			const usage = getRecipe(recipe.id)?.steps[0].usages[0];

			expect(usage).toMatchObject({ quantityValue: 4.5, displayQuantity: '~5' });
		});

		it('gives the whole-recipe ingredient list and the inline per-step display the same underlying usages', () => {
			const recipe = createRecipe('Chilli con carne');
			const beef = createIngredient({ baseTerm: 'beef mince' });
			const step = addStep(recipe.id, { instruction: 'Brown the mince.' });
			addIngredientUsage(step.id, { ingredientId: beef.id, quantityValue: 500, quantityUnit: 'g' });

			const detail = getRecipe(recipe.id);
			const wholeRecipeList = detail?.steps.flatMap((s) => s.usages) ?? [];
			const inlinePerStep = detail?.steps[0].usages ?? [];

			expect(wholeRecipeList).toEqual(inlinePerStep);
		});

		it('returns steps with no usages as an empty array', () => {
			const recipe = createRecipe('Chilli con carne');
			addStep(recipe.id, { instruction: 'Preheat the oven.' });

			const detail = getRecipe(recipe.id);
			expect(detail?.steps[0].usages).toEqual([]);
		});
	});
});
