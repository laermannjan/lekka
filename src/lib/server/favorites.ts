import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { favorites } from './db/schema';

// Sets or clears a Profile's Favorite mark on a Recipe (see CONTEXT.md).
// Operates at the Recipe level, not per-Composition - a row's presence is
// the mark itself, so there's no separate boolean to fall out of sync.
export function setFavorite(recipeId: number, profileId: number, isFavorite: boolean): void {
	if (isFavorite) {
		db.insert(favorites).values({ recipeId, profileId }).onConflictDoNothing().run();
	} else {
		db.delete(favorites)
			.where(and(eq(favorites.recipeId, recipeId), eq(favorites.profileId, profileId)))
			.run();
	}
}

export function isFavorite(recipeId: number, profileId: number): boolean {
	const row = db
		.select()
		.from(favorites)
		.where(and(eq(favorites.recipeId, recipeId), eq(favorites.profileId, profileId)))
		.get();
	return row !== undefined;
}

// Every Recipe id a Profile has favorited - for list views that need to mark
// which rows are favorited without one query per row.
export function listFavoriteRecipeIds(profileId: number): number[] {
	const rows = db
		.select({ recipeId: favorites.recipeId })
		.from(favorites)
		.where(eq(favorites.profileId, profileId))
		.all();
	return rows.map((row) => row.recipeId);
}
