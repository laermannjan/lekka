import { beforeEach } from 'vitest';
import { db, runMigrations } from './index';
import { ALL_TABLES_CHILD_FIRST } from './tables';

runMigrations();

// Every server spec shares this one database, with no per-file isolation (see
// vite.config.ts), so each test starts from an empty one.
//
// Resetting here rather than per spec file is what keeps it honest: a spec that
// clears only the tables it thinks it touches passes just as well when a table
// it forgot is quietly emptied by the code under test - which is exactly how
// the whole suite stayed green while every revert deleted a Recipe's Cook
// history (#51). A new table joins ./tables.ts once and every spec gets it.
beforeEach(() => {
	for (const table of ALL_TABLES_CHILD_FIRST) db.delete(table).run();
});
