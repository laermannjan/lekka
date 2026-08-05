CREATE TABLE `ingredient_usages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`step_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`position` integer NOT NULL,
	`quantity_value` real NOT NULL,
	`quantity_unit` text DEFAULT '' NOT NULL,
	`prep_attribute` text,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`instruction` text NOT NULL,
	`duration_kind` text,
	`duration_min` real,
	`duration_max` real,
	`duration_unit` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
