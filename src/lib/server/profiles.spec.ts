import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';
import { profiles } from './db/schema';
import {
	BlankNameError,
	DuplicateNameError,
	createProfile,
	getProfile,
	listProfiles,
	resolveProfile
} from './profiles';

describe('profiles', () => {
	beforeEach(() => {
		db.delete(profiles).run();
	});

	it('lists no profiles initially', () => {
		expect(listProfiles()).toEqual([]);
	});

	it('creates a profile with just a name', () => {
		const profile = createProfile('Jan');

		expect(profile).toMatchObject({ name: 'Jan' });
		expect(profile.id).toEqual(expect.any(Number));
	});

	it('lists created profiles', () => {
		createProfile('Jan');
		createProfile('Alex');

		expect(listProfiles().map((p) => p.name)).toEqual(['Alex', 'Jan']);
	});

	it('rejects a blank name', () => {
		expect(() => createProfile('   ')).toThrow(BlankNameError);
	});

	it('rejects a duplicate name', () => {
		createProfile('Jan');

		expect(() => createProfile('Jan')).toThrow(DuplicateNameError);
	});

	it('trims surrounding whitespace from the name', () => {
		const profile = createProfile('  Jan  ');

		expect(profile.name).toEqual('Jan');
	});

	it('caps the name at 60 characters', () => {
		const profile = createProfile('x'.repeat(100));

		expect(profile.name).toHaveLength(60);
	});

	it('gets a profile by id', () => {
		const created = createProfile('Jan');

		expect(getProfile(created.id)).toEqual(created);
	});

	it('returns undefined for an unknown id', () => {
		expect(getProfile(9999)).toBeUndefined();
	});

	it('resolves a profile from a raw form/cookie value', () => {
		const created = createProfile('Jan');

		expect(resolveProfile(String(created.id))).toEqual(created);
	});

	it('resolves to undefined for a non-numeric or unknown raw value', () => {
		expect(resolveProfile('not-a-number')).toBeUndefined();
		expect(resolveProfile('9999')).toBeUndefined();
		expect(resolveProfile(undefined)).toBeUndefined();
	});
});
