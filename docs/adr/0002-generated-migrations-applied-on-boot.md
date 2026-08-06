---
date: 2026-08-05
---

# Generated migrations applied on boot, not `db:push`

#18 was the first ticket to add a real table, surfacing how the schema actually reaches a running SQLite file - the scaffold had only documented `drizzle-kit push` as a manual dev step. Schema changes are now captured as versioned SQL migration files (`pnpm run db:generate`, checked into `drizzle/`) and applied automatically via drizzle-orm's `migrate()` at server startup (`src/lib/server/db/index.ts`), with `db:push` dropped from the workflow entirely.

`drizzle-kit push` diffs the schema against a live database and is a prototyping tool, not meant for production, and self-hosters have no CLI access to a running container to apply it anyway. Migrate-on-boot means a self-hoster who pulls a new image and restarts the container gets their schema updated with no manual step, matching #16's "self-hosting shouldn't be fragile" goal.

This makes `drizzle/` an authoritative build artifact, snapshots included: `drizzle-kit generate` diffs the schema against `drizzle/meta/`, not against a database. Rebasing a branch that adds a migration onto another that also added one has twice dropped an older snapshot during conflict resolution, which nothing notices at runtime because the SQL still applies cleanly on boot. `src/lib/server/db/migrations.spec.ts` guards the journal, the SQL files and the snapshot chain against exactly that.
