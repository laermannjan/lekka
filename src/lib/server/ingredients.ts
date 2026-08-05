import { asc, eq } from 'drizzle-orm';
import { db } from './db';
import { ingredients, ingredientTags, tags, type Ingredient, type Tag } from './db/schema';
import { getTagsByIds, parseTagIds } from './tags';

export type IngredientWithTags = Ingredient & { tags: Tag[] };

const MAX_BASE_TERM_LENGTH = 80;

export class BlankBaseTermError extends Error {}

export function createIngredient(input: {
	baseTerm: string;
	descriptors?: string;
	roundToWholeUnit?: boolean;
	tagIds?: number[];
}): IngredientWithTags {
	const baseTerm = input.baseTerm.trim().slice(0, MAX_BASE_TERM_LENGTH);
	if (!baseTerm) throw new BlankBaseTermError('Base term must not be blank');

	const trimmedDescriptors = input.descriptors?.trim();
	const descriptors = trimmedDescriptors ? trimmedDescriptors : null;
	// Silently drops ids that don't match a real Tag (e.g. a stale form
	// submission) rather than failing the whole Ingredient creation on them.
	const attachedTags = getTagsByIds(parseTagIds(input.tagIds ?? []));

	return db.transaction((tx) => {
		const ingredient = tx
			.insert(ingredients)
			.values({
				baseTerm,
				descriptors,
				roundToWholeUnit: input.roundToWholeUnit ?? false
			})
			.returning()
			.get();

		if (attachedTags.length > 0) {
			tx.insert(ingredientTags)
				.values(attachedTags.map((tag) => ({ ingredientId: ingredient.id, tagId: tag.id })))
				.run();
		}

		return { ...ingredient, tags: attachedTags };
	});
}

export function listIngredients(): IngredientWithTags[] {
	const rows = db
		.select({ ingredient: ingredients, tag: tags })
		.from(ingredients)
		.leftJoin(ingredientTags, eq(ingredientTags.ingredientId, ingredients.id))
		.leftJoin(tags, eq(tags.id, ingredientTags.tagId))
		.orderBy(asc(ingredients.baseTerm), asc(ingredients.descriptors))
		.all();

	const byId = new Map<number, IngredientWithTags>();
	for (const row of rows) {
		let entry = byId.get(row.ingredient.id);
		if (!entry) {
			entry = { ...row.ingredient, tags: [] };
			byId.set(row.ingredient.id, entry);
		}
		if (row.tag) entry.tags.push(row.tag);
	}
	return [...byId.values()];
}

export function listBaseTerms(): string[] {
	const rows = db.selectDistinct({ baseTerm: ingredients.baseTerm }).from(ingredients).all();
	return rows.map((r) => r.baseTerm).sort((a, b) => a.localeCompare(b));
}
