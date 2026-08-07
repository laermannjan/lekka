---
date: 2026-08-05
---

# Generated migrations applied on boot, not `db:push`

#18 was the first ticket to add a real table, surfacing how the schema actually reaches a running SQLite file - the scaffold had only documented `drizzle-kit push` as a manual dev step. Schema changes are now captured as versioned SQL migration files (`pnpm run db:generate`, checked into `drizzle/`) and applied automatically via drizzle-orm's `migrate()` at server startup (`src/lib/server/db/index.ts`), with `db:push` dropped from the workflow entirely.

Migrate-on-boot is the only path a deployed instance uses. `pnpm run db:migrate` (`drizzle-kit migrate`) stays as a third, local-only path: it applies the same checked-in files against a dev database without starting the server, which is what makes it useful when inspecting a schema change or a hand-corrected file in isolation. It is not part of any deploy, container start or CI step, and it is not a second source of schema truth - it replays exactly what `drizzle/` holds. It does differ from boot in one respect, covered below: the `foreign_keys` pragma is off under it.

`drizzle-kit push` diffs the schema against a live database and is a prototyping tool, not meant for production, and self-hosters have no CLI access to a running container to apply it anyway. Migrate-on-boot means a self-hoster who pulls a new image and restarts the container gets their schema updated with no manual step, matching #16's "self-hosting shouldn't be fragile" goal.

This makes `drizzle/` an authoritative build artifact, snapshots included: `drizzle-kit generate` diffs the schema against `drizzle/meta/`, not against a database. Rebasing a branch that adds a migration onto another that also added one has twice dropped an older snapshot during conflict resolution, which nothing notices at runtime because the SQL still applies cleanly on boot. `src/lib/server/db/migrations.spec.ts` guards the journal, the SQL files and the snapshot chain against exactly that.

One SQL file departs from generator output: `drizzle/0012_cooks_survive_composition_removal.sql` is hand-corrected, and regenerating it would reintroduce silent data loss. Changing a foreign key in SQLite means rebuilding the table, and the generated `DROP TABLE` cascades `cook_diners` and `cook_log_annotations` empty on boot; the shipped file copies both aside before the drop, empties them, and restores them after the rename - emptying them explicitly because whether the drop cascaded them empty depends on the `foreign_keys` pragma, which is off in `pnpm db:migrate` and the `sqlite3` CLI and on when the app boots. `migrations.spec.ts` replays the chain under both. See `docs/adr/0005-cook-log-annotations-not-remapped-on-revert.md` and the file's own header comment for why. `db:generate` remains the default for every other migration - the exception needs a reason of that kind plus a test in `migrations.spec.ts` that fails on the loss, not a preference for hand-written SQL.
