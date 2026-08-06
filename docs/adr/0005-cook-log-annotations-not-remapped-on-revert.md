---
date: 2026-08-06
status: corrected in #51 - the original text understated what a revert did
---

# A Cook records the current Version id, and survives a revert; only Annotations whose target the revert removes are dropped

#29 required that logging a Cook never mutates the Recipe. `logCook` therefore looks up the Recipe's already-most-recent `recipe_versions` row and stores its id; it never calls `recordVersion`, so a Cook cannot create a Version as a side effect. `cook_log_annotations.step_id`/`ingredient_usage_id` are plain foreign keys onto the live `steps`/`ingredient_usages` tables with `onDelete: 'cascade'`, the same shape `scaling_formulas` already uses for its exactly-one-target Step/Usage reference.

The converse of #29 has to hold too, and did not: a Recipe edit must never destroy a Cook. `revertToVersion` used to rebuild the Recipe by deleting every Composition and Step and re-inserting from the snapshot, and `cooks.composition_id` cascaded on delete, so every revert deleted the Recipe's entire Cook history - each Cook, its Diners, and all of its Annotations - silently (#51). Two changes fix that:

- **`revertToVersion` reconciles in place** rather than deleting and re-inserting. A Step, Usage or Composition the target Version still holds keeps its own id and is updated to the snapshot's content; only a row the snapshot genuinely doesn't have is deleted. Row ids therefore stay stable across a revert, and across repeated reverts.
- **`cooks.composition_id` is nullable and `on delete set null`** (`drizzle/0012_cooks_survive_composition_removal.sql`), the schema's only `set null` reference. Reverting past the Version that added a Variant genuinely removes that Composition; the Cook logged against it stays. The migration itself is hand-corrected: SQLite has to rebuild the table to change a foreign key, and drizzle-kit's generated `DROP TABLE`/rename would have cascaded `cook_diners` and `cook_log_annotations` empty on boot - the `PRAGMA foreign_keys=OFF` it emits is a no-op inside the transaction migrations run in. `src/lib/server/db/migrations.spec.ts` now replays the whole chain against a database that already holds a Cook.

## Consequences

A Cook's own date, outcome, summary, acting Profile and Diners survive any Recipe edit, including a revert - they reference no Step or Usage row. A Cook whose Composition a revert removes keeps all of that, with `composition_id` null: the occasion is still history, but which line it was cooked on is no longer a line this Recipe has. The recipe page renders that as "Cooked on a composition this recipe no longer has" rather than dropping the Cook from the list. That is one-way: a later revert to a Version that had the Variant re-inserts it as a new row, and the Cook stays unlinked, since nothing recorded which Composition it had pointed at.

A Cook Log Annotation is still **not** remapped, in the sense this ADR originally meant: nothing tracks it through a rebuild. It survives a revert because reconciling leaves the row it points at in place, not because anything translates it - so an Annotation pinned to a Step or Usage the revert genuinely removes still cascades away with it. Per-Step/Usage Annotations remain scoped to "as the Recipe currently stands," not preserved independent of later edits; a Cook's own fields are not.

## Considered options

- **Remapping `cook_log_annotations` through a delete-and-re-insert revert**, the way `revertToVersion` remaps `scaling_formulas.other_usage_id`. That remap works only because a Version snapshot is self-contained: it can translate snapshot ids to freshly-inserted ones, but an Annotation points at a _live_ id, which only coincides with a snapshot id on the first revert after that snapshot was taken. A second revert to the same Version has no correspondence left to use. Reconciling in place sidesteps the problem instead of tracking a second cross-cutting id-map.
- **Keeping the removed Composition as an archived row** so a Cook always resolves to a name. That adds a soft-delete concept the domain doesn't have (see `CONTEXT.md`'s Composition), and every Composition query would have to filter it out or grow a ghost Variant.
- **Denormalizing the Composition's name onto the Cook.** Not needed for the history to survive, and the Cook already records the Version it was cooked at, whose snapshot holds that name.
