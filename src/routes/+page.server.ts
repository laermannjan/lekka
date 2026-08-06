import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankTitleError,
	InvalidServingsError,
	RECIPE_SORTS,
	createRecipe,
	listRecipes,
	type RecipeSort
} from '$lib/server/recipes';
import { listCategoriesForRecipes } from '$lib/server/categories';
import { listFavoriteProfilesForRecipes, listFavoriteRecipeIds } from '$lib/server/favorites';

function parseSort(raw: string | null): RecipeSort {
	return RECIPE_SORTS.includes(raw as RecipeSort) ? (raw as RecipeSort) : 'recently-added';
}

export const load: PageServerLoad = ({ locals, url }) => {
	const sort = parseSort(url.searchParams.get('sort'));
	const search = url.searchParams.get('q') ?? '';

	const recipes = listRecipes({ sort, search });
	const categoriesByRecipeId = listCategoriesForRecipes(recipes.map((r) => r.id));
	const favoriteRecipeIds = locals.profile
		? new Set(listFavoriteRecipeIds(locals.profile.id))
		: new Set<number>();
	const favoritedByRecipeId = listFavoriteProfilesForRecipes(recipes.map((r) => r.id));

	return {
		recipes: recipes.map((recipe) => ({
			...recipe,
			categories: categoriesByRecipeId.get(recipe.id) ?? [],
			isFavorite: favoriteRecipeIds.has(recipe.id),
			favoritedBy: favoritedByRecipeId.get(recipe.id) ?? []
		})),
		sort,
		search
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
