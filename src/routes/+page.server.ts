import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BlankTitleError, createRecipe, listRecipes } from '$lib/server/recipes';

export const load: PageServerLoad = () => {
	return { recipes: listRecipes() };
};

export const actions: Actions = {
	createRecipe: async ({ request }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '');

		try {
			createRecipe(title);
		} catch (error) {
			if (error instanceof BlankTitleError) {
				return fail(400, { recipeError: 'Enter a title.' });
			}
			throw error;
		}
	}
};
