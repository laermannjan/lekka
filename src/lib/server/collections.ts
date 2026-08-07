import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { collections, collectionRecipes, recipes, type Collection, type Recipe } from './db/schema';

const MAX_NAME_LENGTH = 80;

export class BlankNameError extends Error {}
export class CollectionNotFoundError extends Error {}

// Creates a named Collection owned by a Profile (see CONTEXT.md). Visible
// and editable household-wide once created, same as every other
// Profile-owned concept here - `profileId` records ownership only, no
// access control.
export function createCollection(profileId: number, name: string): Collection {
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
	if (!trimmed) throw new BlankNameError('Collection name must not be blank');

	return db.insert(collections).values({ profileId, name: trimmed }).returning().get();
}

export function listCollections(): Collection[] {
	return db.select().from(collections).orderBy(asc(collections.name)).all();
}

export function getCollectionById(id: number): Collection | undefined {
	return db.select().from(collections).where(eq(collections.id, id)).get();
}

// Adds a Recipe to a Collection - a no-op if it's already a member. A Recipe
// can belong to any number of Collections, same multi-membership as Tag
// (see CONTEXT.md).
export function addRecipeToCollection(collectionId: number, recipeId: number): void {
	const collection = getCollectionById(collectionId);
	if (!collection) throw new CollectionNotFoundError(`No collection ${collectionId}`);

	db.insert(collectionRecipes).values({ collectionId, recipeId }).onConflictDoNothing().run();
}

export function removeRecipeFromCollection(collectionId: number, recipeId: number): void {
	db.delete(collectionRecipes)
		.where(
			and(
				eq(collectionRecipes.collectionId, collectionId),
				eq(collectionRecipes.recipeId, recipeId)
			)
		)
		.run();
}

export type CollectionDetail = Collection & { recipes: Recipe[] };

export function getCollectionDetail(id: number): CollectionDetail | undefined {
	const collection = getCollectionById(id);
	if (!collection) return undefined;

	const rows = db
		.select({ recipe: recipes })
		.from(collectionRecipes)
		.innerJoin(recipes, eq(recipes.id, collectionRecipes.recipeId))
		.where(eq(collectionRecipes.collectionId, id))
		.all();

	return { ...collection, recipes: rows.map((row) => row.recipe) };
}

// A Collection's members as an id set - what the browse Collection filter
// narrows to. An unknown Collection id yields no members rather than an error:
// a stale link is an empty browse view, not a broken page.
export function listRecipeIdsInCollection(collectionId: number): Set<number> {
	const rows = db
		.select({ recipeId: collectionRecipes.recipeId })
		.from(collectionRecipes)
		.where(eq(collectionRecipes.collectionId, collectionId))
		.all();
	return new Set(rows.map((row) => row.recipeId));
}

export function listCollectionsForRecipe(recipeId: number): Collection[] {
	const rows = db
		.select({ collection: collections })
		.from(collectionRecipes)
		.innerJoin(collections, eq(collections.id, collectionRecipes.collectionId))
		.where(eq(collectionRecipes.recipeId, recipeId))
		.all();
	return rows.map((row) => row.collection).sort((a, b) => a.name.localeCompare(b.name));
}

// Collections for many Recipes at once, keyed by recipeId - for list views
// that show every Recipe's Collection membership without one query per row.
export function listCollectionsForRecipes(recipeIds: number[]): Map<number, Collection[]> {
	const byRecipeId = new Map<number, Collection[]>();
	if (recipeIds.length === 0) return byRecipeId;

	const rows = db
		.select({ recipeId: collectionRecipes.recipeId, collection: collections })
		.from(collectionRecipes)
		.innerJoin(collections, eq(collections.id, collectionRecipes.collectionId))
		.where(inArray(collectionRecipes.recipeId, recipeIds))
		.all();

	for (const row of rows) {
		const list = byRecipeId.get(row.recipeId) ?? [];
		list.push(row.collection);
		byRecipeId.set(row.recipeId, list);
	}
	return byRecipeId;
}
