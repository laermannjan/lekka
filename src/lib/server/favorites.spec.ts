import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';
import { favorites, profiles, recipes } from './db/schema';
import { isFavorite, listFavoriteRecipeIds, setFavorite } from './favorites';

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
});
