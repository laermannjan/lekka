import { describe, expect, it } from 'vitest';
import {
	createCollection,
	getCollectionDetail,
	addRecipeToCollection
} from '$lib/server/collections';
import { createProfile } from '$lib/server/profiles';
import { createRecipe } from '$lib/server/recipes';
import { actions } from './+page.server';

// Both actions on this page took their Collection from a route param and their
// Recipe from a form, and passed both to the database unchecked - so a stale
// page or a hand-made request produced a 500 where every neighbouring action
// produces a 400 (#47).
describe('collection page actions', () => {
	type ActionOutcome = { status: number; data?: Record<string, string> } | void;

	function runAction(
		name: keyof typeof actions,
		options: { id: string; form?: Record<string, string> }
	): Promise<ActionOutcome> {
		const body = new FormData();
		for (const [key, value] of Object.entries(options.form ?? {})) body.append(key, value);

		const action = actions[name]!;
		return action({
			request: new Request('http://localhost', { method: 'POST', body }),
			params: { id: options.id }
		} as unknown as Parameters<typeof action>[0]) as Promise<ActionOutcome>;
	}

	function makeCollection(name = 'Weeknight') {
		return createCollection(createProfile(`Jan ${name}`).id, name);
	}

	it('rejects adding a recipe with a non-numeric id', async () => {
		const collection = makeCollection();

		const result = await runAction('addRecipe', {
			id: String(collection.id),
			form: { recipeId: 'abc' }
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.recipeError).toBeTruthy();
		expect(getCollectionDetail(collection.id)?.recipes).toEqual([]);
	});

	it('rejects removing a recipe with a missing id, leaving the collection intact', async () => {
		const collection = makeCollection();
		const recipe = createRecipe('Chilli con carne');
		addRecipeToCollection(collection.id, recipe.id);

		const result = await runAction('removeRecipe', { id: String(collection.id), form: {} });

		expect(result?.status).toBe(400);
		expect(result?.data?.recipeError).toBeTruthy();
		expect(getCollectionDetail(collection.id)?.recipes.map((r) => r.id)).toEqual([recipe.id]);
	});

	// `addRecipeToCollection` checks the Collection but not the Recipe, so this
	// reached the insert and failed on the foreign key.
	it('rejects adding a recipe that no longer exists', async () => {
		const collection = makeCollection();

		const result = await runAction('addRecipe', {
			id: String(collection.id),
			form: { recipeId: '999999' }
		});

		expect(result?.status).toBe(400);
		expect(result?.data?.recipeError).toBeTruthy();
		expect(getCollectionDetail(collection.id)?.recipes).toEqual([]);
	});

	it('404s under a non-numeric collection id', async () => {
		const recipe = createRecipe('Chilli con carne');

		await expect(
			runAction('addRecipe', { id: 'abc', form: { recipeId: String(recipe.id) } })
		).rejects.toMatchObject({ status: 404 });
	});

	it('404s when the collection in the route no longer exists', async () => {
		const recipe = createRecipe('Chilli con carne');

		await expect(
			runAction('addRecipe', { id: '999999', form: { recipeId: String(recipe.id) } })
		).rejects.toMatchObject({ status: 404 });
	});

	it('still adds and removes a recipe for valid ids', async () => {
		const collection = makeCollection();
		const recipe = createRecipe('Chilli con carne');

		await runAction('addRecipe', {
			id: String(collection.id),
			form: { recipeId: String(recipe.id) }
		});
		expect(getCollectionDetail(collection.id)?.recipes.map((r) => r.id)).toEqual([recipe.id]);

		await runAction('removeRecipe', {
			id: String(collection.id),
			form: { recipeId: String(recipe.id) }
		});
		expect(getCollectionDetail(collection.id)?.recipes).toEqual([]);
	});
});
