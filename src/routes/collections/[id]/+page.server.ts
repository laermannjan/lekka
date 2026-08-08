import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	CollectionNotFoundError,
	addRecipeToCollection,
	getCollectionDetail,
	removeRecipeFromCollection
} from '$lib/server/collections';
import { getRecipeById, listRecipes } from '$lib/server/recipes';
import { parseRowId } from '$lib/server/form';

export const load: PageServerLoad = ({ params }) => {
	const id = parseRowId(params.id);
	if (id === undefined) error(404, 'Collection not found');

	const collection = getCollectionDetail(id);
	if (!collection) error(404, 'Collection not found');

	return { collection, recipes: listRecipes() };
};

// The Collection a route is scoped to. Route params are raw strings, so
// `/collections/abc` reaches an action just as readily as `/collections/7`;
// resolving the id up front keeps NaN out of the database and gives such a
// request the same 404 the page load gives.
function requireCollectionId(params: { id: string }): number {
	const collectionId = parseRowId(params.id);
	if (collectionId === undefined) error(404, 'Collection not found');
	return collectionId;
}

export const actions: Actions = {
	addRecipe: async ({ request, params }) => {
		const collectionId = requireCollectionId(params);
		const data = await request.formData();
		const recipeId = parseRowId(data.get('recipeId'));

		if (recipeId === undefined) return fail(400, { recipeError: 'Pick a recipe.' });
		// Unlike the Collection, `addRecipeToCollection` doesn't check the Recipe,
		// so a well-formed id for one that has since been deleted would reach the
		// insert and fail on the foreign key.
		if (!getRecipeById(recipeId)) {
			return fail(400, { recipeError: 'That recipe no longer exists.' });
		}

		try {
			addRecipeToCollection(collectionId, recipeId);
		} catch (err) {
			// The Collection is this route's own resource, so its disappearance is
			// a 404 rather than something the form can be corrected to fix.
			if (err instanceof CollectionNotFoundError) error(404, 'Collection not found');
			throw err;
		}
	},

	removeRecipe: async ({ request, params }) => {
		const collectionId = requireCollectionId(params);
		const data = await request.formData();
		const recipeId = parseRowId(data.get('recipeId'));

		if (recipeId === undefined) {
			return fail(400, { recipeError: 'That recipe is no longer in this collection.' });
		}

		removeRecipeFromCollection(collectionId, recipeId);
	}
};
