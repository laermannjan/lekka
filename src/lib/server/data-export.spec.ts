import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import {
	categories,
	collectionRecipes,
	collections,
	compositionSteps,
	compositions,
	cookDiners,
	cookLogAnnotations,
	cooks,
	favorites,
	ingredientTags,
	ingredientUsages,
	ingredients,
	profileAvoidTags,
	profiles,
	recipeCategories,
	recipeVersions,
	recipes,
	scalingFormulas,
	steps,
	tags
} from './db/schema';
import { DOMAIN_TABLES_CHILD_FIRST } from './db/tables';
import {
	EXPORT_SCHEMA_VERSION,
	InvalidExportError,
	exportData,
	restoreData,
	type DataExport
} from './data-export';

describe('data-export', () => {
	// A dump covers every domain table, so a test naming two of them passes just
	// as well when a table is dropped from both export and restore. The expected
	// set is the canonical table list (./db/tables.ts) rather than a literal, so
	// adding a table there is what makes this start demanding it - by name, not
	// by count, so one table swapped for another is still caught.
	function expectEveryTablePopulated(data: DataExport['data']) {
		const keys = Object.keys(data) as (keyof DataExport['data'])[];
		const toSqlName = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

		expect(keys.map(toSqlName).sort()).toEqual(DOMAIN_TABLES_CHILD_FIRST.map(getTableName).sort());
		for (const key of keys) expect(data[key], `table "${key}"`).not.toHaveLength(0);
	}

	// Seeds one row (or join row) into every table `exportData`/`restoreData`
	// touch, wired together so every FK actually resolves - a broad smoke
	// fixture rather than exercising each table's domain rules.
	function seedFullFixture() {
		const jan = db.insert(profiles).values({ name: 'Jan' }).returning().get();
		const alex = db.insert(profiles).values({ name: 'Alex' }).returning().get();
		const onionTag = db
			.insert(tags)
			.values({ name: 'nuts', tagGroup: 'allergen' })
			.returning()
			.get();
		const onion = db
			.insert(ingredients)
			.values({ baseTerm: 'Onion', descriptors: 'diced' })
			.returning()
			.get();
		db.insert(ingredientTags).values({ ingredientId: onion.id, tagId: onionTag.id }).run();
		db.insert(profileAvoidTags).values({ profileId: jan.id, tagId: onionTag.id }).run();

		const category = db
			.insert(categories)
			.values({ name: 'Dinner', categoryGroup: 'meal-type' })
			.returning()
			.get();

		const recipe = db
			.insert(recipes)
			.values({ title: 'Chilli con carne', servings: 4 })
			.returning()
			.get();
		db.insert(recipeCategories).values({ recipeId: recipe.id, categoryId: category.id }).run();
		db.insert(favorites).values({ recipeId: recipe.id, profileId: jan.id }).run();

		const composition = db
			.insert(compositions)
			.values({ recipeId: recipe.id, name: null, isDefault: true })
			.returning()
			.get();

		const step = db
			.insert(steps)
			.values({ recipeId: recipe.id, instruction: 'Dice the {{1}}', durationKind: 'active' })
			.returning()
			.get();
		db.insert(compositionSteps)
			.values({ compositionId: composition.id, position: 1, poolStepId: step.id })
			.run();

		const usage = db
			.insert(ingredientUsages)
			.values({ stepId: step.id, ingredientId: onion.id, position: 1, quantityValue: 1 })
			.returning()
			.get();
		db.insert(scalingFormulas)
			.values({ ingredientUsageId: usage.id, kind: 'rate_vs_servings', ratePercent: 100 })
			.run();

		const version = db
			.insert(recipeVersions)
			.values({
				recipeId: recipe.id,
				snapshot: JSON.stringify({ steps: [], compositions: [], compositionSteps: [] })
			})
			.returning()
			.get();

		const collection = db
			.insert(collections)
			.values({ profileId: jan.id, name: 'Weeknight dinners' })
			.returning()
			.get();
		db.insert(collectionRecipes).values({ collectionId: collection.id, recipeId: recipe.id }).run();

		const cook = db
			.insert(cooks)
			.values({
				recipeId: recipe.id,
				compositionId: composition.id,
				recipeVersionId: version.id,
				actingProfileId: jan.id,
				cookedAt: '2026-08-06',
				outcome: 'worked-well',
				summary: 'Great'
			})
			.returning()
			.get();
		db.insert(cookDiners).values({ cookId: cook.id, profileId: jan.id }).run();
		db.insert(cookDiners).values({ cookId: cook.id, profileId: alex.id }).run();
		db.insert(cookLogAnnotations)
			.values({ cookId: cook.id, stepId: step.id, note: 'Went well' })
			.run();

		return { jan, alex, recipe };
	}

	it('exports every table with a schema version and timestamp', () => {
		seedFullFixture();

		const dump = exportData();

		expect(dump.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
		expect(new Date(dump.exportedAt).toString()).not.toBe('Invalid Date');
		expectEveryTablePopulated(dump.data);
		expect(dump.data.profiles).toHaveLength(2);
	});

	it('round-trips a full export through restore, preserving row ids and relations', () => {
		seedFullFixture();
		const before = exportData();

		// Mutate the DB so restore has real work to undo.
		db.insert(profiles).values({ name: 'Intruder' }).run();
		db.delete(favorites).run();

		restoreData(before);

		const after = exportData();
		expectEveryTablePopulated(after.data);
		expect(after.data).toEqual(before.data);
	});

	// SQLite caps a statement at 32766 bound parameters, so a single insert of
	// every row of a 5-column table dies at 6554 rows. `recipe_versions` gains a
	// row on every Recipe edit, so an ordinary household reaches that (#39).
	it('restores a table holding more rows than one insert statement can bind', () => {
		const { recipe } = seedFullFixture();
		const dump = exportData();
		const [template] = dump.data.recipeVersions;
		const highestId = Math.max(...dump.data.recipeVersions.map((row) => row.id));
		const extraRows = 7000;
		dump.data.recipeVersions = [
			...dump.data.recipeVersions,
			...Array.from({ length: extraRows }, (_, index) => ({
				...template,
				id: highestId + 1 + index,
				recipeId: recipe.id
			}))
		];

		// Well past the Node adapter's 512 KB default request body too, which is
		// the other half of what a real household's backup runs into (#39) - the
		// limit itself lives in the deployment env (see Dockerfile, README).
		expect(JSON.stringify(dump).length).toBeGreaterThan(512 * 1024);

		restoreData(dump);

		expect(db.select().from(recipeVersions).all()).toHaveLength(extraRows + 1);
	});

	it('restore fully replaces data - rows absent from the dump are gone afterward', () => {
		seedFullFixture();
		const dump = exportData();

		db.insert(profiles).values({ name: 'Someone new' }).run();

		restoreData(dump);

		expect(db.select().from(profiles).all()).toHaveLength(dump.data.profiles.length);
	});

	it('rejects a dump from a newer build than this one', () => {
		const dump = exportData();
		expect(() => restoreData({ ...dump, schemaVersion: 999 })).toThrow(InvalidExportError);
	});

	// A version bump means "an older build can't read this", never "this build
	// stops reading what it already wrote" - a self-hoster's existing dump has
	// to keep restoring across an upgrade.
	it('still restores a dump from an older schema version', () => {
		seedFullFixture();
		const dump = exportData();
		db.delete(favorites).run();

		restoreData({ ...dump, schemaVersion: 1 });

		expect(exportData().data).toEqual(dump.data);
	});

	it('rejects malformed input', () => {
		expect(() => restoreData(null)).toThrow(InvalidExportError);
		expect(() => restoreData('not json')).toThrow(InvalidExportError);
		expect(() => restoreData({ schemaVersion: EXPORT_SCHEMA_VERSION })).toThrow(InvalidExportError);
	});

	it('does not touch server-instance tables (vapid keys, push subscriptions)', () => {
		const dump = exportData();
		expect(dump.data).not.toHaveProperty('vapidKeys');
		expect(dump.data).not.toHaveProperty('pushSubscriptions');
		expect(dump.data).not.toHaveProperty('scheduledPushes');
	});
});
