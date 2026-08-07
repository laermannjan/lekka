import { describe, expect, it } from 'vitest';
import { BlankNameError, DuplicateNameError, createTag, listTags } from './tags';

describe('tags', () => {
	it('lists no tags initially', () => {
		expect(listTags()).toEqual([]);
	});

	it('creates a tag with a name and group', () => {
		const tag = createTag('vegan', 'diet');

		expect(tag).toMatchObject({ name: 'vegan', tagGroup: 'diet' });
		expect(tag.id).toEqual(expect.any(Number));
	});

	it('lists tags ordered by group then name', () => {
		createTag('vegan', 'diet');
		createTag('peanut', 'allergen');
		createTag('creamy', 'sensory');
		createTag('gluten-free', 'diet');

		expect(listTags().map((t) => [t.tagGroup, t.name])).toEqual([
			['allergen', 'peanut'],
			['diet', 'gluten-free'],
			['diet', 'vegan'],
			['sensory', 'creamy']
		]);
	});

	it('rejects a blank name', () => {
		expect(() => createTag('   ', 'diet')).toThrow(BlankNameError);
	});

	it('rejects a duplicate name regardless of case', () => {
		createTag('vegan', 'diet');

		expect(() => createTag('Vegan', 'diet')).toThrow(DuplicateNameError);
	});

	it('trims surrounding whitespace from the name', () => {
		const tag = createTag('  vegan  ', 'diet');

		expect(tag.name).toEqual('vegan');
	});
});
