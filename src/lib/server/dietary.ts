import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { ingredientTags, profileAvoidTags, tags, type Tag } from './db/schema';

// A Profile's standing dietary preference - the avoid-Tags it carries (see
// CONTEXT.md's Profile and Diners). Editable only by that Profile in the UI.
export function getAvoidTagsForProfile(profileId: number): Tag[] {
	const rows = db
		.select({ tag: tags })
		.from(profileAvoidTags)
		.innerJoin(tags, eq(tags.id, profileAvoidTags.tagId))
		.where(eq(profileAvoidTags.profileId, profileId))
		.all();
	return rows.map((row) => row.tag).sort((a, b) => a.name.localeCompare(b.name));
}

// Replaces a Profile's entire avoid-Tag set with `tagIds` in one
// transaction - the same replace-all shape as an Ingredient's Tags.
export function setProfileAvoidTags(profileId: number, tagIds: number[]): void {
	const uniqueIds = [...new Set(tagIds)];
	db.transaction((tx) => {
		tx.delete(profileAvoidTags).where(eq(profileAvoidTags.profileId, profileId)).run();
		if (uniqueIds.length > 0) {
			tx.insert(profileAvoidTags)
				.values(uniqueIds.map((tagId) => ({ profileId, tagId })))
				.run();
		}
	});
}

// The union of avoid-Tag ids across every selected Diner Profile (see
// CONTEXT.md's Diners) - what the dietary filter actually flags Usages
// against.
export function getAvoidTagIdsForProfiles(profileIds: number[]): Set<number> {
	if (profileIds.length === 0) return new Set();
	const rows = db
		.select({ tagId: profileAvoidTags.tagId })
		.from(profileAvoidTags)
		.where(inArray(profileAvoidTags.profileId, profileIds))
		.all();
	return new Set(rows.map((row) => row.tagId));
}

// Which of `avoidTagIds` sit on each of `ingredientIds`, keyed by Ingredient
// id - used to flag an Ingredient Usage (never hide it) when it carries a
// Tag any selected Diner avoids (see CONTEXT.md's Diners). Empty/omitted
// when nothing is avoided, so callers can skip the query entirely when no
// Diner has a standing preference.
export function getFlaggedTagsByIngredientIds(
	ingredientIds: number[],
	avoidTagIds: Set<number>
): Map<number, Tag[]> {
	const result = new Map<number, Tag[]>();
	if (avoidTagIds.size === 0 || ingredientIds.length === 0) return result;

	const rows = db
		.select({ ingredientId: ingredientTags.ingredientId, tag: tags })
		.from(ingredientTags)
		.innerJoin(tags, eq(tags.id, ingredientTags.tagId))
		.where(inArray(ingredientTags.ingredientId, [...new Set(ingredientIds)]))
		.all();

	for (const row of rows) {
		if (!avoidTagIds.has(row.tag.id)) continue;
		const list = result.get(row.ingredientId) ?? [];
		list.push(row.tag);
		result.set(row.ingredientId, list);
	}
	return result;
}

// Which Usages may have their declared Alternative surfaced as a suggested
// swap - only those whose Alternative Ingredient clears the flag, i.e. carries
// none of the avoided Tags itself (see CONTEXT.md's Diners: "if that Usage has
// an Alternative *clearing* the flag"). Margarine tagged `dairy` is never
// offered to a Diner avoiding `dairy`, and neither is an Alternative carrying
// some other avoided Tag - swapping one flag for another clears nothing. The
// Usage itself stays flagged and visible either way; this only decides whether
// a swap is offered alongside the flag.
export function getUsageIdsWithClearingAlternative(
	usages: readonly { id: number; alternativeIngredientId: number | null }[],
	avoidTagIds: Set<number>
): Set<number> {
	const withAlternative = usages.filter((usage) => usage.alternativeIngredientId != null);
	if (withAlternative.length === 0) return new Set();
	if (avoidTagIds.size === 0) return new Set(withAlternative.map((usage) => usage.id));

	const flaggedByIngredientId = getFlaggedTagsByIngredientIds(
		withAlternative.map((usage) => usage.alternativeIngredientId as number),
		avoidTagIds
	);
	return new Set(
		withAlternative
			.filter((usage) => !flaggedByIngredientId.has(usage.alternativeIngredientId as number))
			.map((usage) => usage.id)
	);
}
