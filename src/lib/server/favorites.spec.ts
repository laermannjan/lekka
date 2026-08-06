import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';
import { favorites, profiles, recipes } from './db/schema';
import {
	isFavorite,
	listFavoriteProfiles,
	listFavoriteProfilesForRecipes,
	listFavoriteRecipeIds,
	setFavorite
} from './favorites';

describe('favorites', () => {
	beforeEach(() => {
		db.delete(favorites).run();
		db.delete(recipes).run();
		db.delete(profiles).run();
	});

	function makeRecipe(title = 'Chilli con carne') {
		return db.insert(recipes).values({ title }).returning().get();
	}

	function makeProfile(name = 'Jan') {
		return db.insert(profiles).values({ name }).returning().get();
	}

	it('is not favorited by default', () => {
		const recipe = makeRecipe();
		const profile = makeProfile();

		expect(isFavorite(recipe.id, profile.id)).toBe(false);
	});

	it('marks a recipe as favorite', () => {
		const recipe = makeRecipe();
		const profile = makeProfile();

		setFavorite(recipe.id, profile.id, true);

		expect(isFavorite(recipe.id, profile.id)).toBe(true);
	});

	it('unmarks a recipe as favorite', () => {
		const recipe = makeRecipe();
		const profile = makeProfile();
		setFavorite(recipe.id, profile.id, true);

		setFavorite(recipe.id, profile.id, false);

		expect(isFavorite(recipe.id, profile.id)).toBe(false);
	});

	it('is idempotent when marking twice', () => {
		const recipe = makeRecipe();
		const profile = makeProfile();

		setFavorite(recipe.id, profile.id, true);
		setFavorite(recipe.id, profile.id, true);

		expect(isFavorite(recipe.id, profile.id)).toBe(true);
	});

	it('tracks favorites per profile independently', () => {
		const recipe = makeRecipe();
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');

		setFavorite(recipe.id, jan.id, true);

		expect(isFavorite(recipe.id, jan.id)).toBe(true);
		expect(isFavorite(recipe.id, alex.id)).toBe(false);
	});

	it('lists favorite recipe ids for a profile', () => {
		const a = makeRecipe('A');
		const b = makeRecipe('B');
		const profile = makeProfile();
		setFavorite(a.id, profile.id, true);

		expect(listFavoriteRecipeIds(profile.id)).toEqual([a.id]);
		expect(listFavoriteRecipeIds(profile.id)).not.toContain(b.id);
	});

	// A Favorite is set per-Profile but visible household-wide (CONTEXT.md's
	// Favorite), so these read across every Profile, not just the acting one.
	it('lists every profile that favorited a recipe, whoever is asking', () => {
		const recipe = makeRecipe();
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');
		setFavorite(recipe.id, jan.id, true);
		setFavorite(recipe.id, alex.id, true);

		expect(listFavoriteProfiles(recipe.id).map((p) => p.name)).toEqual(['Alex', 'Jan']);
	});

	it('lists no profiles for a recipe nobody favorited', () => {
		const recipe = makeRecipe();
		makeProfile();

		expect(listFavoriteProfiles(recipe.id)).toEqual([]);
	});

	it('drops a profile once it unfavorites', () => {
		const recipe = makeRecipe();
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');
		setFavorite(recipe.id, jan.id, true);
		setFavorite(recipe.id, alex.id, true);

		setFavorite(recipe.id, jan.id, false);

		expect(listFavoriteProfiles(recipe.id).map((p) => p.name)).toEqual(['Alex']);
	});

	it('batches the household-wide view by recipe id', () => {
		const a = makeRecipe('A');
		const b = makeRecipe('B');
		const c = makeRecipe('C');
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');
		setFavorite(a.id, jan.id, true);
		setFavorite(a.id, alex.id, true);
		setFavorite(b.id, alex.id, true);

		const byRecipeId = listFavoriteProfilesForRecipes([a.id, b.id, c.id]);

		expect(byRecipeId.get(a.id)?.map((p) => p.name)).toEqual(['Alex', 'Jan']);
		expect(byRecipeId.get(b.id)?.map((p) => p.name)).toEqual(['Alex']);
		expect(byRecipeId.get(c.id)).toBeUndefined();
	});

	it('returns an empty map for no recipe ids', () => {
		expect(listFavoriteProfilesForRecipes([]).size).toBe(0);
	});
});
