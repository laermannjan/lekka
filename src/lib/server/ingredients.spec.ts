import { describe, expect, it } from 'vitest';
import {
	BlankBaseTermError,
	createIngredient,
	listBaseTerms,
	listIngredients
} from './ingredients';
import { createTag } from './tags';

describe('ingredients', () => {
	it('lists no ingredients initially', () => {
		expect(listIngredients()).toEqual([]);
	});

	it('creates an ingredient with just a base term', () => {
		const ingredient = createIngredient({ baseTerm: 'milk' });

		expect(ingredient).toMatchObject({
			baseTerm: 'milk',
			descriptors: null,
			roundToWholeUnit: false,
			tags: []
		});
		expect(ingredient.id).toEqual(expect.any(Number));
	});

	it('creates an ingredient with descriptors and rounding', () => {
		const ingredient = createIngredient({
			baseTerm: 'egg',
			descriptors: 'large',
			roundToWholeUnit: true
		});

		expect(ingredient).toMatchObject({
			baseTerm: 'egg',
			descriptors: 'large',
			roundToWholeUnit: true
		});
	});

	it('rejects a blank base term', () => {
		expect(() => createIngredient({ baseTerm: '  ' })).toThrow(BlankBaseTermError);
	});

	it('trims surrounding whitespace from base term and descriptors', () => {
		const ingredient = createIngredient({ baseTerm: '  milk  ', descriptors: '  almond  ' });

		expect(ingredient.baseTerm).toEqual('milk');
		expect(ingredient.descriptors).toEqual('almond');
	});

	it('stores blank descriptors as null', () => {
		const ingredient = createIngredient({ baseTerm: 'milk', descriptors: '   ' });

		expect(ingredient.descriptors).toBeNull();
	});

	it('attaches any number of tags to an ingredient', () => {
		const nutDerived = createTag('nut-derived', 'sensory');
		const dairyAlternative = createTag('dairy-alternative', 'diet');

		const ingredient = createIngredient({
			baseTerm: 'milk',
			descriptors: 'almond',
			tagIds: [nutDerived.id, dairyAlternative.id]
		});

		expect(ingredient.tags.map((t) => t.name).sort()).toEqual(['dairy-alternative', 'nut-derived']);
	});

	it('ignores tag ids that no longer match a real tag', () => {
		const vegan = createTag('vegan', 'diet');

		const ingredient = createIngredient({ baseTerm: 'milk', tagIds: [vegan.id, 999999] });

		expect(ingredient.tags.map((t) => t.name)).toEqual(['vegan']);
	});

	it('lists ingredients with their tags', () => {
		const vegan = createTag('vegan', 'diet');
		createIngredient({ baseTerm: 'tofu', tagIds: [vegan.id] });
		createIngredient({ baseTerm: 'milk' });

		const listed = listIngredients();
		expect(listed).toHaveLength(2);
		const tofu = listed.find((i) => i.baseTerm === 'tofu');
		expect(tofu?.tags.map((t) => t.name)).toEqual(['vegan']);
	});

	it('lists distinct base terms for autocomplete, ordered alphabetically', () => {
		createIngredient({ baseTerm: 'milk', descriptors: 'almond' });
		createIngredient({ baseTerm: 'milk', descriptors: 'oat' });
		createIngredient({ baseTerm: 'egg' });

		expect(listBaseTerms()).toEqual(['egg', 'milk']);
	});
});
