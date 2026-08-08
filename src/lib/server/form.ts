// Route params and form fields reach an action as raw strings, so a missing or
// garbage value turns into `NaN` under a bare `Number(...)`. SQLite binds NaN
// as NULL without complaint, so the mistake surfaces as a foreign-key or
// not-null failure past every domain-error handler - a 500 where the action
// next to it returns a friendly 400. Parsing here keeps that decision in the
// action, before anything reaches the database.

// A single route param or form field holding a row id. Anything that isn't a
// positive integer - missing, blank, fractional, non-numeric - is `undefined`.
// Matched as digits rather than handed to `Number`, which also accepts every
// other JS numeric literal form: `0x10`, `1e3`, `+7` and `7.0` all name a row
// nobody typed, and `Number.isInteger` waves each of them through.
const ROW_ID = /^\d+$/;

export function parseRowId(raw: unknown): number | undefined {
	if (raw === null || raw === undefined) return undefined;
	const text = String(raw).trim();
	if (!ROW_ID.test(text)) return undefined;
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value < 1) return undefined;
	return value;
}

// A repeated form field of row ids (checkboxes, multi-selects), de-duplicated
// so the same id submitted twice doesn't act twice. One unparseable value
// invalidates the whole set: unlike a vocabulary picker, where dropping an
// unknown Tag is harmless (see `parseVocabularyIds`), these sets are records of
// what the author submitted, and a silently shortened one is wrong rather than
// merely incomplete.
export function parseRowIds(raws: unknown[]): number[] | undefined {
	const ids: number[] = [];
	for (const raw of raws) {
		const id = parseRowId(raw);
		if (id === undefined) return undefined;
		ids.push(id);
	}
	return [...new Set(ids)];
}
