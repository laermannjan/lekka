import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { favorites, profiles, type Profile } from './db/schema';

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

// Every Recipe favorited by anyone in the household - what the browse
// Favorites filter narrows to. A Favorite is personal to set but visible
// household-wide (see CONTEXT.md's Favorite), so this deliberately takes no
// acting Profile: browsing is a household view, and a Recipe only Alex starred
// is still a Recipe the household has starred.
export function listFavoritedRecipeIds(): Set<number> {
	const rows = db.selectDistinct({ recipeId: favorites.recipeId }).from(favorites).all();
	return new Set(rows.map((row) => row.recipeId));
}

// Every Profile that has favorited a Recipe. A Favorite is set per-Profile but
// visible household-wide (see CONTEXT.md's Favorite) - `profileId` records who
// marked it, not who may see it, so this deliberately takes no acting Profile.
export function listFavoriteProfiles(recipeId: number): Profile[] {
	const rows = db
		.select({ profile: profiles })
		.from(favorites)
		.innerJoin(profiles, eq(profiles.id, favorites.profileId))
		.where(eq(favorites.recipeId, recipeId))
		.orderBy(asc(profiles.name))
		.all();
	return rows.map((row) => row.profile);
}

// The same household-wide view for many Recipes at once, keyed by recipeId -
// for list views that show who favorited each row without one query per row.
export function listFavoriteProfilesForRecipes(recipeIds: number[]): Map<number, Profile[]> {
	const byRecipeId = new Map<number, Profile[]>();
	if (recipeIds.length === 0) return byRecipeId;

	const rows = db
		.select({ recipeId: favorites.recipeId, profile: profiles })
		.from(favorites)
		.innerJoin(profiles, eq(profiles.id, favorites.profileId))
		.where(inArray(favorites.recipeId, recipeIds))
		.orderBy(asc(profiles.name))
		.all();

	for (const row of rows) {
		const list = byRecipeId.get(row.recipeId) ?? [];
		list.push(row.profile);
		byRecipeId.set(row.recipeId, list);
	}
	return byRecipeId;
}
