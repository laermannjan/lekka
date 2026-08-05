CREATE TABLE `scaling_formulas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_usage_id` integer,
	`step_id` integer,
	`kind` text NOT NULL,
	`rate_percent` real,
	`other_usage_id` integer,
	`per_unit_amount` real,
	`direction` text,
	`threshold_side` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`ingredient_usage_id`) REFERENCES `ingredient_usages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`other_usage_id`) REFERENCES `ingredient_usages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scaling_formulas_usage_unique` ON `scaling_formulas` (`ingredient_usage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `scaling_formulas_step_unique` ON `scaling_formulas` (`step_id`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `servings` integer DEFAULT 4 NOT NULL;