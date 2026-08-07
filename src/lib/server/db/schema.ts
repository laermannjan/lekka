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

// A Profile's standing dietary preference - the persistent set of Tags it
// avoids (see CONTEXT.md's Profile and Diners). Editable only by that
// Profile in the UI, though - like every other Profile-owned concept here -
// nothing in this schema enforces that. Drives the Diners dietary filter:
// when that Profile is a selected Diner, any Usage carrying one of these
// Tags is flagged.
export const profileAvoidTags = sqliteTable(
	'profile_avoid_tags',
	{
		profileId: integer('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.profileId, table.tagId] })]
);

// The server's single VAPID (RFC 8292) keypair, generated once on first
// boot (see src/lib/server/push/vapid.ts) and persisted so it stays stable
// across restarts/redeploys - a Web Push subscription is bound to the
// public key that created it, so rotating this silently breaks every
// existing subscription.
export const vapidKeys = sqliteTable('vapid_keys', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	publicKey: text('public_key').notNull(),
	privateKey: text('private_key').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type VapidKeys = typeof vapidKeys.$inferSelect;

// The v1 fixed set a Cook's outcome is picked from (see CONTEXT.md's Cook) -
// how the occasion went, distinct from the free-text `summary` on the same
// row. Not household-extensible, same governance shape as a Tag Group.
export const COOK_OUTCOMES = ['worked-well', 'needs-tweaks', 'did-not-work'] as const;
export type CookOutcome = (typeof COOK_OUTCOMES)[number];

// One occasion of making a Recipe (see CONTEXT.md's Cook). Household-wide,
// not personal to `actingProfileId` - same no-privacy-walls visibility as
// every other Profile-attributed row here. `compositionId` and
// `recipeVersionId` record which line and which point in the edit history
// were cooked; logging a Cook never itself calls recordVersion, so this
// never mutates the Recipe. `cookedAt` is the author-entered date of the
// occasion, distinct from `createdAt` (when the log entry itself was
// written).
//
// `compositionId` is nullable and `on delete set null`, unlike every other
// reference here: a Cook is append-only history that a later Recipe edit must
// never destroy (see docs/adr/0005), and reverting to a Version that predates
// a Variant genuinely removes that Composition. Cascading there deleted the
// whole Cook - the Recipe eating its own history (#51). Null means "the line
// this was cooked on is no longer part of the Recipe", not "no line".
export const cooks = sqliteTable('cooks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	recipeId: integer('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	compositionId: integer('composition_id').references(() => compositions.id, {
		onDelete: 'set null'
	}),
	recipeVersionId: integer('recipe_version_id')
		.notNull()
		.references(() => recipeVersions.id, { onDelete: 'cascade' }),
	actingProfileId: integer('acting_profile_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade' }),
	cookedAt: text('cooked_at').notNull(),
	outcome: text('outcome', { enum: COOK_OUTCOMES }).notNull(),
	summary: text('summary'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type Cook = typeof cooks.$inferSelect;

// The Diners present at a Cook (see CONTEXT.md's Diners and Cook) - a
// snapshot of who was eating at that occasion, independent of the live
// Diners cookie selection which may have changed since.
export const cookDiners = sqliteTable(
	'cook_diners',
	{
		cookId: integer('cook_id')
			.notNull()
			.references(() => cooks.id, { onDelete: 'cascade' }),
		profileId: integer('profile_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.cookId, table.profileId] })]
);

// A note pinned to a specific Step or Ingredient Usage within a Cook (see
// CONTEXT.md's Cook Log Annotation), rather than free text dumped at the
// end. Exactly one of `stepId`/`ingredientUsageId` is set - enforced in
// src/lib/server/cooks.ts, same convention as ScalingFormula's exactly-one
// target. Both cascade off the live Step/Usage row, so an annotation is
// dropped if a later Recipe edit removes what it was pinned to - it's a
// pointer into current Recipe structure, not a fact preserved independent
// of it.
export const cookLogAnnotations = sqliteTable('cook_log_annotations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	cookId: integer('cook_id')
		.notNull()
		.references(() => cooks.id, { onDelete: 'cascade' }),
	stepId: integer('step_id').references(() => steps.id, { onDelete: 'cascade' }),
	ingredientUsageId: integer('ingredient_usage_id').references(() => ingredientUsages.id, {
		onDelete: 'cascade'
	}),
	note: text('note').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type CookLogAnnotation = typeof cookLogAnnotations.$inferSelect;

// A device's Web Push subscription (see
// docs/research/pwa-timer-notifications.md). Not tied to a Profile -
// notification permission and the resulting endpoint/keys are a
// per-browser/device fact, not a per-household-member one, matching
// Profile's no-privacy-walls model (see CONTEXT.md's Profile).
export const pushSubscriptions = sqliteTable('push_subscriptions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// One Step timer's scheduled Web Push, fired by the server's in-process
// scheduler (src/lib/server/push/scheduler.ts) at `firesAt` regardless of
// what the client is doing - the actual "notify me while my phone is
// locked" mechanism the client-side timer (see
// docs/adr/0003-client-only-step-timers.md) cannot
// provide on its own. `timerId` matches the client's TimerStore id
// (compositionStepId as a string) purely for cancel-on-manual-finish
// lookups; it carries no server-side meaning beyond that. `firedAt` null
// means still pending - the scheduler re-arms every pending row from the
// DB on server boot so a restart never silently drops a scheduled fire.
export const scheduledPushes = sqliteTable('scheduled_pushes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	subscriptionId: integer('subscription_id')
		.notNull()
		.references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
	timerId: text('timer_id').notNull(),
	title: text('title').notNull(),
	body: text('body').notNull(),
	firesAt: integer('fires_at').notNull(),
	firedAt: integer('fired_at'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(current_timestamp)`)
});

export type ScheduledPush = typeof scheduledPushes.$inferSelect;
