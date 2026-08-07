import { describe, expect, it } from 'vitest';
import { addCategoryToRecipe, createCategory } from '$lib/server/categories';
import { addRecipeToCollection, createCollection } from '$lib/server/collections';
import { setFavorite } from '$lib/server/favorites';
import { createProfile } from '$lib/server/profiles';
import { createRecipe } from '$lib/server/recipes';
import { load } from './+page.server';

// Browse's filters live entirely in the URL, so a filtered view can be linked
// and reloaded (#44). This covers the URL half of that: which query parameters
// map to which filter, and that the load hands the active ones back for the
// form to re-render itself from.
describe('browse page load', () => {
	type BrowseData = {
		recipes: { title: string }[];
		sort: string;
		search: string;
		categoryIds: number[];
		favoritesOnly: boolean;
		collectionId: number | undefined;
	};

	// `load` only reads `url` and `locals`, so the rest of a RequestEvent would
	// be dead weight. Its declared return type is the generic
	// `MaybePromise<void | ...>` every PageServerLoad has; this one is
	// synchronous.
	function browse(query: string): BrowseData {
		const data = load({
			url: new URL(`http://localhost/${query}`),
			locals: { profile: undefined, dinerProfiles: [] }
		} as unknown as Parameters<typeof load>[0]);
		return data as unknown as BrowseData;
	}

	function titles(data: BrowseData): string[] {
		return data.recipes.map((recipe) => recipe.title);
	}

	it('filters by every Category named in the URL', () => {
		const chilli = createRecipe('Chilli con carne');
		const tacos = createRecipe('Tacos');
		createRecipe('Banana bread');
		const dinner = createCategory('dinner', 'meal-type');
		const mexican = createCategory('mexican', 'cuisine');
		addCategoryToRecipe(chilli.id, dinner.id);
		addCategoryToRecipe(tacos.id, dinner.id);
		addCategoryToRecipe(tacos.id, mexican.id);

		expect(titles(browse(`?category=${dinner.id}&sort=alphabetical`))).toEqual([
			'Chilli con carne',
			'Tacos'
		]);
		expect(titles(browse(`?category=${dinner.id}&category=${mexican.id}`))).toEqual(['Tacos']);
	});

	it("filters to household Favorites, including another Profile's", () => {
		const chilli = createRecipe('Chilli con carne');
		createRecipe('Banana bread');
		const alex = createProfile('Alex');
		setFavorite(chilli.id, alex.id, true);

		// `browse` passes no acting Profile at all, so the only Favorite in play
		// is someone else's - a household view, not the current Profile's list
		// (see CONTEXT.md's Favorite).
		const data = browse('?favorites=1');
		expect(titles(data)).toEqual(['Chilli con carne']);
		expect(data.favoritesOnly).toBe(true);
	});

	it("filters to a Collection's members", () => {
		const chilli = createRecipe('Chilli con carne');
		createRecipe('Banana bread');
		const jan = createProfile('Jan');
		const weeknights = createCollection(jan.id, 'Weeknight dinners');
		addRecipeToCollection(weeknights.id, chilli.id);

		const data = browse(`?collection=${weeknights.id}`);
		expect(titles(data)).toEqual(['Chilli con carne']);
		expect(data.collectionId).toEqual(weeknights.id);
	});

	it('composes filters with the existing sort and title search', () => {
		const chilli = createRecipe('Chilli con carne');
		const chilliSin = createRecipe('Chilli sin carne');
		createRecipe('Banana bread');
		const jan = createProfile('Jan');
		const mexican = createCategory('mexican', 'cuisine');
		addCategoryToRecipe(chilli.id, mexican.id);
		addCategoryToRecipe(chilliSin.id, mexican.id);
		setFavorite(chilli.id, jan.id, true);
		setFavorite(chilliSin.id, jan.id, true);

		const data = browse(`?q=chilli&category=${mexican.id}&favorites=1&sort=alphabetical`);
		expect(titles(data)).toEqual(['Chilli con carne', 'Chilli sin carne']);
		expect(data).toMatchObject({
			sort: 'alphabetical',
			search: 'chilli',
			categoryIds: [mexican.id],
			favoritesOnly: true
		});
	});

	it('ignores filter parameters that name nothing', () => {
		createRecipe('Chilli con carne');
		createRecipe('Banana bread');

		const data = browse('?category=&collection=&favorites=');
		expect(titles(data)).toEqual(['Banana bread', 'Chilli con carne']);
		expect(data).toMatchObject({ categoryIds: [], favoritesOnly: false, collectionId: undefined });
	});

	// A link can outlive the Collection or Category it names. Applying such an
	// id would narrow the list behind a form that has no way to show the filter
	// as active, so it's dropped instead - what's on screen always matches what
	// the form says is on.
	it('ignores a Collection id that no longer exists', () => {
		createRecipe('Chilli con carne');

		const data = browse('?collection=999');
		expect(titles(data)).toEqual(['Chilli con carne']);
		expect(data.collectionId).toBeUndefined();
	});

	it('ignores a Category id that no longer exists', () => {
		const chilli = createRecipe('Chilli con carne');
		createRecipe('Banana bread');
		const mexican = createCategory('mexican', 'cuisine');
		addCategoryToRecipe(chilli.id, mexican.id);

		const data = browse(`?category=999&category=${mexican.id}`);
		expect(titles(data)).toEqual(['Chilli con carne']);
		expect(data.categoryIds).toEqual([mexican.id]);
	});
});
