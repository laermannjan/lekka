CREATE TABLE `cook_diners` (
	`cook_id` integer NOT NULL,
	`profile_id` integer NOT NULL,
	PRIMARY KEY(`cook_id`, `profile_id`),
	FOREIGN KEY (`cook_id`) REFERENCES `cooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cook_log_annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cook_id` integer NOT NULL,
	`step_id` integer,
	`ingredient_usage_id` integer,
	`note` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`cook_id`) REFERENCES `cooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_usage_id`) REFERENCES `ingredient_usages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`composition_id` integer NOT NULL,
	`recipe_version_id` integer NOT NULL,
	`acting_profile_id` integer NOT NULL,
	`cooked_at` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_version_id`) REFERENCES `recipe_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acting_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
