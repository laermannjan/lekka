// Manually-triggered whole-instance data export/restore (see #16, #31).
// "Household" has no scoping concept in this domain (see CONTEXT.md's
// Profile) - one instance is one household, so exporting "the household's
// data" means every row of every domain table, no filtering. The dump is a
// raw serialization of lekka's own schema, not a portable interchange
// format: table names, column shapes, and row ids match the DB directly, and
// restoring means replacing the DB wholesale, not merging.
//
// vapid_keys, push_subscriptions, and scheduled_pushes are deliberately
// excluded - they're server-instance/device infrastructure (a VAPID keypair
// bound to this server, a browser's push endpoint, in-flight scheduling
// state), not household data a self-hoster would think of as "my recipes."
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from './db';
import {
	profiles,
	tags,
	ingredients,
	ingredientTags,
	recipes,
	compositions,
	steps,
	compositionSteps,
	recipeVersions,
	ingredientUsages,
	scalingFormulas,
	categories,
	recipeCategories,
	favorites,
	collections,
	collectionRecipes,
	profileAvoidTags,
	cooks,
	cookDiners,
	cookLogAnnotations,
	type Profile,
	type Tag,
	type Ingredient,
	type Recipe,
	type Composition,
	type Step,
	type CompositionStep,
	type RecipeVersion,
	type IngredientUsage,
	type ScalingFormula,
	type Category,
	type Collection,
	type Cook,
	type CookLogAnnotation
} from './db/schema';
import { DOMAIN_TABLES_CHILD_FIRST } from './db/tables';

// Bumped whenever the schema changes such that a dump this build writes is one
// an older build cannot restore - a `notNull` dropped, a column added, a
// constraint loosened. That is the whole job of the version: `restoreData`
// wipes every table before it inserts anything, so an older build handed a
// newer dump has to refuse it up front rather than discover the mismatch
// halfway through.
//
// 2: `cooks.composition_id` became nullable (#51, docs/adr/0005), so a dump can
// now hold a Cook whose Composition a revert removed - a row version 1's schema
// rejects outright.
export const EXPORT_SCHEMA_VERSION = 2;

// The versions this build can read. Older dumps stay restorable as long as
// every row shape they hold is still valid here, which is what a loosened
// constraint means - version 1 never had the null this build allows.
const RESTORABLE_SCHEMA_VERSIONS = [1, EXPORT_SCHEMA_VERSION];

export interface DataExport {
	schemaVersion: number;
	exportedAt: string;
	data: {
		profiles: Profile[];
		tags: Tag[];
		ingredients: Ingredient[];
		ingredientTags: { ingredientId: number; tagId: number }[];
		recipes: Recipe[];
		compositions: Composition[];
		steps: Step[];
		compositionSteps: CompositionStep[];
		recipeVersions: RecipeVersion[];
		ingredientUsages: IngredientUsage[];
		scalingFormulas: ScalingFormula[];
		categories: Category[];
		recipeCategories: { recipeId: number; categoryId: number }[];
		favorites: { recipeId: number; profileId: number; createdAt: string }[];
		collections: Collection[];
		collectionRecipes: { collectionId: number; recipeId: number }[];
		profileAvoidTags: { profileId: number; tagId: number }[];
		cooks: Cook[];
		cookDiners: { cookId: number; profileId: number }[];
		cookLogAnnotations: CookLogAnnotation[];
	};
}

export function exportData(): DataExport {
	return {
		schemaVersion: EXPORT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		data: {
			profiles: db.select().from(profiles).all(),
			tags: db.select().from(tags).all(),
			ingredients: db.select().from(ingredients).all(),
			ingredientTags: db.select().from(ingredientTags).all(),
			recipes: db.select().from(recipes).all(),
			compositions: db.select().from(compositions).all(),
			steps: db.select().from(steps).all(),
			compositionSteps: db.select().from(compositionSteps).all(),
			recipeVersions: db.select().from(recipeVersions).all(),
			ingredientUsages: db.select().from(ingredientUsages).all(),
			scalingFormulas: db.select().from(scalingFormulas).all(),
			categories: db.select().from(categories).all(),
			recipeCategories: db.select().from(recipeCategories).all(),
			favorites: db.select().from(favorites).all(),
			collections: db.select().from(collections).all(),
			collectionRecipes: db.select().from(collectionRecipes).all(),
			profileAvoidTags: db.select().from(profileAvoidTags).all(),
			cooks: db.select().from(cooks).all(),
			cookDiners: db.select().from(cookDiners).all(),
			cookLogAnnotations: db.select().from(cookLogAnnotations).all()
		}
	};
}

export class InvalidExportError extends Error {}

