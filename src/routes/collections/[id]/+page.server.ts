import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	addRecipeToCollection,
	getCollectionDetail,
	removeRecipeFromCollection
} from '$lib/server/collections';
import { listRecipes } from '$lib/server/recipes';

export const load: PageServerLoad = ({ params }) => {
	const id = Number(params.id);
	const collection = getCollectionDetail(id);
	if (!collection) error(404, 'Collection not found');

	return { collection, recipes: listRecipes() };
};

export const actions: Actions = {
	addRecipe: async ({ request, params }) => {
		const collectionId = Number(params.id);
		const data = await request.formData();
		const recipeId = Number(data.get('recipeId'));

		addRecipeToCollection(collectionId, recipeId);
	},

	removeRecipe: async ({ request, params }) => {
		const collectionId = Number(params.id);
		const data = await request.formData();
		const recipeId = Number(data.get('recipeId'));

		removeRecipeFromCollection(collectionId, recipeId);
	}
};
