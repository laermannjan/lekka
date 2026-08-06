---
date: 2026-08-06
---

# Export is a raw domain-model dump; restore preserves ids and fully replaces

#31 asked for a manually-triggered export of the whole household's data as a single versioned JSON dump matching lekka's own domain model directly (not a portable interchange schema), and a manually-triggered restore that fully replaces whatever is currently in the instance, with no merge, no dedup, and no built-in scheduler.

- **"Household" means the whole instance.** There is no household or tenant table (see `CONTEXT.md`'s Profile), so export is every row of every domain table, unfiltered.
- **Dump shape** is `{ schemaVersion, exportedAt, data: { <tableName>: Row[] } }` (`src/lib/server/data-export.ts`), rows as Drizzle returns them - the same "serialize a chunk of the domain model to JSON" convention `recipe_versions.snapshot` already established, scaled to the whole database instead of one Recipe.
- **`vapid_keys`, `push_subscriptions` and `scheduled_pushes` are excluded**: these are server-instance and per-device infrastructure, not household data a self-hoster would think of as "my recipes." Restoring them into a different instance would be actively wrong (stale device endpoints, mismatched keys).
- **Row ids are preserved, not remapped.** Restore wipes every included table child-before-parent and reinserts the dump's rows with their original ids parent-before-child. SQLite's `AUTOINCREMENT` bookkeeping advances past any explicit id it sees, so a Recipe created after a restore still gets a fresh id. This is simpler than `revertToVersion`'s id-remapping and correct here specifically because restore is whole-database replace, not a merge into a database that already holds its own colliding rows.
- **Validation is shallow**: `restoreData` checks that `schemaVersion` matches and that every expected table key is present as an array, but trusts row shapes rather than deep-validating every column. This is the app's own domain model round-tripping through itself, not a hardened public interchange format.
- **Routes**: `GET /settings/export` streams the dump as a download; restore is a form action (`POST /settings?/restore`) reading an uploaded file, following the existing form-action convention rather than a fetch-driven endpoint, since it is one file input with no client-side interactivity needed.

## Considered options

- **Id remapping on restore**: unnecessary complexity for a full-replace operation with no existing rows to collide with.
- **A generic or portable export schema**: explicitly out of scope. This is a backup and restore mechanism for one lekka instance, not an interchange format for other tools.
- **Scheduling export automatically**: explicitly out of scope. Self-hosters wire their own cron externally against the export endpoint.
