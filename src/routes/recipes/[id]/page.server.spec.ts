import { describe, expect, it } from 'vitest';
import { listAnnotationsForCook, logCook, type CookWithDiners } from '$lib/server/cooks';
import { createProfile } from '$lib/server/profiles';
import { createCategory, listCategoriesForRecipe } from '$lib/server/categories';
import { createCollection, listCollectionsForRecipe } from '$lib/server/collections';
import { isFavorite } from '$lib/server/favorites';
import { getDurationScalingFormulasByStepIds } from '$lib/server/scaling';
import {
	addIngredientUsage,
	addStep,
	createRecipe,
	createVariant,
	getDefaultComposition,
	getRecipe,
	listRecipeVersions,
	revertToVersion
} from '$lib/server/recipes';
import { db } from '$lib/server/db';
import { ingredients, type Profile } from '$lib/server/db/schema';
import { actions, load } from './+page.server';

// The recipe page is where a Cook is read back (see CONTEXT.md's Cook), so
// "reverting keeps the Cook history" only counts if the page's own load still
// hands that history to the template - including a Cook whose Composition the
// revert removed, which no longer has a Composition to resolve (#51).
describe('recipe page load', () => {
	// `load` only reads `params`, `url` and `locals`, so the rest of a
	// RequestEvent would be dead weight here. Its declared return type is the
	// generic `MaybePromise<void | ...>` every PageServerLoad has; this one is
	// synchronous, and only its Cook history is under test.
	function loadRecipePage(recipeId: number): { cooks: CookWithDiners[] } {
		const data = load({
			params: { id: String(recipeId) },
			url: new URL(`http://localhost/recipes/${recipeId}`),
			locals: { profile: undefined, dinerProfiles: [] }
		} as unknown as Parameters<typeof load>[0]);
		return data as unknown as { cooks: CookWithDiners[] };
	}

	it('still lists a Cook whose Composition a revert removed', () => {
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

		const data = loadRecipePage(recipe.id);
		expect(data.cooks.map((c) => c.id)).toEqual([cook.id]);
		expect(data.cooks[0].compositionId).toBeNull();
		expect(data.cooks[0].summary).toEqual('The sin carne line.');
	});
});

