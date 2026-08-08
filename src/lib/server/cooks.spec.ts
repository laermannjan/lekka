import { describe, expect, it } from 'vitest';
import { db } from './db';
import { ingredients, profiles, recipeVersions } from './db/schema';
import { createRecipe, getDefaultComposition, addStep, addIngredientUsage } from './recipes';
import {
	AnnotationTargetError,
	BlankNoteError,
	CookNotFoundError,
	CompositionNotFoundError,
	IngredientUsageNotFoundError,
	ProfileNotFoundError,
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

	// The acting Profile comes from a cookie and the Diners from a form, so
	// either can name a Profile that has since been deleted. Without these
	// checks the stale id reaches the insert and surfaces as a raw foreign-key
	// error, past every domain-error handler the route has (#47).
	it('rejects a Cook whose acting Profile does not exist', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);

		expect(() =>
			logCook(recipe.id, {
				compositionId: composition.id,
				actingProfileId: 9999,
				dinerProfileIds: [],
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				summary: ''
			})
		).toThrow(ProfileNotFoundError);
	});

	it('rejects a Cook naming a Diner that does not exist', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');

		expect(() =>
			logCook(recipe.id, {
				compositionId: composition.id,
				actingProfileId: jan.id,
				dinerProfileIds: [jan.id, 9999],
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				summary: ''
			})
		).toThrow(ProfileNotFoundError);
	});

	it('records no Cook at all when a Diner id is stale', () => {
		const recipe = createRecipe('Chilli con carne');
		const composition = getDefaultComposition(recipe.id);
		const jan = makeProfile('Jan');

		expect(() =>
			logCook(recipe.id, {
				compositionId: composition.id,
				actingProfileId: jan.id,
				dinerProfileIds: [9999],
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				summary: ''
			})
		).toThrow(ProfileNotFoundError);
		expect(listCooksForRecipe(recipe.id)).toEqual([]);
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

	// A blank note is a blank note, not a target problem: naming it
	// AnnotationTargetError told the route the annotation was pinned wrong (#47).
	it('rejects an annotation whose note is blank', () => {
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

		expect(() => addCookLogAnnotation(cook.id, { stepId: step.id, note: '   ' })).toThrow(
			BlankNoteError
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
