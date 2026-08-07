import { describe, expect, it } from 'vitest';
import { db } from './db';
import { ingredients, profiles, recipeVersions } from './db/schema';
import { createRecipe, getDefaultComposition, addStep, addIngredientUsage } from './recipes';
import {
	AnnotationTargetError,
	CookNotFoundError,
	CompositionNotFoundError,
	IngredientUsageNotFoundError,
	StepNotFoundError,
	addCookLogAnnotation,
	listAnnotationsForCook,
	listCooksForRecipe,
	logCook
} from './cooks';

describe('cooks', () => {
	function makeProfile(name = 'Jan') {
		return db.insert(profiles).values({ name }).returning().get();
	}

	function makeIngredient(baseTerm = 'Onion') {
		return db.insert(ingredients).values({ baseTerm }).returning().get();
	}

	it('logs a Cook with date, composition, acting profile, diners, outcome, and summary', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');

		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [jan.id, alex.id],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: 'Great with extra cumin.'
		});

		expect(cook.recipeId).toBe(recipe.id);
		expect(cook.compositionId).toBe(composition.id);
		expect(cook.actingProfileId).toBe(jan.id);
		expect(cook.cookedAt).toBe('2026-08-06');
		expect(cook.outcome).toBe('worked-well');
		expect(cook.summary).toBe('Great with extra cumin.');

		const [listed] = listCooksForRecipe(recipe.id);
		expect(listed.id).toBe(cook.id);
		expect(listed.diners.map((d) => d.id).sort()).toEqual([alex.id, jan.id].sort());
	});

	it("records the Recipe's current version at the time of the Cook, and never mutates it", () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const versionsBefore = db.select().from(recipeVersions).all().length;

		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [jan.id],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		const versions = db.select().from(recipeVersions).all();
		expect(cook.recipeVersionId).toBe(versions[versions.length - 1].id);
		// Logging never mutates the Recipe: no extra Version was created beyond
		// the one createRecipe itself already made.
		expect(versions.length).toBe(versionsBefore);
	});

	it('is household-wide, not filtered to the acting Profile', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');

		logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		// Listing as/for the recipe requires no profile scoping at all.
		const cooksForAlex = listCooksForRecipe(recipe.id);
		expect(cooksForAlex).toHaveLength(1);
		expect(cooksForAlex[0].actingProfileId).toBe(jan.id);
		void alex;
	});

	it('rejects a Composition that does not belong to the Recipe', () => {
		const recipe = createRecipe('Chilli con carne');
		const otherRecipe = createRecipe('Pancakes');
		const otherComposition = getDefaultComposition(otherRecipe.id);
		const jan = makeProfile('Jan');

		expect(() =>
			logCook(recipe.id, {
				compositionId: otherComposition.id,
				actingProfileId: jan.id,
				dinerProfileIds: [],
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				summary: ''
			})
		).toThrow(CompositionNotFoundError);
	});

	it('pins a Cook Log Annotation to a Step', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, { instruction: 'Simmer for 20 minutes.' });
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		const annotation = addCookLogAnnotation(cook.id, { stepId: step.id, note: 'Took 30 min.' });

		expect(annotation.stepId).toBe(step.id);
		expect(annotation.ingredientUsageId).toBeNull();
		expect(listAnnotationsForCook(cook.id)).toEqual([annotation]);
	});

	it('pins a Cook Log Annotation to an Ingredient Usage', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, { instruction: 'Add {{1}} onion.' });
		const ingredient = makeIngredient();
		const usage = addIngredientUsage(step.id, { ingredientId: ingredient.id, quantityValue: 1 });
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		const annotation = addCookLogAnnotation(cook.id, {
			ingredientUsageId: usage.id,
			note: 'Used shallot instead.'
		});

		expect(annotation.ingredientUsageId).toBe(usage.id);
		expect(annotation.stepId).toBeNull();
	});

	it('rejects an annotation with neither a Step nor a Usage', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		expect(() => addCookLogAnnotation(cook.id, { note: 'Orphaned note.' })).toThrow(
			AnnotationTargetError
		);
	});

	it('rejects an annotation with both a Step and a Usage', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const { step } = addStep(composition.id, { instruction: 'Add {{1}} onion.' });
		const ingredient = makeIngredient();
		const usage = addIngredientUsage(step.id, { ingredientId: ingredient.id, quantityValue: 1 });
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		expect(() =>
			addCookLogAnnotation(cook.id, { stepId: step.id, ingredientUsageId: usage.id, note: 'Both.' })
		).toThrow(AnnotationTargetError);
	});

	it('rejects an annotation on a nonexistent Cook', () => {
		expect(() => addCookLogAnnotation(999999, { stepId: 1, note: 'x' })).toThrow(CookNotFoundError);
	});

	it('rejects an annotation on a nonexistent Step', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		expect(() => addCookLogAnnotation(cook.id, { stepId: 999999, note: 'x' })).toThrow(
			StepNotFoundError
		);
	});

	it('rejects an annotation on a nonexistent Usage', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');
		const cook = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'worked-well',
			summary: ''
		});

		expect(() => addCookLogAnnotation(cook.id, { ingredientUsageId: 999999, note: 'x' })).toThrow(
			IngredientUsageNotFoundError
		);
	});

	it('lists Cooks for a Recipe most recent first', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');

		const first = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-01',
			outcome: 'worked-well',
			summary: ''
		});
		const second = logCook(recipe.id, {
			compositionId: composition.id,
			actingProfileId: jan.id,
			dinerProfileIds: [],
			cookedAt: '2026-08-06',
			outcome: 'needs-tweaks',
			summary: ''
		});

		const listed = listCooksForRecipe(recipe.id);
		expect(listed.map((c) => c.id)).toEqual([second.id, first.id]);
	});
});
