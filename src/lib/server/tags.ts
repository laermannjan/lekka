import { asc, inArray } from 'drizzle-orm';
import { db } from './db';
import { tags, TAG_GROUPS, type Tag, type TagGroup } from './db/schema';

export function listTags(): Tag[] {
	return db.select().from(tags).orderBy(asc(tags.tagGroup), asc(tags.name)).all();
}

const MAX_NAME_LENGTH = 60;

export class BlankNameError extends Error {}
export class DuplicateNameError extends Error {}
export class InvalidTagGroupError extends Error {}

// Tag names are normalized to lowercase so autocomplete-driven reuse doesn't
// fracture the vocabulary into case variants of the same Tag (see CONTEXT.md).
export function createTag(name: string, tagGroup: string): Tag {
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH).toLowerCase();
	if (!trimmed) throw new BlankNameError('Tag name must not be blank');
	if (!TAG_GROUPS.includes(tagGroup as TagGroup)) {
		throw new InvalidTagGroupError(`Unknown tag group "${tagGroup}"`);
	}

	try {
		return db
			.insert(tags)
			.values({ name: trimmed, tagGroup: tagGroup as TagGroup })
			.returning()
			.get();
	} catch (error) {
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			throw new DuplicateNameError(`Tag "${trimmed}" already exists`);
		}
		throw error;
	}
}

export function parseTagIds(rawIds: unknown[]): number[] {
	const ids = rawIds.map(Number).filter((id) => Number.isInteger(id));
	return [...new Set(ids)];
}

export function getTagsByIds(ids: number[]): Tag[] {
	if (ids.length === 0) return [];
	return db.select().from(tags).where(inArray(tags.id, ids)).all();
}
