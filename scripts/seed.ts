// Development seed: wipes every content table and writes one plausible
// household, so the UI can be looked at against real density rather than an
// empty page. Never run against a database you care about.
//
// Raw SQL against better-sqlite3 rather than the server modules, because
// those import `$env/dynamic/private` and only resolve inside SvelteKit.
// Run migrations first: `pnpm db:migrate && pnpm seed`.

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL ?? readDotEnv('DATABASE_URL') ?? 'local.db';

function readDotEnv(key: string): string | undefined {
	try {
		const line = readFileSync('.env', 'utf8')
			.split('\n')
			.find((l) => l.startsWith(`${key}=`));
		return line?.slice(key.length + 1).trim();
	} catch {
		return undefined;
	}
}

const db = new Database(url);
db.pragma('foreign_keys = ON');

// Vocabulary tables (tags) and vapid_keys survive - the tag vocabulary is
// seeded by migration 0002 and the keypair must stay stable.
const WIPE = [
	'cook_log_annotations',
	'cook_diners',
	'cooks',
	'scheduled_pushes',
	'scaling_formulas',
	'ingredient_usages',
	'composition_steps',
	'compositions',
	'recipe_versions',
	'recipe_categories',
	'collection_recipes',
	'collections',
	'favorites',
	'steps',
	'recipes',
	'categories',
	'ingredient_tags',
	'ingredients',
	'profile_avoid_tags',
	'profiles'
];

for (const table of WIPE) db.prepare(`DELETE FROM ${table}`).run();

// Reset the autoincrement counters too, so a reseed hands out the same ids
// every time. Without this every run shifts every id and any URL, bookmark or
// cookie pointing at seeded data goes stale.
const resetSequence = db.prepare('DELETE FROM sqlite_sequence WHERE name = ?');
for (const table of WIPE) resetSequence.run(table);

const insert = (sql: string) => db.prepare(sql);
const lastId = () => db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };

// --- Profiles -------------------------------------------------------------

const insertProfile = insert('INSERT INTO profiles (name) VALUES (?)');
function profile(name: string): number {
	insertProfile.run(name);
	return lastId().id;
}

const jan = profile('Jan');
const mira = profile('Mira');
const tobi = profile('Tobi');

const tagId = (name: string) =>
	(db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number }).id;

const insertAvoid = insert('INSERT INTO profile_avoid_tags (profile_id, tag_id) VALUES (?, ?)');
insertAvoid.run(mira, tagId('peanut'));
insertAvoid.run(mira, tagId('tree-nut'));
insertAvoid.run(tobi, tagId('dairy'));

// --- Ingredients ----------------------------------------------------------

const insertIngredient = insert(
	'INSERT INTO ingredients (base_term, descriptors, round_to_whole_unit) VALUES (?, ?, ?)'
);
const insertIngredientTag = insert(
	'INSERT INTO ingredient_tags (ingredient_id, tag_id) VALUES (?, ?)'
);

function ingredient(
	baseTerm: string,
	descriptors: string | null,
	tags: string[],
	roundToWholeUnit = false
): number {
	insertIngredient.run(baseTerm, descriptors, roundToWholeUnit ? 1 : 0);
	const id = lastId().id;
	for (const tag of tags) insertIngredientTag.run(id, tagId(tag));
	return id;
}

const onion = ingredient('Onion', 'brown, medium', ['vegan'], true);
const garlic = ingredient('Garlic', 'clove', ['vegan'], true);
const chilli = ingredient('Chilli', 'red, fresh', ['vegan', 'spicy'], true);
const oliveOil = ingredient('Olive oil', 'extra virgin', ['vegan']);
const beef = ingredient('Minced beef', '20% fat', []);
const soyMince = ingredient('Soy mince', 'dried', ['soy', 'vegan']);
const cumin = ingredient('Cumin', 'ground', ['vegan']);
const paprika = ingredient('Paprika', 'smoked, sweet', ['vegan', 'smoky']);
const passata = ingredient('Tomato passata', null, ['vegan']);
const blackBeans = ingredient('Black beans', 'tinned, drained', ['vegan']);
const kidneyBeans = ingredient('Kidney beans', 'tinned, drained', ['vegan']);
const chocolate = ingredient('Dark chocolate', '70%', ['bitter']);
const salt = ingredient('Salt', 'fine sea', ['vegan']);
const rice = ingredient('Rice', 'long grain white', ['vegan']);
const sourCream = ingredient('Sour cream', 'full fat', ['dairy', 'creamy']);
const coconutYoghurt = ingredient('Coconut yoghurt', 'unsweetened', ['vegan', 'dairy-free']);
const lime = ingredient('Lime', null, ['vegan', 'acidic'], true);
const coriander = ingredient('Coriander', 'fresh, leaves', ['vegan']);

