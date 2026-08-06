// Shared plumbing for the household-extensible vocabularies (Tag, Category)
// and the other name-keyed rows that behave like them (Profile). These are all
// "curated and growable, with autocomplete nudging reuse over duplication" per
// CONTEXT.md, which in practice means the same three mechanical concerns every
// time: normalize the typed name, reject a blank one, and turn SQLite's UNIQUE
// violation into a domain error.
//
// Deliberately not shared: the per-module BlankNameError / DuplicateNameError
// classes. Route handlers catch the module-specific ones to phrase the message
// for that concept, so collapsing them into one pair would lose that.

// Trimmed, length-capped, and lowercased for the vocabularies whose reuse is
// autocomplete-driven - otherwise "Nut-derived" and "nut-derived" become two
// Tags naming one concept. Profile names keep their case (they're proper
// nouns, not a vocabulary to match against), hence the flag.
export function normalizeVocabularyName(
	raw: string,
	maxLength: number,
	{ lowercase = true }: { lowercase?: boolean } = {}
): string {
	const trimmed = raw.trim().slice(0, maxLength);
	return lowercase ? trimmed.toLowerCase() : trimmed;
}

// SQLite surfaces a uniqueness violation only as an error message, so the
// check lives here once rather than being restated at every insert site.
export function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

// Form posts arrive as unknown[] (repeated checkbox/select values). Coerce to
// integer ids, drop anything that isn't one, and de-duplicate so the same id
// checked twice doesn't produce two rows.
export function parseVocabularyIds(rawIds: unknown[]): number[] {
	const ids = rawIds.map(Number).filter((id) => Number.isInteger(id));
	return [...new Set(ids)];
}
