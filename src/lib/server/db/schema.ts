import { sql } from 'drizzle-orm';
import { sqliteTable, integer, real, text, primaryKey } from 'drizzle-orm/sqlite-core';

// A lightweight named identity for one household member (see CONTEXT.md).
// No auth, no roles, no per-Profile data separation.
export const profiles = sqliteTable('profiles', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Profile = typeof profiles.$inferSelect;

// A small, fixed classification of what kind of thing a Tag describes.
// Unlike Tag itself, not household-extensible.
export const TAG_GROUPS = ['allergen', 'diet', 'sensory'] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

// A classification label drawn from a curated, growable, household-extensible
// vocabulary (see CONTEXT.md). Not a hierarchy - an Ingredient can hold any
// number of Tags.
export const tags = sqliteTable('tags', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	tagGroup: text('tag_group', { enum: TAG_GROUPS }).notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Tag = typeof tags.$inferSelect;

// A reusable, named food item identified along two independent axes:
// specificity (Base term + Descriptors) and classification (Tags).
// roundToWholeUnit is purely presentational - it never affects the
// stored/computed Quantity (see CONTEXT.md).
export const ingredients = sqliteTable('ingredients', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	baseTerm: text('base_term').notNull(),
	descriptors: text('descriptors'),
	roundToWholeUnit: integer('round_to_whole_unit', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Ingredient = typeof ingredients.$inferSelect;

// Join table attaching any number of Tags to an Ingredient.
export const ingredientTags = sqliteTable(
	'ingredient_tags',
	{
		ingredientId: integer('ingredient_id')
			.notNull()
			.references(() => ingredients.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.ingredientId, table.tagId] })]
);

// A named dish: a shared pool of Steps plus one or more Compositions (see
// CONTEXT.md) that each select, order, and optionally override those Steps.
export const recipes = sqliteTable('recipes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Recipe = typeof recipes.$inferSelect;

// One named or default line through a Recipe (see CONTEXT.md). `name` is
// null for the default Composition. `seededFromCompositionId` is informational
// lineage only - it records where a Variant was seeded from, never an
// ongoing structural link.
export const compositions = sqliteTable('compositions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	recipeId: integer('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	name: text('name'),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	seededFromCompositionId: integer('seeded_from_composition_id'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Composition = typeof compositions.$inferSelect;

// A Step's time cost. At most one per Step; a step with two time phases is
// split into two Steps (see CONTEXT.md).
export const DURATION_KINDS = ['active', 'wait', 'cook', 'estimate'] as const;
export type DurationKind = (typeof DURATION_KINDS)[number];

// One instruction, optionally carrying a Duration and referencing zero or
// more Ingredient Usages. `instruction` may contain `{{n}}` tokens that
// weave a Usage's Quantity into the text at point of use - see
// src/lib/server/recipes.ts's renderInstruction. Belongs to a Recipe's
// shared Step pool; a Step used only as a Composition-local override (see
// `compositionSteps.overrideStepId`) is owned by exactly that one row and
// otherwise shaped the same way.
export const steps = sqliteTable('steps', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	recipeId: integer('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	instruction: text('instruction').notNull(),
	durationKind: text('duration_kind', { enum: DURATION_KINDS }),
	durationMin: real('duration_min'),
	durationMax: real('duration_max'),
	durationUnit: text('duration_unit'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Step = typeof steps.$inferSelect;

// A Composition's ordered reference to a pool Step (see CONTEXT.md).
// `poolStepId` is the shared pool Step this slot represents - editing it
// propagates to every Composition whose row for it has a null
// `overrideStepId`. `overrideStepId`, when set, points to a
// Composition-local Step holding this slot's full override content
// (instruction, Duration, and Usages) instead.
export const compositionSteps = sqliteTable('composition_steps', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	compositionId: integer('composition_id')
		.notNull()
		.references(() => compositions.id, { onDelete: 'cascade' }),
	position: integer('position').notNull(),
	poolStepId: integer('pool_step_id')
		.notNull()
		.references(() => steps.id, { onDelete: 'cascade' }),
	overrideStepId: integer('override_step_id').references(() => steps.id, { onDelete: 'cascade' }),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type CompositionStep = typeof compositionSteps.$inferSelect;

// The line linking an Ingredient to a Step - carries Quantity, Prep
// Attribute, and a free-text Note (see CONTEXT.md). `position` is 1-indexed
// per Step and is what a Step's `{{n}}` instruction tokens refer to.
export const ingredientUsages = sqliteTable('ingredient_usages', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	stepId: integer('step_id')
		.notNull()
		.references(() => steps.id, { onDelete: 'cascade' }),
	ingredientId: integer('ingredient_id')
		.notNull()
		.references(() => ingredients.id),
	position: integer('position').notNull(),
	quantityValue: real('quantity_value').notNull(),
	quantityUnit: text('quantity_unit').notNull().default(''),
	prepAttribute: text('prep_attribute'),
	note: text('note'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type IngredientUsage = typeof ingredientUsages.$inferSelect;