const breadFlour = ingredient('Bread flour', 'strong white', ['gluten']);
const water = ingredient('Water', 'lukewarm', ['vegan']);
const starter = ingredient('Sourdough starter', 'active, 100% hydration', ['gluten']);

const peanutButter = ingredient('Peanut butter', 'smooth, unsweetened', ['peanut', 'creamy']);
const tahini = ingredient('Tahini', 'light', ['sesame', 'creamy']);
const noodles = ingredient('Noodles', 'wheat, medium', ['gluten']);
const soySauce = ingredient('Soy sauce', 'dark', ['soy', 'umami']);
const springOnion = ingredient('Spring onion', null, ['vegan'], true);

const egg = ingredient('Egg', 'large, free range', ['egg'], true);
const pepper = ingredient('Pepper', 'red, romano', ['vegan'], true);
const tinnedTomato = ingredient('Tinned tomatoes', 'chopped', ['vegan']);
const feta = ingredient('Feta', 'in brine', ['dairy']);

const flour = ingredient('Plain flour', null, ['gluten']);
const milk = ingredient('Milk', 'whole', ['dairy']);
const butter = ingredient('Butter', 'unsalted', ['dairy']);
const oatMilk = ingredient('Oat milk', 'barista', ['vegan', 'dairy-free']);

const coconutMilk = ingredient('Coconut milk', 'full fat, tinned', ['vegan', 'creamy']);
const greenCurryPaste = ingredient('Green curry paste', null, ['shellfish', 'spicy']);
const aubergine = ingredient('Aubergine', 'small', ['vegan'], true);
const thaiBasil = ingredient('Thai basil', 'fresh', ['vegan']);
const fishSauce = ingredient('Fish sauce', null, ['fish', 'umami']);

// --- Categories -----------------------------------------------------------

const insertCategory = insert('INSERT INTO categories (name, category_group) VALUES (?, ?)');
function category(name: string, group: string): number {
	insertCategory.run(name, group);
	return lastId().id;
}

const dinner = category('Dinner', 'meal-type');
const breakfast = category('Breakfast', 'meal-type');
const lunch = category('Lunch', 'meal-type');
const texMex = category('Tex-Mex', 'cuisine');
const thai = category('Thai', 'cuisine');
const levantine = category('Levantine', 'cuisine');
const baking = category('Baking', 'course');
const main = category('Main', 'course');
const side = category('Side', 'course');

// --- Recipe building helpers ---------------------------------------------

