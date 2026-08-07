import { existsSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// `drizzle/meta/0005_snapshot.json` has been lost to a rebase twice (bf7cfb2,
// then again in d0cf046 after 8adef4c had restored it). Both times a feature
// branch carrying its own migration was rebased onto one that had added an
// earlier migration, and the conflict resolution dropped the older snapshot.
//
// Nothing catches that: the SQL still applies cleanly on boot, so the app and
// the whole test suite stay green while `db:generate` quietly diffs against a
// hole and emits a migration that re-creates tables that already exist. These
// tests fail the moment a snapshot goes missing or the chain stops linking up.

const repoRoot = new URL('../../../../', import.meta.url);

type Journal = { entries: { idx: number; tag: string }[] };
type Snapshot = { id: string; prevId: string };

const ZERO_ID = '00000000-0000-0000-0000-000000000000';

function readJson<T>(relativePath: string): T {
	return JSON.parse(readFileSync(new URL(relativePath, repoRoot), 'utf8')) as T;
}

const journal = readJson<Journal>('drizzle/meta/_journal.json');

function snapshotPath(idx: number): string {
	return `drizzle/meta/${String(idx).padStart(4, '0')}_snapshot.json`;
}

describe('migration metadata', () => {
	it('has a snapshot for every journal entry', () => {
		const missing = journal.entries
			.filter((entry) => !existsSync(new URL(snapshotPath(entry.idx), repoRoot)))
			.map((entry) => `${entry.idx} (${entry.tag})`);

		expect(missing).toEqual([]);
	});

	it('has a SQL file for every journal entry', () => {
		const missing = journal.entries
			.filter((entry) => !existsSync(new URL(`drizzle/${entry.tag}.sql`, repoRoot)))
			.map((entry) => entry.tag);

		expect(missing).toEqual([]);
	});

	it('links every snapshot to the one before it', () => {
		const breaks: string[] = [];
		let expectedPrevId = ZERO_ID;

		for (const entry of journal.entries) {
			const snapshot = readJson<Snapshot>(snapshotPath(entry.idx));

			if (snapshot.prevId !== expectedPrevId) {
				breaks.push(
					`${entry.idx} (${entry.tag}): prevId ${snapshot.prevId}, expected ${expectedPrevId}`
				);
			}

			expectedPrevId = snapshot.id;
		}

		expect(breaks).toEqual([]);
	});
});

// SQLite cannot alter a column or a foreign key, so any migration that changes
// one rebuilds and drops its table - and `DROP TABLE` with foreign keys on
// performs an implicit `DELETE FROM` that fires every cascade pointed at it.
// drizzle-kit emits `PRAGMA foreign_keys=OFF` to cover that, which is a no-op
// here: migrations are applied inside a transaction (drizzle-orm's
// SQLiteSyncDialect.migrate), and SQLite ignores that pragma while one is open.
// A generated rebuild of `cooks` therefore empties `cook_diners` and
// `cook_log_annotations` on boot, silently, on a real household's database -
// the same class of loss as #51 itself, one level down.
//
// This replays the chain the way the app does, against a database that already
// holds a Cook, so any future migration that quietly empties Cook history fails
// here instead of on someone's instance.
//
// Both pragma states are replayed, because the same SQL is applied under both
// and the two fail in opposite directions. `foreign_keys = ON` is how the app
// boots (see ./index.ts) and is where a `DROP TABLE` cascades the children
// empty; `foreign_keys = OFF` is SQLite's own default, and therefore what
// `pnpm db:migrate` and a hand-run `sqlite3 app.db < 00xx.sql` get, where the
// same drop leaves the children populated and a migration that re-inserts them
// collides with rows that never left. A migration has to survive both.
function statementsOf(tag: string): string[] {
	return readFileSync(new URL(`drizzle/${tag}.sql`, repoRoot), 'utf8')
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter(Boolean);
}

// Every table a Cook's history hangs off, seeded so each one has something to
// lose: the Cook itself, its Diners, and an Annotation of each kind - one
// pinned to a Step, one to an Ingredient Usage, since they cascade off
// different tables and a migration can rebuild either.
const SEED = `
	INSERT INTO profiles (id, name) VALUES (1, 'Jan');
	INSERT INTO ingredients (id, base_term) VALUES (1, 'mince');
	INSERT INTO recipes (id, title) VALUES (1, 'Chilli con carne');
	INSERT INTO compositions (id, recipe_id, name, is_default) VALUES (1, 1, NULL, 1);
	INSERT INTO steps (id, recipe_id, instruction) VALUES (1, 1, 'Brown the mince.');
	INSERT INTO ingredient_usages (id, step_id, ingredient_id, position, quantity_value, quantity_unit)
		VALUES (1, 1, 1, 1, 500, 'g');
	INSERT INTO recipe_versions (id, recipe_id, snapshot) VALUES (1, 1, '{}');
	INSERT INTO cooks (id, recipe_id, composition_id, recipe_version_id, acting_profile_id, cooked_at, outcome)
		VALUES (1, 1, 1, 1, 1, '2026-08-01', 'worked-well');
	INSERT INTO cook_diners (cook_id, profile_id) VALUES (1, 1);
	INSERT INTO cook_log_annotations (id, cook_id, step_id, note) VALUES (1, 1, 1, 'Browned too long.');
	INSERT INTO cook_log_annotations (id, cook_id, ingredient_usage_id, note) VALUES (2, 1, 1, 'Too much mince.');
`;

describe.each([
	['foreign_keys = ON', 'ON'],
	['foreign_keys = OFF', 'OFF']
])('applying the migrations to a database that already has data, %s', (_name, pragma) => {
	it('never empties a Cook, its Diners or its Annotations', () => {
		const database = new Database(':memory:');
		database.pragma(`foreign_keys = ${pragma}`);

		// Up to and including whichever migration first creates `cooks` - so the
		// seed below can be written, and every later migration is under test.
		const hasCooks = () =>
			database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'cooks'").get() !== undefined;
		const remaining = [...journal.entries];
		while (remaining.length > 0 && !hasCooks()) {
			const entry = remaining.shift()!;
			// One transaction per batch, matching the migrator - the pragma's
			// no-op-inside-a-transaction behaviour is the whole point.
			database.exec('BEGIN');
			for (const statement of statementsOf(entry.tag)) database.exec(statement);
			database.exec('COMMIT');
		}
		expect(hasCooks()).toBe(true);

		database.exec(SEED);

		database.exec('BEGIN');
		for (const entry of remaining) {
			for (const statement of statementsOf(entry.tag)) database.exec(statement);
		}
		database.exec('COMMIT');

		const count = (table: string) =>
			(database.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;
		expect({
			cooks: count('cooks'),
			cookDiners: count('cook_diners'),
			cookLogAnnotations: count('cook_log_annotations')
		}).toEqual({ cooks: 1, cookDiners: 1, cookLogAnnotations: 2 });

		database.close();
	});
});
