CREATE TABLE `composition_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`composition_id` integer NOT NULL,
	`position` integer NOT NULL,
	`pool_step_id` integer NOT NULL,
	`override_step_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pool_step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`override_step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `compositions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`name` text,
	`is_default` integer DEFAULT false NOT NULL,
	`seeded_from_composition_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `steps` DROP COLUMN `position`;