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
import {
	getCategoriesByIds,
	listCategories,
	listCategoriesForRecipes,
	parseCategoryIds
} from '$lib/server/categories';
import { listFavoriteProfilesForRecipes, listFavoriteRecipeIds } from '$lib/server/favorites';
import { getCollectionById, listCollections } from '$lib/server/collections';

function parseSort(raw: string | null): RecipeSort {
	return RECIPE_SORTS.includes(raw as RecipeSort) ? (raw as RecipeSort) : 'recently-added';
}

// A single id filter (`?collection=`), as opposed to the repeated `?category=`
// one. A blank value is what an unset `<select>` submits, and reads as "no
// filter" rather than as collection 0.
function parseIdParam(raw: string | null): number | undefined {
	if (!raw?.trim()) return undefined;
	const id = Number(raw);
	return Number.isInteger(id) ? id : undefined;
}

// Every filter is carried in the URL and nothing else, so a filtered browse
// view is linkable and survives a reload (#44), and the form below re-renders
// its own state straight from what was parsed here.
//
// An id naming something that no longer exists is dropped rather than applied,
// so the form, the URL and the result set never disagree: a filter the form
// can't show as active (a deleted Collection has no `<option>` to select, a
// deleted Category no checkbox to tick) must not be silently narrowing the
// list behind it, or pressing Apply without touching anything would change
// what's on screen.
export const load: PageServerLoad = ({ locals, url }) => {
	const sort = parseSort(url.searchParams.get('sort'));
	const search = url.searchParams.get('q') ?? '';
	// `getAll` keeps the repeated-parameter shape a checkbox group submits;
	// `parseCategoryIds` drops the blank/non-numeric ones and de-duplicates.
	const requestedCategoryIds = parseCategoryIds(
		url.searchParams.getAll('category').filter((value) => value.trim() !== '')
	);
	const knownCategoryIds = new Set(getCategoriesByIds(requestedCategoryIds).map((c) => c.id));
	const categoryIds = requestedCategoryIds.filter((id) => knownCategoryIds.has(id));
	const favoritesOnly = url.searchParams.get('favorites') === '1';
	const requestedCollectionId = parseIdParam(url.searchParams.get('collection'));
	const collectionId =
		requestedCollectionId !== undefined && getCollectionById(requestedCollectionId)
			? requestedCollectionId
			: undefined;

	const recipes = listRecipes({ sort, search, categoryIds, favoritesOnly, collectionId });
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
		search,
		categoryIds,
		favoritesOnly,
		collectionId,
		categories: listCategories(),
		collections: listCollections()
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
