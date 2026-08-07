import { describe, expect, it } from 'vitest';
import { db } from './db';
import { profiles, recipes } from './db/schema';
import {
	BlankNameError,
	CollectionNotFoundError,
	addRecipeToCollection,
	createCollection,
	getCollectionDetail,
	listCollections,
	listCollectionsForRecipe,
	listCollectionsForRecipes,
	removeRecipeFromCollection
} from './collections';

describe('collections', () => {
	function makeRecipe(title = 'Chilli con carne') {
		return db.insert(recipes).values({ title }).returning().get();
	}

	function makeProfile(name = 'Jan') {
		return db.insert(profiles).values({ name }).returning().get();
	}

	it('lists no collections initially', () => {
		expect(listCollections()).toEqual([]);
	});

	it('creates a collection owned by a profile', () => {
		const profile = makeProfile();

		const collection = createCollection(profile.id, 'weeknight dinners');

		expect(collection).toMatchObject({ name: 'weeknight dinners', profileId: profile.id });
	});

	it('rejects a blank name', () => {
		const profile = makeProfile();

		expect(() => createCollection(profile.id, '   ')).toThrow(BlankNameError);
	});

	it('trims surrounding whitespace from the name', () => {
		const profile = makeProfile();

		const collection = createCollection(profile.id, '  weeknight dinners  ');

		expect(collection.name).toEqual('weeknight dinners');
	});

	it('adds and removes recipes from a collection', () => {
		const profile = makeProfile();
		const recipe = makeRecipe();
		const collection = createCollection(profile.id, 'weeknight dinners');

		addRecipeToCollection(collection.id, recipe.id);
		expect(getCollectionDetail(collection.id)?.recipes.map((r) => r.id)).toEqual([recipe.id]);

		removeRecipeFromCollection(collection.id, recipe.id);
		expect(getCollectionDetail(collection.id)?.recipes).toEqual([]);
	});

	it('is a no-op adding an already-member recipe', () => {
		const profile = makeProfile();
		const recipe = makeRecipe();
		const collection = createCollection(profile.id, 'weeknight dinners');

		addRecipeToCollection(collection.id, recipe.id);
		addRecipeToCollection(collection.id, recipe.id);

		expect(getCollectionDetail(collection.id)?.recipes).toHaveLength(1);
	});

	it('rejects adding a recipe to an unknown collection', () => {
		const recipe = makeRecipe();

		expect(() => addRecipeToCollection(999999, recipe.id)).toThrow(CollectionNotFoundError);
	});

	it('allows a recipe to belong to multiple collections', () => {
		const profile = makeProfile();
		const recipe = makeRecipe();
		const dinners = createCollection(profile.id, 'weeknight dinners');
		const spicy = createCollection(profile.id, 'spicy');

		addRecipeToCollection(dinners.id, recipe.id);
		addRecipeToCollection(spicy.id, recipe.id);

		expect(listCollectionsForRecipe(recipe.id).map((c) => c.name)).toEqual([
			'spicy',
			'weeknight dinners'
		]);
	});

	it('lists collections for many recipes at once', () => {
		const profile = makeProfile();
		const a = makeRecipe('A');
		const b = makeRecipe('B');
		const dinners = createCollection(profile.id, 'weeknight dinners');
		addRecipeToCollection(dinners.id, a.id);

		const byRecipeId = listCollectionsForRecipes([a.id, b.id]);

		expect(byRecipeId.get(a.id)?.map((c) => c.name)).toEqual(['weeknight dinners']);
		expect(byRecipeId.get(b.id)).toBeUndefined();
	});

	it('returns undefined detail for an unknown collection', () => {
		expect(getCollectionDetail(999999)).toBeUndefined();
	});
});
