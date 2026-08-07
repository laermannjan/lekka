import { describe, expect, it } from 'vitest';
import { parseRowId, parseRowIds } from './form';

describe('parseRowId', () => {
	it('reads a positive integer id', () => {
		expect(parseRowId('42')).toBe(42);
	});

	it('tolerates surrounding whitespace', () => {
		expect(parseRowId(' 42 ')).toBe(42);
	});

	it.each([
		['missing', null],
		['undefined', undefined],
		['blank', ''],
		['whitespace only', '   '],
		['non-numeric', 'abc'],
		['partly numeric', '42abc'],
		['fractional', '4.2'],
		['zero', '0'],
		['negative', '-1'],
		['infinite', 'Infinity']
	])('rejects a %s value', (_label, raw) => {
		expect(parseRowId(raw)).toBeUndefined();
	});
});

describe('parseRowIds', () => {
	it('reads every id of a repeated field', () => {
		expect(parseRowIds(['1', '2', '3'])).toEqual([1, 2, 3]);
	});

	it('de-duplicates the same id submitted twice', () => {
		expect(parseRowIds(['1', '1', '2'])).toEqual([1, 2]);
	});

	it('reads an empty field as an empty set', () => {
		expect(parseRowIds([])).toEqual([]);
	});

	// Dropping the bad value instead would record a set the author never
	// submitted - one Diner short of the people who were actually there.
	it('rejects the whole set when one value is not an id', () => {
		expect(parseRowIds(['1', 'abc'])).toBeUndefined();
	});
});
