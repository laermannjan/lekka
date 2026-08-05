import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankTitleError,
	InvalidServingsError,
	createRecipe,
	listRecipes
} from '$lib/server/recipes';
import { listCategoriesForRecipes } from '$lib/server/categories';
import { listFavoriteRecipeIds } from '$lib/server/favorites';

export const load: PageServerLoad = ({ locals }) => {
	const recipes = listRecipes();
	const categoriesByRecipeId = listCategoriesForRecipes(recipes.map((r) => r.id));
	const favoriteRecipeIds = locals.profile
		? new Set(listFavoriteRecipeIds(locals.profile.id))
		: new Set<number>();

	return {
		recipes: recipes.map((recipe) => ({
			...recipe,
			categories: categoriesByRecipeId.get(recipe.id) ?? [],
			isFavorite: favoriteRecipeIds.has(recipe.id)
		}))
	};
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
