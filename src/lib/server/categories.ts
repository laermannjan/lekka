import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	categories,
	recipeCategories,
	CATEGORY_GROUPS,
	type Category,
	type CategoryGroup
} from './db/schema';

export function listCategories(): Category[] {
	return db
		.select()
		.from(categories)
		.orderBy(asc(categories.categoryGroup), asc(categories.name))
		.all();
}

const MAX_NAME_LENGTH = 60;

export class BlankNameError extends Error {}
export class DuplicateNameError extends Error {}
export class InvalidCategoryGroupError extends Error {}

// Category names are normalized to lowercase so autocomplete-driven reuse
// doesn't fracture the vocabulary into case variants of the same Category
// (see CONTEXT.md, same governance shape as Tag).
export function createCategory(name: string, categoryGroup: string): Category {
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH).toLowerCase();
	if (!trimmed) throw new BlankNameError('Category name must not be blank');
	if (!CATEGORY_GROUPS.includes(categoryGroup as CategoryGroup)) {
		throw new InvalidCategoryGroupError(`Unknown category group "${categoryGroup}"`);
	}

	try {
		return db
			.insert(categories)
			.values({ name: trimmed, categoryGroup: categoryGroup as CategoryGroup })
			.returning()
			.get();
	} catch (error) {
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			throw new DuplicateNameError(`Category "${trimmed}" already exists`);
		}
		throw error;
	}
}

export function parseCategoryIds(rawIds: unknown[]): number[] {
	const ids = rawIds.map(Number).filter((id) => Number.isInteger(id));
	return [...new Set(ids)];
}

export function getCategoriesByIds(ids: number[]): Category[] {
	if (ids.length === 0) return [];
	return db.select().from(categories).where(inArray(categories.id, ids)).all();
}

export class CategoryNotFoundError extends Error {}

// Attaches a Category to a Recipe - shared across every Composition of that
// Recipe (see CONTEXT.md). A no-op if it's already attached.
export function addCategoryToRecipe(recipeId: number, categoryId: number): void {
	const category = db.select().from(categories).where(eq(categories.id, categoryId)).get();
	if (!category) throw new CategoryNotFoundError(`No category ${categoryId}`);

	db.insert(recipeCategories).values({ recipeId, categoryId }).onConflictDoNothing().run();
}

export function removeCategoryFromRecipe(recipeId: number, categoryId: number): void {
	db.delete(recipeCategories)
		.where(
			and(eq(recipeCategories.recipeId, recipeId), eq(recipeCategories.categoryId, categoryId))
		)
		.run();
}

export function listCategoriesForRecipe(recipeId: number): Category[] {
	const rows = db
		.select({ category: categories })
		.from(recipeCategories)
		.innerJoin(categories, eq(categories.id, recipeCategories.categoryId))
		.where(eq(recipeCategories.recipeId, recipeId))
		.all();
	return rows.map((row) => row.category).sort((a, b) => a.name.localeCompare(b.name));
}

// Categories for many Recipes at once, keyed by recipeId - for list views
// that show every Recipe's Categories without one query per row.
export function listCategoriesForRecipes(recipeIds: number[]): Map<number, Category[]> {
	const byRecipeId = new Map<number, Category[]>();
	if (recipeIds.length === 0) return byRecipeId;

	const rows = db
		.select({ recipeId: recipeCategories.recipeId, category: categories })
		.from(recipeCategories)
		.innerJoin(categories, eq(categories.id, recipeCategories.categoryId))
		.where(inArray(recipeCategories.recipeId, recipeIds))
		.all();

	for (const row of rows) {
		const list = byRecipeId.get(row.recipeId) ?? [];
		list.push(row.category);
		byRecipeId.set(row.recipeId, list);
	}
	return byRecipeId;
}
