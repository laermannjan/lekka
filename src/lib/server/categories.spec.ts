import { describe, expect, it } from 'vitest';
import { db } from './db';
import { recipes } from './db/schema';
import {
	BlankNameError,
	CategoryNotFoundError,
	DuplicateNameError,
	InvalidCategoryGroupError,
	addCategoryToRecipe,
	createCategory,
	getCategoriesByIds,
	listCategories,
	listCategoriesForRecipe,
	listCategoriesForRecipes,
	removeCategoryFromRecipe
} from './categories';

describe('categories', () => {
	it('lists no categories initially', () => {
		expect(listCategories()).toEqual([]);
	});

	it('creates a category with a name and group', () => {
		const category = createCategory('mexican', 'cuisine');

		expect(category).toMatchObject({ name: 'mexican', categoryGroup: 'cuisine' });
		expect(category.id).toEqual(expect.any(Number));
	});

	it('lists categories ordered by group then name', () => {
		createCategory('dinner', 'meal-type');
		createCategory('mexican', 'cuisine');
		createCategory('main-course', 'course');
		createCategory('breakfast', 'meal-type');

		expect(listCategories().map((c) => [c.categoryGroup, c.name])).toEqual([
			['course', 'main-course'],
			['cuisine', 'mexican'],
			['meal-type', 'breakfast'],
			['meal-type', 'dinner']
		]);
	});

	it('rejects a blank name', () => {
		expect(() => createCategory('   ', 'cuisine')).toThrow(BlankNameError);
	});

	it('rejects an unknown category group', () => {
		expect(() => createCategory('mexican', 'not-a-group')).toThrow(InvalidCategoryGroupError);
	});

	it('rejects a duplicate name regardless of case', () => {
		createCategory('mexican', 'cuisine');

		expect(() => createCategory('Mexican', 'cuisine')).toThrow(DuplicateNameError);
	});

	it('trims surrounding whitespace from the name', () => {
		const category = createCategory('  mexican  ', 'cuisine');

		expect(category.name).toEqual('mexican');
	});

	it('fetches categories by id', () => {
		const a = createCategory('mexican', 'cuisine');
		const b = createCategory('dinner', 'meal-type');

		expect(
			getCategoriesByIds([a.id, b.id])
				.map((c) => c.name)
				.sort()
		).toEqual(['dinner', 'mexican']);
	});

	describe('recipe attachment', () => {
		function makeRecipe() {
			return db.insert(recipes).values({ title: 'Chilli con carne' }).returning().get();
		}

		it('attaches and lists categories for a recipe', () => {
			const recipe = makeRecipe();
			const mexican = createCategory('mexican', 'cuisine');
			const dinner = createCategory('dinner', 'meal-type');

			addCategoryToRecipe(recipe.id, mexican.id);
			addCategoryToRecipe(recipe.id, dinner.id);

			expect(listCategoriesForRecipe(recipe.id).map((c) => c.name)).toEqual(['dinner', 'mexican']);
		});

		it('is a no-op attaching an already-attached category', () => {
			const recipe = makeRecipe();
			const mexican = createCategory('mexican', 'cuisine');

			addCategoryToRecipe(recipe.id, mexican.id);
			addCategoryToRecipe(recipe.id, mexican.id);

			expect(listCategoriesForRecipe(recipe.id)).toHaveLength(1);
		});

		it('rejects attaching an unknown category', () => {
			const recipe = makeRecipe();

			expect(() => addCategoryToRecipe(recipe.id, 999999)).toThrow(CategoryNotFoundError);
		});

		it('removes a category from a recipe', () => {
			const recipe = makeRecipe();
			const mexican = createCategory('mexican', 'cuisine');
			addCategoryToRecipe(recipe.id, mexican.id);

			removeCategoryFromRecipe(recipe.id, mexican.id);

			expect(listCategoriesForRecipe(recipe.id)).toEqual([]);
		});

		it('lists categories for many recipes at once', () => {
			const a = makeRecipe();
			const b = makeRecipe();
			const mexican = createCategory('mexican', 'cuisine');
			addCategoryToRecipe(a.id, mexican.id);

			const byRecipeId = listCategoriesForRecipes([a.id, b.id]);

			expect(byRecipeId.get(a.id)?.map((c) => c.name)).toEqual(['mexican']);
			expect(byRecipeId.get(b.id)).toBeUndefined();
		});
	});
});
