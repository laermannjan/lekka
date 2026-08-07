import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '$lib/server/db';
import {
	compositions,
	cookDiners,
	cookLogAnnotations,
	cooks,
	compositionSteps,
	ingredientUsages,
	ingredients,
	profiles,
	recipeVersions,
	recipes,
	scalingFormulas,
	steps
} from '$lib/server/db/schema';
import { logCook, type CookWithDiners } from '$lib/server/cooks';
import { createProfile } from '$lib/server/profiles';
import {
	addStep,
	createRecipe,
	createVariant,
	getDefaultComposition,
	listRecipeVersions,
	revertToVersion
} from '$lib/server/recipes';
import { load } from './+page.server';

// The recipe page is where a Cook is read back (see CONTEXT.md's Cook), so
// "reverting keeps the Cook history" only counts if the page's own load still
// hands that history to the template - including a Cook whose Composition the
// revert removed, which no longer has a Composition to resolve (#51).
describe('recipe page load', () => {
	beforeEach(() => {
		db.delete(cookLogAnnotations).run();
		db.delete(cookDiners).run();
		db.delete(cooks).run();
		db.delete(scalingFormulas).run();
		db.delete(recipeVersions).run();
		db.delete(ingredientUsages).run();
		db.delete(compositionSteps).run();
		db.delete(steps).run();
		db.delete(compositions).run();
		db.delete(recipes).run();
		db.delete(ingredients).run();
		db.delete(profiles).run();
	});

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