// Every action on this page reads ids out of a route param or a form, both of
// which a stale page or a hand-made request can get wrong. None of them may
// pass that on to the database: a bad id is a friendly failure, the same 400
// its neighbours already return (#47).
describe('recipe page actions', () => {
	type ActionOutcome = { status: number; data?: Record<string, string> } | void;

	function runAction(
		name: keyof typeof actions,
		options: {
			id: string;
			form?: Record<string, string | string[]>;
			profile?: Profile;
		}
	): Promise<ActionOutcome> {
		const body = new FormData();
		for (const [key, value] of Object.entries(options.form ?? {})) {
			for (const entry of Array.isArray(value) ? value : [value]) body.append(key, entry);
		}
		const action = actions[name]!;
		return action({
			request: new Request('http://localhost', { method: 'POST', body }),
			params: { id: options.id },
			locals: { profile: options.profile, dinerProfiles: [] }
		} as unknown as Parameters<typeof action>[0]) as Promise<ActionOutcome>;
	}

	function makeIngredient(baseTerm = 'Onion') {
		return db.insert(ingredients).values({ baseTerm }).returning().get();
	}

	// Removing a Step can also remove it from other Compositions at once, so one
	// unparseable id in that repeated field must not remove it from some of them.
	it('rejects removing a step when one of the other composition ids is not an id', async () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { compositionStep } = addStep(composition.id, { instruction: 'Brown the mince.' });

		const result = await runAction('removeStep', {
			id: String(recipe.id),
			form: {
				compositionStepId: String(compositionStep.id),
				alsoFromCompositionIds: [String(composition.id), 'abc']
			}
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.stepError).toBeTruthy();
		expect(getRecipe(recipe.id)?.composition.steps).toHaveLength(1);
	});

	it('rejects removing a category with a non-numeric id, leaving the recipe untouched', async () => {
		const recipe = createRecipe('Chilli con carne');
		const category = createCategory('dinner', 'meal-type');
		await runAction('addCategory', {
			id: String(recipe.id),
			form: { categoryId: String(category.id) }
		});

		const result = await runAction('removeCategory', {
			id: String(recipe.id),
			form: { categoryId: 'abc' }
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.categoryError).toBeTruthy();
		expect(listCategoriesForRecipe(recipe.id).map((c) => c.id)).toEqual([category.id]);
	});

	it('rejects removing a collection with a missing id', async () => {
		const jan = createProfile('Jan');
		const recipe = createRecipe('Chilli con carne');
		const collection = createCollection(jan.id, 'Weeknight');
		await runAction('addToCollection', {
			id: String(recipe.id),
			form: { collectionId: String(collection.id) }
		});

		const result = await runAction('removeFromCollection', { id: String(recipe.id), form: {} });

		expect(result?.status).toBe(400);
		expect(result?.data?.collectionError).toBeTruthy();
		expect(listCollectionsForRecipe(recipe.id).map((c) => c.id)).toEqual([collection.id]);
	});

	it('404s on toggling a favorite under a non-numeric recipe id', async () => {
		const jan = createProfile('Jan');

		await expect(
			runAction('toggleFavorite', { id: 'abc', form: { isFavorite: 'false' }, profile: jan })
		).rejects.toMatchObject({ status: 404 });
	});

	it('still toggles a favorite for a valid recipe id', async () => {
		const jan = createProfile('Jan');
		const recipe = createRecipe('Chilli con carne');

		await runAction('toggleFavorite', {
			id: String(recipe.id),
			form: { isFavorite: 'false' },
			profile: jan
		});

		expect(isFavorite(recipe.id, jan.id)).toBe(true);
	});

	it('rejects logging a Cook that names a Diner who no longer exists', async () => {
		const jan = createProfile('Jan');
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		addStep(composition.id, { instruction: 'Brown the mince.' });

		const result = await runAction('logCook', {
			id: String(recipe.id),
			form: {
				compositionId: String(composition.id),
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				dinerProfileIds: [String(jan.id), '999999']
			},
			profile: jan
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.cookError).toBeTruthy();
		expect(
			load({
				params: { id: String(recipe.id) },
				url: new URL(`http://localhost/recipes/${recipe.id}`),
				locals: { profile: jan, dinerProfiles: [] }
			} as unknown as Parameters<typeof load>[0]) as unknown as { cooks: CookWithDiners[] }
		).toMatchObject({ cooks: [] });
	});

	it('rejects an annotation whose note is blank, without recording it', async () => {
		const jan = createProfile('Jan');
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, { instruction: 'Brown the mince.' });
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		const result = await runAction('addCookAnnotation', {
			id: String(recipe.id),
			form: { cookId: String(cook.id), stepId: String(step.id), note: '   ' }
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.annotationError).toBeTruthy();
		expect(listAnnotationsForCook(cook.id)).toEqual([]);
	});

	// Coercing an unknown direction to `increase` stored a rule the author never
	// wrote, and the same for an unknown threshold side.
	it.each([
		['direction', { direction: 'sideways', thresholdSide: 'short' }],
		['threshold side', { direction: 'increase', thresholdSide: 'diagonally' }]
	])('rejects a scaling formula with an unknown %s', async (_label, overrides) => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, {
			instruction: 'Simmer.',
			duration: { kind: 'cook', min: 20, unit: 'minutes' }
		});
		const usage = addIngredientUsage(step.id, {
			ingredientId: makeIngredient().id,
			quantityValue: 1
		});

		const result = await runAction('setDurationScalingFormula', {
			id: String(recipe.id),
			form: {
				stepId: String(step.id),
				scalingKind: 'vs_other_usage',
				otherUsageId: String(usage.id),
				perUnitAmount: '5',
				...overrides
			}
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.scalingError).toBeTruthy();
		expect(getDurationScalingFormulasByStepIds([step.id]).size).toBe(0);
	});

	// The authoring form's "no formula" choice posts `scalingKind=none`, which
	// is how a formula is removed - it must stay a removal, not become an
	// unknown template the domain layer rejects.
	it('removes a formula when the form posts the "no formula" choice', async () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, {
			instruction: 'Simmer.',
			duration: { kind: 'cook', min: 20, unit: 'minutes' }
		});
		await runAction('setDurationScalingFormula', {
			id: String(recipe.id),
			form: { stepId: String(step.id), scalingKind: 'fixed' }
		});
		expect(getDurationScalingFormulasByStepIds([step.id]).size).toBe(1);

		const result = await runAction('setDurationScalingFormula', {
			id: String(recipe.id),
			form: { stepId: String(step.id), scalingKind: 'none' }
		});

		expect(result).toBeUndefined();
		expect(getDurationScalingFormulasByStepIds([step.id]).size).toBe(0);
	});

	it('rejects a scaling formula referencing a non-numeric usage', async () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, {
			instruction: 'Simmer.',
			duration: { kind: 'cook', min: 20, unit: 'minutes' }
		});

		const result = await runAction('setDurationScalingFormula', {
			id: String(recipe.id),
			form: {
				stepId: String(step.id),
				scalingKind: 'vs_other_usage',
				otherUsageId: 'abc',
				perUnitAmount: '5',
				direction: 'increase',
				thresholdSide: 'short'
			}
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.scalingError).toBeTruthy();
		expect(getDurationScalingFormulasByStepIds([step.id]).size).toBe(0);
	});

	// Nothing posts to these: no form targets them, and the setters already
	// remove the formula when handed an empty selection (#47).
	it('has no unreachable scaling-formula remover actions', () => {
		expect(Object.keys(actions)).not.toContain('removeUsageScalingFormula');
		expect(Object.keys(actions)).not.toContain('removeDurationScalingFormula');
	});
});
