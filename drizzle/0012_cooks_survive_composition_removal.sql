-- `cooks.composition_id` becomes nullable and `on delete set null` (see #51 and
-- docs/adr/0005): a revert that removes a Composition must leave the Cook.
--
-- Hand-corrected from drizzle-kit's generated recreate, which was the same
-- silent data loss one level down. SQLite can't alter a foreign key, so the
-- table has to be rebuilt and dropped - and `DROP TABLE` with foreign keys
-- enabled performs an implicit `DELETE FROM` that fires every cascade onto
-- `cook_diners` and `cook_log_annotations`, emptying both. The generated
-- `PRAGMA foreign_keys=OFF` does not save it: migrations are applied inside a
-- transaction (drizzle-orm's SQLiteSyncDialect.migrate), and that pragma is a
-- documented no-op while one is open. Verified against the real files: both
-- tables came out empty.
--
-- So both children are copied aside before the drop and restored after the
-- rename, by explicit column list. Cook ids are preserved by the copy, so the
-- restored rows point at exactly the same Cooks. `src/lib/server/db/migrations.spec.ts`
-- holds the whole chain to this.
--
-- Both children are emptied explicitly before being restored, rather than
-- leaning on the drop having cascaded them empty: that cascade is exactly what
-- the pragma turns off, and this file also runs where the pragma does take
-- effect - `pnpm db:migrate`, or applying it by hand through the `sqlite3` CLI,
-- where foreign keys are off by default. Without the deletes those runs
-- re-insert rows that never left, and the restore aborts on
-- `cook_diners`'s primary key. The deletes are a no-op under the pragma-on
-- path this actually boots under.
CREATE TABLE `__new_cooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`composition_id` integer,
	`recipe_version_id` integer NOT NULL,
	`acting_profile_id` integer NOT NULL,
	`cooked_at` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acting_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_cooks`("id", "recipe_id", "composition_id", "recipe_version_id", "acting_profile_id", "cooked_at", "outcome", "summary", "created_at") SELECT "id", "recipe_id", "composition_id", "recipe_version_id", "acting_profile_id", "cooked_at", "outcome", "summary", "created_at" FROM `cooks`;--> statement-breakpoint
CREATE TABLE `__kept_cook_diners` AS SELECT "cook_id", "profile_id" FROM `cook_diners`;--> statement-breakpoint
CREATE TABLE `__kept_cook_log_annotations` AS SELECT "id", "cook_id", "step_id", "ingredient_usage_id", "note", "created_at" FROM `cook_log_annotations`;--> statement-breakpoint
DROP TABLE `cooks`;--> statement-breakpoint
ALTER TABLE `__new_cooks` RENAME TO `cooks`;--> statement-breakpoint
DELETE FROM `cook_diners`;--> statement-breakpoint
DELETE FROM `cook_log_annotations`;--> statement-breakpoint
INSERT INTO `cook_diners`("cook_id", "profile_id") SELECT "cook_id", "profile_id" FROM `__kept_cook_diners`;--> statement-breakpoint
INSERT INTO `cook_log_annotations`("id", "cook_id", "step_id", "ingredient_usage_id", "note", "created_at") SELECT "id", "cook_id", "step_id", "ingredient_usage_id", "note", "created_at" FROM `__kept_cook_log_annotations`;--> statement-breakpoint
DROP TABLE `__kept_cook_diners`;--> statement-breakpoint
DROP TABLE `__kept_cook_log_annotations`;