const insertRecipe = insert('INSERT INTO recipes (title, servings) VALUES (?, ?)');
const insertStep = insert(
	`INSERT INTO steps (recipe_id, instruction, duration_kind, duration_min, duration_max, duration_unit)
	 VALUES (?, ?, ?, ?, ?, ?)`
);
const insertComposition = insert(
	'INSERT INTO compositions (recipe_id, name, is_default, seeded_from_composition_id) VALUES (?, ?, ?, ?)'
);
const insertCompositionStep = insert(
	'INSERT INTO composition_steps (composition_id, position, pool_step_id, override_step_id) VALUES (?, ?, ?, ?)'
);
const insertUsage = insert(
	`INSERT INTO ingredient_usages
	 (step_id, ingredient_id, position, quantity_value, quantity_unit, prep_attribute, alternative_ingredient_id, note)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertFormula = insert(
	`INSERT INTO scaling_formulas
	 (ingredient_usage_id, step_id, kind, rate_percent, other_usage_id, per_unit_amount, direction, threshold_side)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertRecipeCategory = insert(
	'INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)'
);

type Duration = { kind: string; min: number; max?: number; unit: string };
type UsageSpec = {
	ingredient: number;
	quantity: number;
	unit?: string;
	prep?: string;
	alternative?: number;
	note?: string;
	// A Quantity Scaling Formula, always rate-vs-servings in this seed.
	ratePercent?: number;
};

function recipe(title: string, servings: number, categories: number[]): number {
	insertRecipe.run(title, servings);
	const id = lastId().id;
	for (const c of categories) insertRecipeCategory.run(id, c);
	return id;
}

function step(
	recipeId: number,
	instruction: string,
	duration: Duration | null,
	usages: UsageSpec[]
): { stepId: number; usageIds: number[] } {
	insertStep.run(
		recipeId,
		instruction,
		duration?.kind ?? null,
		duration?.min ?? null,
		duration?.max ?? duration?.min ?? null,
		duration?.unit ?? null
	);
	const stepId = lastId().id;

	const usageIds: number[] = [];
	usages.forEach((usage, index) => {
		insertUsage.run(
			stepId,
			usage.ingredient,
			index + 1,
			usage.quantity,
			usage.unit ?? '',
			usage.prep ?? null,
			usage.alternative ?? null,
			usage.note ?? null
		);
		const usageId = lastId().id;
		usageIds.push(usageId);
		if (usage.ratePercent !== undefined) {
			insertFormula.run(
				usageId,
				null,
				'rate_vs_servings',
				usage.ratePercent,
				null,
				null,
				null,
				null
			);
		}
	});

	return { stepId, usageIds };
}

function composition(recipeId: number, name: string | null, seededFrom: number | null): number {
	insertComposition.run(recipeId, name, name === null ? 1 : 0, seededFrom);
	return lastId().id;
}

function place(compositionId: number, stepIds: number[], overrides: Record<number, number> = {}) {
	stepIds.forEach((stepId, index) => {
		insertCompositionStep.run(compositionId, index + 1, stepId, overrides[stepId] ?? null);
	});
}

// Mirrors captureRecipeSnapshot in src/lib/server/recipe-versions.ts. Kept in
// sync by hand - a seeded Version only has to be revertible, and drifting here
// costs a broken revert on seed data, not on anything real.
function recordVersion(recipeId: number): number {
	const servings = (
		db.prepare('SELECT servings FROM recipes WHERE id = ?').get(recipeId) as { servings: number }
	).servings;
	const compositionRows = db
		.prepare(
			'SELECT id, name, is_default AS isDefault, seeded_from_composition_id AS seededFromCompositionId FROM compositions WHERE recipe_id = ?'
		)
		.all(recipeId) as Record<string, unknown>[];
	const stepRows = db
		.prepare(
			`SELECT id, instruction, duration_kind AS durationKind, duration_min AS durationMin,
			        duration_max AS durationMax, duration_unit AS durationUnit
			 FROM steps WHERE recipe_id = ?`
		)
		.all(recipeId) as Record<string, unknown>[];
	const compositionStepRows = db
		.prepare(
			`SELECT composition_id AS compositionId, position, pool_step_id AS poolStepId,
			        override_step_id AS overrideStepId
			 FROM composition_steps WHERE composition_id IN (SELECT id FROM compositions WHERE recipe_id = ?)`
		)
		.all(recipeId) as Record<string, unknown>[];
	const usageRows = db
		.prepare(
			`SELECT id, step_id AS stepId, ingredient_id AS ingredientId, position,
			        quantity_value AS quantityValue, quantity_unit AS quantityUnit,
			        prep_attribute AS prepAttribute, alternative_ingredient_id AS alternativeIngredientId, note
			 FROM ingredient_usages WHERE step_id IN (SELECT id FROM steps WHERE recipe_id = ?)`
		)
		.all(recipeId) as Record<string, unknown>[];
	const formulaRows = db
		.prepare(
			`SELECT ingredient_usage_id AS ingredientUsageId, step_id AS stepId,
			        other_usage_id AS otherUsageId, kind, rate_percent AS ratePercent,
			        per_unit_amount AS perUnitAmount, direction, threshold_side AS thresholdSide
			 FROM scaling_formulas
			 WHERE step_id IN (SELECT id FROM steps WHERE recipe_id = ?)
			    OR ingredient_usage_id IN (SELECT id FROM ingredient_usages WHERE step_id IN (SELECT id FROM steps WHERE recipe_id = ?))`
		)
		.all(recipeId, recipeId) as Record<string, unknown>[];

	const snapshot = {
		servings,
		compositions: compositionRows.map((c) => ({ ...c, isDefault: c.isDefault === 1 })),
		steps: stepRows,
		compositionSteps: compositionStepRows,
		ingredientUsages: usageRows,
		scalingFormulas: formulaRows
	};

	db.prepare('INSERT INTO recipe_versions (recipe_id, snapshot) VALUES (?, ?)').run(
		recipeId,
		JSON.stringify(snapshot)
	);
	return lastId().id;
}

// --- Recipe 1: Chilli con carne (the deep one) ----------------------------

const chilliRecipe = recipe('Chilli con carne', 4, [dinner, texMex, main]);

const prep = step(
	chilliRecipe,
	'Dice {{1}} onions and finely chop {{2}} of garlic and {{3}} red chilli. Keep the chilli seeds in if the table can take it.',
	{ kind: 'active', min: 10, unit: 'minutes' },
	[
		{ ingredient: onion, quantity: 2, unit: '' },
		{ ingredient: garlic, quantity: 3, unit: 'cloves' },
		{ ingredient: chilli, quantity: 1, unit: '', prep: 'finely chopped' }
	]
);

const sweat = step(
	chilliRecipe,
	'Warm {{1}} of olive oil in a heavy pot over medium heat and sweat the onion mix until it goes translucent and sweet.',
	{ kind: 'active', min: 8, max: 10, unit: 'minutes' },
	[{ ingredient: oliveOil, quantity: 2, unit: 'tbsp' }]
);

const brown = step(
	chilliRecipe,
	'Turn the heat up, add {{1}} of minced beef and brown it hard, breaking it apart with a wooden spoon. Let it catch a little.',
	{ kind: 'active', min: 10, unit: 'minutes' },
	[{ ingredient: beef, quantity: 500, unit: 'g' }]
);

const spice = step(
	chilliRecipe,
	'Stir in {{1}} of cumin and {{2}} of smoked paprika and toast for a minute until the pot smells like a taco stand.',
	{ kind: 'active', min: 2, unit: 'minutes' },
	[
		{ ingredient: cumin, quantity: 2, unit: 'tsp', ratePercent: 80 },
		{ ingredient: paprika, quantity: 1, unit: 'tbsp', ratePercent: 80 }
	]
);

const simmer = step(
	chilliRecipe,
	'Pour in the passata and both tins of beans. Simmer uncovered, stirring now and then, until it thickens and darkens.',
	{ kind: 'cook', min: 45, max: 60, unit: 'minutes' },
	[
		{ ingredient: passata, quantity: 700, unit: 'g' },
		{ ingredient: blackBeans, quantity: 400, unit: 'g', prep: 'drained and rinsed' },
		{ ingredient: kidneyBeans, quantity: 400, unit: 'g', prep: 'drained and rinsed' }
	]
);
// A bigger pot does not need proportionally longer on the hob.
insertFormula.run(null, simmer.stepId, 'rate_vs_servings', 40, null, null, null, null);

const finish = step(
	chilliRecipe,
	'Melt in {{1}} of dark chocolate off the heat, then season with {{2}} of salt and a squeeze of lime. Taste. Season again.',
	{ kind: 'active', min: 5, unit: 'minutes' },
	[
		{
			ingredient: chocolate,
			quantity: 20,
			unit: 'g',
			prep: 'chopped',
			note: 'Rounds off the acidity - nobody will taste chocolate.'
		},
		{ ingredient: salt, quantity: 1, unit: 'tsp', ratePercent: 70 },
		{ ingredient: lime, quantity: 1, unit: '' }
	]
);

const serve = step(
	chilliRecipe,
	'Serve over {{1}} of rice with a spoon of {{2}} of sour cream and a scatter of coriander.',
	null,
	[
		{ ingredient: rice, quantity: 300, unit: 'g', prep: 'cooked' },
		{ ingredient: sourCream, quantity: 200, unit: 'g', alternative: coconutYoghurt },
		{ ingredient: coriander, quantity: 1, unit: 'handful' }
	]
);

const chilliDefault = composition(chilliRecipe, null, null);
place(chilliDefault, [
	prep.stepId,
	sweat.stepId,
	brown.stepId,
	spice.stepId,
	simmer.stepId,
	finish.stepId,
	serve.stepId
]);
recordVersion(chilliRecipe);

// The Variant: same line, one Step overridden to drop the beef.
const sinCarne = composition(chilliRecipe, 'Chilli sin carne', chilliDefault);
const soyOverride = step(
	chilliRecipe,
	'Turn the heat up, add {{1}} of soy mince and fry until the edges catch and go properly brown. Do not rush this.',
	{ kind: 'active', min: 12, unit: 'minutes' },
	[{ ingredient: soyMince, quantity: 300, unit: 'g', prep: 'rehydrated' }]
);
const serveOverride = step(
	chilliRecipe,
	'Serve over {{1}} of rice with a spoon of {{2}} of sour cream and a scatter of coriander.',
	null,
	[
		{ ingredient: rice, quantity: 300, unit: 'g', prep: 'cooked' },
		{ ingredient: coconutYoghurt, quantity: 200, unit: 'g' },
		{ ingredient: coriander, quantity: 1, unit: 'handful' }
	]
);
place(
	sinCarne,
	[
		prep.stepId,
		sweat.stepId,
		brown.stepId,
		spice.stepId,
		simmer.stepId,
		finish.stepId,
		serve.stepId
	],
	{ [brown.stepId]: soyOverride.stepId, [serve.stepId]: serveOverride.stepId }
);
const chilliV2 = recordVersion(chilliRecipe);

// --- Recipe 2: Sourdough loaf --------------------------------------------

const sourdough = recipe('Everyday sourdough', 2, [baking, breakfast]);

const mix = step(
	sourdough,
	'Whisk {{1}} of water into {{2}} of bread flour until it goes cloudy, then add {{3}} of salt and squelch it together into a shaggy dough. Leave it be.',
	{ kind: 'active', min: 15, unit: 'minutes' },
	[
		{ ingredient: water, quantity: 350, unit: 'g' },
		{ ingredient: breadFlour, quantity: 500, unit: 'g' },
		{ ingredient: salt, quantity: 10, unit: 'g', ratePercent: 100 }
	]
);

const bulk = step(
	sourdough,
	'Work {{1}} of active starter through the dough, then bulk ferment at room temperature with a fold every 45 minutes.',
	{ kind: 'wait', min: 4, max: 5, unit: 'hours' },
	[{ ingredient: starter, quantity: 100, unit: 'g' }]
);
// Less starter, longer rise - the spec's worked example.
insertFormula.run(
	null,
	bulk.stepId,
	'vs_other_usage',
	null,
	bulk.usageIds[0],
	1.5,
	'increase',
	'short'
);

const shape = step(
	sourdough,
	'Shape tight, seam side up in a floured banneton, and into the fridge overnight.',
	{ kind: 'wait', min: 12, max: 16, unit: 'hours' },
	[]
);

const bake = step(
	sourdough,
	'Bake from cold in a screaming hot dutch oven: lid on 25 minutes, lid off until it is properly dark.',
	{ kind: 'cook', min: 45, max: 50, unit: 'minutes' },
	[]
);

const sourdoughDefault = composition(sourdough, null, null);
place(sourdoughDefault, [mix.stepId, bulk.stepId, shape.stepId, bake.stepId]);
const sourdoughV1 = recordVersion(sourdough);

// --- Recipe 3: Peanut sesame noodles (flags Mira) -------------------------

const peanutNoodles = recipe('Peanut sesame noodles', 2, [lunch, main]);

const sauce = step(
	peanutNoodles,
	'Loosen {{1}} of peanut butter with {{2}} of soy sauce and a splash of the noodle water until it pours off the spoon.',
	{ kind: 'active', min: 5, unit: 'minutes' },
	[
		{ ingredient: peanutButter, quantity: 60, unit: 'g', alternative: tahini },
		{ ingredient: soySauce, quantity: 2, unit: 'tbsp' }
	]
);
const boil = step(
	peanutNoodles,
	'Boil {{1}} of noodles to just under the packet time.',
	{ kind: 'cook', min: 4, unit: 'minutes' },
	[{ ingredient: noodles, quantity: 200, unit: 'g' }]
);
const toss = step(
	peanutNoodles,
	'Toss the drained noodles through the sauce off the heat and finish with {{1}} spring onions.',
	null,
	[{ ingredient: springOnion, quantity: 2, unit: '', prep: 'sliced on the bias' }]
);
const noodlesDefault = composition(peanutNoodles, null, null);
place(noodlesDefault, [sauce.stepId, boil.stepId, toss.stepId]);
recordVersion(peanutNoodles);

// --- Recipe 4: Shakshuka --------------------------------------------------

const shakshuka = recipe('Shakshuka', 4, [breakfast, levantine, main]);
const shakBase = step(
	shakshuka,
	'Soften {{1}} peppers and {{2}} onion in oil until collapsing, then add {{3}} of tinned tomatoes and simmer down.',
	{ kind: 'cook', min: 20, max: 25, unit: 'minutes' },
	[
		{ ingredient: pepper, quantity: 2, unit: '', prep: 'sliced' },
		{ ingredient: onion, quantity: 1, unit: '', prep: 'sliced' },
		{ ingredient: tinnedTomato, quantity: 800, unit: 'g' }
	]
);
const shakEggs = step(
	shakshuka,
	'Make wells and crack in {{1}} eggs. Lid on, low heat, until the whites set and the yolks do not.',
	{ kind: 'cook', min: 8, max: 10, unit: 'minutes' },
	[{ ingredient: egg, quantity: 6, unit: '' }]
);
const shakFinish = step(
	shakshuka,
	'Crumble over {{1}} of feta and eat straight from the pan.',
	null,
	[{ ingredient: feta, quantity: 100, unit: 'g' }]
);
const shakDefault = composition(shakshuka, null, null);
place(shakDefault, [shakBase.stepId, shakEggs.stepId, shakFinish.stepId]);
recordVersion(shakshuka);

// --- Recipe 5: Green curry ------------------------------------------------

const curry = recipe('Green curry with aubergine', 4, [dinner, thai, main]);
const fryPaste = step(
	curry,
	'Split {{1}} of coconut milk in a dry pan, fry {{2}} of green curry paste in the fat until it darkens a shade.',
	{ kind: 'active', min: 5, unit: 'minutes' },
	[
		{ ingredient: coconutMilk, quantity: 400, unit: 'ml' },
		{ ingredient: greenCurryPaste, quantity: 3, unit: 'tbsp', ratePercent: 75 }
	]
);
const simmerCurry = step(
	curry,
	'Add {{1}} aubergines and the rest of the coconut milk, simmer until the aubergine gives up.',
	{ kind: 'cook', min: 15, max: 20, unit: 'minutes' },
	[{ ingredient: aubergine, quantity: 3, unit: '', prep: 'quartered' }]
);
const seasonCurry = step(
	curry,
	'Season with {{1}} of fish sauce and throw in {{2}} of Thai basil at the last moment.',
	null,
	[
		{ ingredient: fishSauce, quantity: 2, unit: 'tbsp', ratePercent: 70 },
		{ ingredient: thaiBasil, quantity: 1, unit: 'handful' }
	]
);
const curryDefault = composition(curry, null, null);
place(curryDefault, [fryPaste.stepId, simmerCurry.stepId, seasonCurry.stepId]);
recordVersion(curry);

// --- Recipe 6: Buttermilk pancakes ---------------------------------------

const pancakes = recipe('Saturday pancakes', 4, [breakfast, side]);
const batter = step(
	pancakes,
	'Whisk {{1}} of plain flour, {{2}} of milk and {{3}} eggs to a thick batter and rest it.',
	{ kind: 'active', min: 5, unit: 'minutes' },
	[
		{ ingredient: flour, quantity: 250, unit: 'g' },
		{ ingredient: milk, quantity: 300, unit: 'ml', alternative: oatMilk },
		{ ingredient: egg, quantity: 2, unit: '' }
	]
);
const rest = step(
	pancakes,
	'Let the batter sit so the flour hydrates.',
	{
		kind: 'wait',
		min: 30,
		unit: 'minutes'
	},
	[]
);
const fry = step(
	pancakes,
	'Fry in {{1}} of butter over medium heat, one ladle at a time, flipping when the bubbles stay open.',
	{ kind: 'active', min: 15, unit: 'minutes' },
	[{ ingredient: butter, quantity: 30, unit: 'g' }]
);
const pancakesDefault = composition(pancakes, null, null);
place(pancakesDefault, [batter.stepId, rest.stepId, fry.stepId]);
recordVersion(pancakes);

// --- Favorites, Collections ----------------------------------------------

const insertFavorite = insert('INSERT INTO favorites (recipe_id, profile_id) VALUES (?, ?)');
insertFavorite.run(chilliRecipe, jan);
insertFavorite.run(chilliRecipe, mira);
insertFavorite.run(sourdough, jan);
insertFavorite.run(shakshuka, tobi);
insertFavorite.run(peanutNoodles, tobi);

const insertCollection = insert('INSERT INTO collections (profile_id, name) VALUES (?, ?)');
const insertCollectionRecipe = insert(
	'INSERT INTO collection_recipes (collection_id, recipe_id) VALUES (?, ?)'
);
function collection(profileId: number, name: string, recipeIds: number[]): number {
	insertCollection.run(profileId, name);
	const id = lastId().id;
	for (const r of recipeIds) insertCollectionRecipe.run(id, r);
	return id;
}

collection(jan, 'Weeknight staples', [chilliRecipe, peanutNoodles, shakshuka]);
collection(mira, 'Feeding a crowd', [chilliRecipe, curry]);
collection(tobi, 'Weekend projects', [sourdough, pancakes]);

// --- Cook history ---------------------------------------------------------

const insertCook = insert(
	`INSERT INTO cooks (recipe_id, composition_id, recipe_version_id, acting_profile_id, cooked_at, outcome, summary)
	 VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertCookDiner = insert('INSERT INTO cook_diners (cook_id, profile_id) VALUES (?, ?)');
const insertAnnotation = insert(
	'INSERT INTO cook_log_annotations (cook_id, step_id, ingredient_usage_id, note) VALUES (?, ?, ?, ?)'
);

function cook(
	recipeId: number,
	compositionId: number,
	versionId: number,
	actingProfileId: number,
	cookedAt: string,
	outcome: string,
	summary: string,
	diners: number[],
	annotations: { stepId?: number; usageId?: number; note: string }[] = []
): number {
	insertCook.run(recipeId, compositionId, versionId, actingProfileId, cookedAt, outcome, summary);
	const id = lastId().id;
	for (const d of diners) insertCookDiner.run(id, d);
	for (const a of annotations) {
		insertAnnotation.run(id, a.stepId ?? null, a.usageId ?? null, a.note);
	}
	return id;
}

cook(
	chilliRecipe,
	chilliDefault,
	chilliV2,
	jan,
	'2026-07-18',
	'worked-well',
	'Doubled it for the balcony dinner. Held up fine in the pot for an hour.',
	[jan, mira, tobi],
	[
		{
			stepId: simmer.stepId,
			note: 'Needed the full hour at 8 servings, not the 48 minutes the scaling suggested.'
		},
		{
			usageId: finish.usageIds[1],
			note: 'Under-salted at first pass. Salt again after the chocolate goes in.'
		}
	]
);

cook(
	chilliRecipe,
	sinCarne,
	chilliV2,
	mira,
	'2026-07-31',
	'needs-tweaks',
	'Sin carne version for Ana. Soy mince went mushy - fry it harder and drier next time.',
	[mira, tobi],
	[
		{
			stepId: soyOverride.stepId,
			note: 'Twelve minutes is not enough. Go to twenty and let it stick.'
		}
	]
);

cook(
	chilliRecipe,
	chilliDefault,
	chilliV2,
	tobi,
	'2026-08-04',
	'worked-well',
	'Weeknight half batch. Skipped the lime, missed it.',
	[tobi]
);

cook(
	sourdough,
	sourdoughDefault,
	sourdoughV1,
	jan,
	'2026-08-02',
	'needs-tweaks',
	'Overproofed. Kitchen was 26 degrees and I still gave it the full five hours.',
	[jan, mira],
	[{ stepId: bulk.stepId, note: 'In summer this is a three-hour bulk, not four.' }]
);

cook(
	shakshuka,
	shakDefault,
	(
		db.prepare('SELECT id FROM recipe_versions WHERE recipe_id = ?').get(shakshuka) as {
			id: number;
		}
	).id,
	mira,
	'2026-08-06',
	'worked-well',
	'Sunday. Perfect yolks for once.',
	[jan, mira]
);

const counts = WIPE.map(
	(table) =>
		`${table}: ${(db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n}`
);
console.log(`Seeded ${url}`);
console.log(counts.join('\n'));
