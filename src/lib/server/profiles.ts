import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { profiles, type Profile } from './db/schema';
import { isUniqueConstraintError, normalizeVocabularyName } from './vocabulary';

export function listProfiles(): Profile[] {
	return db.select().from(profiles).orderBy(asc(profiles.name)).all();
}

export function getProfile(id: number): Profile | undefined {
	return db.select().from(profiles).where(eq(profiles.id, id)).get();
}

// Resolves an arbitrary form/cookie value to a real Profile, or undefined if
// it doesn't parse or no longer exists (e.g. a stale cookie after deletion).
export function resolveProfile(rawId: unknown): Profile | undefined {
	const id = Number(rawId);
	return Number.isInteger(id) ? getProfile(id) : undefined;
}

// Resolves the Diners cookie's raw ids to real Profiles (see CONTEXT.md's
// Diners), silently dropping any id that no longer exists (e.g. a deleted
// Profile) rather than failing the whole selection on it.
export function resolveDinerProfiles(rawIds: number[]): Profile[] {
	if (rawIds.length === 0) return [];
	const rows = db.select().from(profiles).where(inArray(profiles.id, rawIds)).all();
	return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const MAX_NAME_LENGTH = 60;

export class BlankNameError extends Error {}
export class DuplicateNameError extends Error {}

export function createProfile(name: string): Profile {
	// Profile names keep their case - a person's name is a proper noun, not a
	// vocabulary term matched against by autocomplete.
	const trimmed = normalizeVocabularyName(name, MAX_NAME_LENGTH, { lowercase: false });
	if (!trimmed) throw new BlankNameError('Profile name must not be blank');

	try {
		return db.insert(profiles).values({ name: trimmed }).returning().get();
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new DuplicateNameError(`Profile name "${trimmed}" is already taken`);
		}
		throw error;
	}
}