// SQLite's compiled-in ceiling on bound parameters per statement
// (SQLITE_MAX_VARIABLE_NUMBER). One insert carrying every row of a table binds
// rows x columns parameters, so a 5-column table dies at 6554 rows - and
// `recipe_versions` gains a row on every Recipe edit, so an ordinary
// household's backup reaches that (#39).
const SQLITE_MAX_BOUND_PARAMETERS = 32766;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Inserts every row, split across as many statements as the parameter ceiling
// demands. The chunk size is derived from the table's own column count rather
// than a fixed row count, so a table that grows a column stays correct.
function insertAll<T extends SQLiteTable>(tx: Transaction, table: T, rows: T['$inferInsert'][]) {
	const columnCount = Object.keys(getTableColumns(table)).length;
	const rowsPerStatement = Math.max(1, Math.floor(SQLITE_MAX_BOUND_PARAMETERS / columnCount));

	for (let start = 0; start < rows.length; start += rowsPerStatement) {
		tx.insert(table)
			.values(rows.slice(start, start + rowsPerStatement))
			.run();
	}
}

// Full replace, not merge: every table in `DOMAIN_TABLES_CHILD_FIRST` is wiped
// before anything is reinserted, deleted child-first and reinserted
// parent-first so FK constraints hold throughout - no need to touch the
// `foreign_keys` pragma. Row ids are preserved as-is from the dump; SQLite's
// AUTOINCREMENT bookkeeping advances to cover any explicit id it sees, so
// later inserts (a new Recipe created after a restore) still get fresh ids.
export function restoreData(raw: unknown): void {
	const parsed = validateExport(raw);
	const { data } = parsed;

	db.transaction((tx) => {
		for (const table of DOMAIN_TABLES_CHILD_FIRST) {
			tx.delete(table).run();
		}

		insertAll(tx, profiles, data.profiles);
		insertAll(tx, ingredients, data.ingredients);
		insertAll(tx, tags, data.tags);
		insertAll(tx, categories, data.categories);
		insertAll(tx, recipes, data.recipes);
		insertAll(tx, ingredientTags, data.ingredientTags);
		insertAll(tx, profileAvoidTags, data.profileAvoidTags);
		insertAll(tx, collections, data.collections);
		insertAll(tx, collectionRecipes, data.collectionRecipes);
		insertAll(tx, recipeCategories, data.recipeCategories);
		insertAll(tx, favorites, data.favorites);
		insertAll(tx, compositions, data.compositions);
		insertAll(tx, steps, data.steps);
		insertAll(tx, compositionSteps, data.compositionSteps);
		insertAll(tx, recipeVersions, data.recipeVersions);
		insertAll(tx, ingredientUsages, data.ingredientUsages);
		insertAll(tx, scalingFormulas, data.scalingFormulas);
		insertAll(tx, cooks, data.cooks);
		insertAll(tx, cookDiners, data.cookDiners);
		insertAll(tx, cookLogAnnotations, data.cookLogAnnotations);
	});
}

const REQUIRED_TABLE_KEYS: (keyof DataExport['data'])[] = [
	'profiles',
	'tags',
	'ingredients',
	'ingredientTags',
	'recipes',
	'compositions',
	'steps',
	'compositionSteps',
	'recipeVersions',
	'ingredientUsages',
	'scalingFormulas',
	'categories',
	'recipeCategories',
	'favorites',
	'collections',
	'collectionRecipes',
	'profileAvoidTags',
	'cooks',
	'cookDiners',
	'cookLogAnnotations'
];

// Shallow structural validation only - trusts row shapes match the schema
// (as they would for any export this app itself produced) rather than
// deep-validating every column, matching this feature's "raw dump of our
// own domain model" scope rather than a hardened public-interchange format.
function validateExport(raw: unknown): DataExport {
	if (typeof raw !== 'object' || raw === null) {
		throw new InvalidExportError('Export file is not a JSON object');
	}
	const candidate = raw as Record<string, unknown>;

	if (
		typeof candidate.schemaVersion !== 'number' ||
		!RESTORABLE_SCHEMA_VERSIONS.includes(candidate.schemaVersion)
	) {
		throw new InvalidExportError(
			`Unsupported schema version ${String(candidate.schemaVersion)}, expected ${RESTORABLE_SCHEMA_VERSIONS.join(' or ')}`
		);
	}

	if (typeof candidate.data !== 'object' || candidate.data === null) {
		throw new InvalidExportError('Export file is missing its "data" section');
	}
	const data = candidate.data as Record<string, unknown>;

	for (const key of REQUIRED_TABLE_KEYS) {
		if (!Array.isArray(data[key])) {
			throw new InvalidExportError(`Export file is missing table "${key}"`);
		}
	}

	return candidate as unknown as DataExport;
}
