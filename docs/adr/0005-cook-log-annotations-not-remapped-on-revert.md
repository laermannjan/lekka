---
date: 2026-08-06
---

# A Cook records the current Version id, and its Annotations are not remapped across reverts

#29 required that logging a Cook never mutates the Recipe. `logCook` therefore looks up the Recipe's already-most-recent `recipe_versions` row and stores its id; it never calls `recordVersion`, so a Cook cannot create a Version as a side effect. `cook_log_annotations.step_id`/`ingredient_usage_id` are plain foreign keys onto the live `steps`/`ingredient_usages` tables with `onDelete: 'cascade'`, the same shape `scaling_formulas` already uses for its exactly-one-target Step/Usage reference.

## Consequences

Unlike `scaling_formulas`, which `revertToVersion` explicitly remaps to the newly-inserted rows via its id-map, a Cook Log Annotation is **not** remapped on revert. `revertToVersion` deletes and re-inserts every Step and Composition with new ids, so an Annotation pinned before a revert cascades away with the row it pointed at. A Cook's own summary, outcome and Diners survive any Recipe edit, since they reference no Step or Usage row, but per-Step/Usage Annotations are scoped to "as the Recipe currently stands," not preserved independent of later edits.

## Considered options

Teaching `cook_log_annotations` to survive a revert the way `scaling_formulas` does. `revertToVersion`'s remap exists only because a Recipe's own Version snapshot is self-contained by definition. Wiring Cooks - a separate, append-only history explicitly never touched by Recipe edits - into that remap would mean tracking a second cross-cutting id-map everywhere Steps and Usages get recreated, for a case the acceptance criteria did not ask for.
