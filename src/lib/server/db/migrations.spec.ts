import { existsSync, readFileSync } from 'node:fs';
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
