import { sql } from 'drizzle-orm';
import { sqliteTable, integer, real, text, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
// `servings` is the Recipe's base/usual serving count - every stored
// Quantity and Duration is "as written" at this count. Changing servings on
// the recipe view recomputes every Quantity from this baseline, strict
// linear by default (see CONTEXT.md's Scaling Formula).
export const recipes = sqliteTable('recipes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	servings: integer('servings').notNull().default(4),
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

// A point in a Recipe's edit history - one shared timeline covering the
// Step pool and every Composition together, never per-Variant (see
// CONTEXT.md). `snapshot` is a JSON-serialized capture of every steps,
// compositions, compositionSteps, and ingredientUsages row for the Recipe at
// this point, self-contained so a revert never depends on rows created
// after it. `revertedFromVersionId` is informational lineage only, like
// `compositions.seededFromCompositionId` - it records that this Version was
// produced by reverting to an earlier one, never an ongoing structural link.
export const recipeVersions = sqliteTable('recipe_versions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	recipeId: integer('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	snapshot: text('snapshot').notNull(),
	revertedFromVersionId: integer('reverted_from_version_id'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type RecipeVersion = typeof recipeVersions.$inferSelect;

// The line linking an Ingredient to a Step - carries Quantity, Prep
// Attribute, Alternative, and a free-text Note (see CONTEXT.md). `position`
// is 1-indexed per Step and is what a Step's `{{n}}` instruction tokens
// refer to. `alternativeIngredientId`, when set, is an author-declared
// substitute scoped to this one Usage only - never implied on other Usages
// of the same Ingredient elsewhere, even within the same Recipe.
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
	alternativeIngredientId: integer('alternative_ingredient_id').references(() => ingredients.id),
	note: text('note'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type IngredientUsage = typeof ingredientUsages.$inferSelect;

// The v1 guided-template catalog a Scaling Formula is authored from (see
// CONTEXT.md). Never a free-form expression language - every template's
// blanks are constrained fields, not raw syntax.
export const SCALING_FORMULA_KINDS = ['rate_vs_servings', 'vs_other_usage', 'fixed'] as const;
export type ScalingFormulaKind = (typeof SCALING_FORMULA_KINDS)[number];

// For the "vs. another Usage" template: which way the referenced Usage's
// Quantity has to move off its usual amount to trigger the response, and
// which way the response itself moves.
export const SCALING_DIRECTIONS = ['increase', 'decrease'] as const;
export type ScalingDirection = (typeof SCALING_DIRECTIONS)[number];

export const SCALING_THRESHOLD_SIDES = ['short', 'over'] as const;
export type ScalingThresholdSide = (typeof SCALING_THRESHOLD_SIDES)[number];

// An optional, author-written override on an Ingredient Usage's Quantity or
// a Step's Duration, replacing the default strict-linear/constant response
// to a serving-count change (see CONTEXT.md). Exactly one of
// `ingredientUsageId` (the Quantity it overrides) or `stepId` (the Step
// whose Duration it overrides) is set - enforced in src/lib/server/scaling.ts,
// not by the schema. `otherUsageId` is only meaningful for `vs_other_usage`
// and, since that template is Duration-only, is always a Usage belonging to
// the same Step as `stepId`.
export const scalingFormulas = sqliteTable(
	'scaling_formulas',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ingredientUsageId: integer('ingredient_usage_id').references(() => ingredientUsages.id, {
			onDelete: 'cascade'
		}),
		stepId: integer('step_id').references(() => steps.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: SCALING_FORMULA_KINDS }).notNull(),
		// rate_vs_servings: percentage rate the value should track servings at
		// (100 = exactly linear, <100 = slower, >100 = faster).
		ratePercent: real('rate_percent'),
		// vs_other_usage: the referenced Usage, the per-unit amount to move by,
		// which direction the response moves, and which side of the reference's
		// usual Quantity triggers it.
		otherUsageId: integer('other_usage_id').references(() => ingredientUsages.id, {
			onDelete: 'cascade'
		}),
		perUnitAmount: real('per_unit_amount'),
		direction: text('direction', { enum: SCALING_DIRECTIONS }),
		thresholdSide: text('threshold_side', { enum: SCALING_THRESHOLD_SIDES }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(current_timestamp)`)
	},
	(table) => [
		uniqueIndex('scaling_formulas_usage_unique').on(table.ingredientUsageId),
		uniqueIndex('scaling_formulas_step_unique').on(table.stepId)
	]
);

export type ScalingFormula = typeof scalingFormulas.$inferSelect;

// A small, fixed classification of what kind of thing a Category describes.
// Unlike Category itself, not household-extensible.
export const CATEGORY_GROUPS = ['meal-type', 'cuisine', 'course'] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

// A browsing classification for a whole Recipe - meal type, cuisine, course
// (see CONTEXT.md). Distinct from Tag, which classifies Ingredients, not
// Recipes.
export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	categoryGroup: text('category_group', { enum: CATEGORY_GROUPS }).notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Category = typeof categories.$inferSelect;

// Join table attaching any number of Categories to a Recipe. Shared across
// every Composition of that Recipe (see CONTEXT.md).
export const recipeCategories = sqliteTable(
	'recipe_categories',
	{
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		categoryId: integer('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.recipeId, table.categoryId] })]
);

// A per-Profile boolean mark on a Recipe (see CONTEXT.md). A row's presence
// is the mark - there's no separate boolean column that could drift out of
// sync with it.
export const favorites = sqliteTable(
	'favorites',
	{
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(current_timestamp)`)
	},
	(table) => [primaryKey({ columns: [table.recipeId, table.profileId] })]
);

// A per-Profile, named, freely-membered group of Recipes (see CONTEXT.md).
// `profileId` records the creating Profile only - visible and editable
// household-wide regardless, same as every other Profile-owned concept here.
export const collections = sqliteTable('collections', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	profileId: integer('profile_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Collection = typeof collections.$inferSelect;

// Join table for a Collection's Recipe membership - a Recipe can belong to
// any number of Collections, same multi-membership as Tag (see CONTEXT.md).
export const collectionRecipes = sqliteTable(
	'collection_recipes',
	{
		collectionId: integer('collection_id')
			.notNull()
			.references(() => collections.id, { onDelete: 'cascade' }),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.collectionId, table.recipeId] })]
);
