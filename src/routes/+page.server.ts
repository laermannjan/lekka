import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankTitleError,
	InvalidServingsError,
	createRecipe,
	listRecipes
} from '$lib/server/recipes';

export const load: PageServerLoad = () => {
	return { recipes: listRecipes() };
};

export const actions: Actions = {
	createRecipe: async ({ request }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '');
		const servingsRaw = String(data.get('servings') ?? '');
		const servings = servingsRaw ? Number(servingsRaw) : undefined;

		try {
			createRecipe(title, servings);
		} catch (error) {
			if (error instanceof BlankTitleError) {
				return fail(400, { recipeError: 'Enter a title.' });
			}
			if (error instanceof InvalidServingsError) {
				return fail(400, { recipeError: error.message });
			}
			throw error;
		}
	}
};
