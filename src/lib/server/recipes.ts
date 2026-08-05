import { asc, eq, inArray, and, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from './db';
import {
	compositions,
	compositionSteps,
	ingredients,
	ingredientUsages,
	recipes,
	recipeVersions,
	scalingFormulas,
	steps,
	DURATION_KINDS,
	type Composition,
	type CompositionStep,
	type DurationKind,
	type Ingredient,
	type IngredientUsage,
	type Recipe,
	type RecipeVersion,
	type ScalingFormula,
	type Step
} from './db/schema';
import {
	computeScaledDuration,
	computeScaledQuantity,
	type DurationScalingFormula,
	type QuantityScalingFormula
} from '$lib/scaling';
import {
	getDurationScalingFormulasByStepIds,
	getQuantityScalingFormulasByUsageIds
} from './scaling';
import { recordVersion, type RecipeSnapshot } from './recipe-versions';

// A second reference to `ingredients`, so a Usage's primary Ingredient and
// its optional Alternative Ingredient (see CONTEXT.md) can both be
// left-joined in the same query.
const alternativeIngredients = alias(ingredients, 'alternative_ingredients');

const MAX_TITLE_LENGTH = 120;
const MAX_INSTRUCTION_LENGTH = 2000;
const MAX_VARIANT_NAME_LENGTH = 80;

export class BlankTitleError extends Error {}
export class BlankInstructionError extends Error {}
export class InvalidDurationError extends Error {}
export class InvalidQuantityError extends Error {}
export class IngredientNotFoundError extends Error {}
export class BlankVariantNameError extends Error {}
export class CompositionNotFoundError extends Error {}
export class CompositionStepNotFoundError extends Error {}
export class InvalidServingsError extends Error {}
export class RecipeNotFoundError extends Error {}
export class StepNotFoundError extends Error {}
export class RecipeVersionNotFoundError extends Error {}

const DEFAULT_SERVINGS = 4;

function validateServings(servings: number): number {
	if (!Number.isFinite(servings) || !Number.isInteger(servings) || servings < 1) {
		throw new InvalidServingsError('Servings must be a whole number of at least 1');
	}
	return servings;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertStep(
	tx: Tx,
	recipeId: number,
	content: {
		instruction: string;
		durationKind: DurationKind | null;
		durationMin: number | null;
		durationMax: number | null;
		durationUnit: string | null;
	}
): Step {
	return tx
		.insert(steps)
		.values({ recipeId, ...content })
		.returning()
		.get();
}

export function createRecipe(title: string, servings: number = DEFAULT_SERVINGS): Recipe {
	const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
	if (!trimmed) throw new BlankTitleError('Title must not be blank');
	const validServings = validateServings(servings);

	return db.transaction((tx) => {
		const recipe = tx
			.insert(recipes)
			.values({ title: trimmed, servings: validServings })
			.returning()
			.get();
		tx.insert(compositions).values({ recipeId: recipe.id, name: null, isDefault: true }).run();
		recordVersion(tx, recipe.id);
		return recipe;
	});
}

// Updates a Recipe's base/usual servings count - the baseline every stored
// Quantity and Duration is "as written" at (see CONTEXT.md). This changes
// what count default linear scaling treats as 1x; it does not touch any
// stored Quantity or Duration value.
export function updateServings(recipeId: number, servings: number): Recipe {
	const validServings = validateServings(servings);
	const recipe = db
		.update(recipes)
		.set({ servings: validServings })
		.where(eq(recipes.id, recipeId))
		.returning()
		.get();
	if (!recipe) throw new RecipeNotFoundError(`No recipe ${recipeId}`);
	return recipe;
}

export function listRecipes(): Recipe[] {
	return db.select().from(recipes).orderBy(asc(recipes.createdAt)).all();
}

export function getRecipeById(id: number): Recipe | undefined {
	return db.select().from(recipes).where(eq(recipes.id, id)).get();
}

// A Recipe's Compositions - the default line first, then Variants in
// creation order (see CONTEXT.md). No Composition is structurally
// privileged; `isDefault` only decides this ordering and which line loads
// first.
export function listCompositions(recipeId: number): Composition[] {
	const rows = db.select().from(compositions).where(eq(compositions.recipeId, recipeId)).all();
	return rows.sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.createdAt.localeCompare(b.createdAt);
	});
}

export function getDefaultComposition(recipeId: number): Composition {
	const composition = db
		.select()
		.from(compositions)
		.where(and(eq(compositions.recipeId, recipeId), eq(compositions.isDefault, true)))
		.get();
	if (!composition)
		throw new CompositionNotFoundError(`No default composition for recipe ${recipeId}`);
	return composition;
}

export function getCompositionById(id: number): Composition | undefined {
	return db.select().from(compositions).where(eq(compositions.id, id)).get();
}

// Creates a named Variant by seeding it from an existing Composition's
// current Step list (see CONTEXT.md). The seed is recorded only as
// informational lineage - each seeded reference is an independent copy, so
// later edits to one Composition never reach the other. An overridden slot
// is duplicated into its own new override Step (and its own copy of that
// Step's Usages) so the two Compositions can diverge from here on.
export function createVariant(
	recipeId: number,
	name: string,
	seedFromCompositionId: number
): Composition {
	const trimmedName = name.trim().slice(0, MAX_VARIANT_NAME_LENGTH);
	if (!trimmedName) throw new BlankVariantNameError('Variant name must not be blank');

	const seedFrom = getCompositionById(seedFromCompositionId);
	if (!seedFrom || seedFrom.recipeId !== recipeId) {
		throw new CompositionNotFoundError(
			`No composition ${seedFromCompositionId} on recipe ${recipeId}`
		);
	}

	return db.transaction((tx) => {
		const variant = tx
			.insert(compositions)
			.values({
				recipeId,
				name: trimmedName,
				isDefault: false,
				seededFromCompositionId: seedFromCompositionId
			})
			.returning()
			.get();

		const seedRows = tx
			.select()
			.from(compositionSteps)
			.where(eq(compositionSteps.compositionId, seedFromCompositionId))
			.orderBy(asc(compositionSteps.position))
			.all();

		for (const row of seedRows) {
			let overrideStepId: number | null = null;
			if (row.overrideStepId !== null) {
				const sourceOverride = tx
					.select()
					.from(steps)
					.where(eq(steps.id, row.overrideStepId))
					.get();
				if (!sourceOverride) continue;
				const copiedOverride = insertStep(tx, recipeId, {
					instruction: sourceOverride.instruction,
					durationKind: sourceOverride.durationKind,
					durationMin: sourceOverride.durationMin,
					durationMax: sourceOverride.durationMax,
					durationUnit: sourceOverride.durationUnit
				});
				const sourceUsages = tx
					.select()
					.from(ingredientUsages)
					.where(eq(ingredientUsages.stepId, row.overrideStepId))
					.orderBy(asc(ingredientUsages.position))
					.all();
				if (sourceUsages.length > 0) {
					tx.insert(ingredientUsages)
						.values(
							sourceUsages.map((usage) => ({
								stepId: copiedOverride.id,
								ingredientId: usage.ingredientId,
								position: usage.position,
								quantityValue: usage.quantityValue,
								quantityUnit: usage.quantityUnit,
								prepAttribute: usage.prepAttribute,
								alternativeIngredientId: usage.alternativeIngredientId,
								note: usage.note
							}))
						)
						.run();
				}
				overrideStepId = copiedOverride.id;
			}

			tx.insert(compositionSteps)
				.values({
					compositionId: variant.id,
					position: row.position,
					poolStepId: row.poolStepId,
					overrideStepId
				})
				.run();
		}

		recordVersion(tx, recipeId);
		return variant;
	});
}

export type DurationInput = {
	kind: string;
	min: number;
	max?: number;
	unit: string;
};

function validateDuration(duration: DurationInput | undefined) {
	if (!duration) return null;
	if (!DURATION_KINDS.includes(duration.kind as DurationKind)) {
		throw new InvalidDurationError(`Unknown duration kind "${duration.kind}"`);
	}
	if (!Number.isFinite(duration.min) || duration.min < 0) {
		throw new InvalidDurationError('Duration min must be a non-negative number');
	}
	if (
		duration.max !== undefined &&
		(!Number.isFinite(duration.max) || duration.max < duration.min)
	) {
		throw new InvalidDurationError('Duration max must be a number at least as large as min');
	}
	if (!duration.unit.trim()) {
		throw new InvalidDurationError('Duration unit must not be blank');
	}
	return {
		durationKind: duration.kind as DurationKind,
		durationMin: duration.min,
		durationMax: duration.max ?? null,
		durationUnit: duration.unit.trim()
	};
}

function validateInstruction(instruction: string): string {
	const trimmed = instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH);
	if (!trimmed) throw new BlankInstructionError('Instruction must not be blank');
	return trimmed;
}

export type AddedStep = { step: Step; compositionStep: CompositionStep };

// Adds a new Step to the Recipe's shared pool and appends an unmodified
// reference to it at the end of one Composition's list (see CONTEXT.md). A
// Step added this way exists, for now, only in this one Composition -
// nothing stops another Composition from referencing the same pool Step
// later.
export function addStep(
	compositionId: number,
	input: { instruction: string; duration?: DurationInput }
): AddedStep {
	const instruction = validateInstruction(input.instruction);
	const durationColumns = validateDuration(input.duration);

	const composition = getCompositionById(compositionId);
	if (!composition) throw new CompositionNotFoundError(`No composition ${compositionId}`);

	return db.transaction((tx) => {
		const step = insertStep(tx, composition.recipeId, {
			instruction,
			durationKind: durationColumns?.durationKind ?? null,
			durationMin: durationColumns?.durationMin ?? null,
			durationMax: durationColumns?.durationMax ?? null,
			durationUnit: durationColumns?.durationUnit ?? null
		});

		const existing = tx
			.select({ position: compositionSteps.position })
			.from(compositionSteps)
			.where(eq(compositionSteps.compositionId, compositionId))
			.all();
		const position = existing.length + 1;

		const compositionStep = tx
			.insert(compositionSteps)
			.values({ compositionId, position, poolStepId: step.id, overrideStepId: null })
			.returning()
			.get();

		recordVersion(tx, composition.recipeId);
		return { step, compositionStep };
	});
}

export function updateStepInstruction(stepId: number, instruction: string): Step {
	const trimmed = validateInstruction(instruction);

	const existing = db.select().from(steps).where(eq(steps.id, stepId)).get();
	if (!existing) throw new StepNotFoundError(`No step ${stepId}`);

	return db.transaction((tx) => {
		const updated = tx
			.update(steps)
			.set({ instruction: trimmed })
			.where(eq(steps.id, stepId))
			.returning()
			.get();
		recordVersion(tx, existing.recipeId);
		return updated;
	});
}

// Overrides one Composition's slot with a full, Composition-local copy of
// the Step's content - instruction, Duration, and Usages together. The new
// override Step starts out carrying a copy of the slot's previous Usages
// (from the pool Step, or from an earlier override if this slot was already
// overridden), which the author can then add to or replace via
// `addIngredientUsage`, same as any other Step. Every other Composition
// referencing the original pool Step is unaffected.
export function overrideStep(
	compositionStepId: number,
	input: { instruction: string; duration?: DurationInput }
): Step {
	const instruction = validateInstruction(input.instruction);
	const durationColumns = validateDuration(input.duration);

	const row = db
		.select()
		.from(compositionSteps)
		.where(eq(compositionSteps.id, compositionStepId))
		.get();
	if (!row) throw new CompositionStepNotFoundError(`No composition step ${compositionStepId}`);

	const composition = getCompositionById(row.compositionId);
	if (!composition) throw new CompositionNotFoundError(`No composition ${row.compositionId}`);

	const previousContentStepId = row.overrideStepId ?? row.poolStepId;

	return db.transaction((tx) => {
		const overrideStepRow = insertStep(tx, composition.recipeId, {
			instruction,
			durationKind: durationColumns?.durationKind ?? null,
			durationMin: durationColumns?.durationMin ?? null,
			durationMax: durationColumns?.durationMax ?? null,
			durationUnit: durationColumns?.durationUnit ?? null
		});

		const previousUsages = tx
			.select()
			.from(ingredientUsages)
			.where(eq(ingredientUsages.stepId, previousContentStepId))
			.orderBy(asc(ingredientUsages.position))
			.all();
		if (previousUsages.length > 0) {
			tx.insert(ingredientUsages)
				.values(
					previousUsages.map((usage) => ({
						stepId: overrideStepRow.id,
						ingredientId: usage.ingredientId,
						position: usage.position,
						quantityValue: usage.quantityValue,
						quantityUnit: usage.quantityUnit,
						prepAttribute: usage.prepAttribute,
						alternativeIngredientId: usage.alternativeIngredientId,
						note: usage.note
					}))
				)
				.run();
		}

		const previousOverrideStepId = row.overrideStepId;

		tx.update(compositionSteps)
			.set({ overrideStepId: overrideStepRow.id })
			.where(eq(compositionSteps.id, compositionStepId))
			.run();

		// Re-overriding an already-overridden slot: the previous override Step
		// is owned solely by this row, so it's now orphaned - remove it (its
		// Usages cascade with it).
		if (previousOverrideStepId !== null) {
			tx.delete(steps).where(eq(steps.id, previousOverrideStepId)).run();
		}

		recordVersion(tx, composition.recipeId);
		return overrideStepRow;
	});
}

// Looks up an Ingredient by id, throwing IngredientNotFoundError if it
// doesn't exist. Shared by both the primary Ingredient and the optional
// Alternative Ingredient on a Usage - either one referencing a bogus id
// fails the same way.
function requireIngredient(id: number): Ingredient {
	const ingredient = db.select().from(ingredients).where(eq(ingredients.id, id)).get();
	if (!ingredient) throw new IngredientNotFoundError(`No ingredient with id ${id}`);
	return ingredient;
}

export function addIngredientUsage(
	stepId: number,
	input: {
		ingredientId: number;
		quantityValue: number;
		quantityUnit?: string;
		prepAttribute?: string;
		alternativeIngredientId?: number | null;
		note?: string;
	}
): IngredientUsage {
	if (!Number.isFinite(input.quantityValue) || input.quantityValue < 0) {
		throw new InvalidQuantityError('Quantity must be a non-negative number');
	}

	requireIngredient(input.ingredientId);
	if (input.alternativeIngredientId != null) {
		requireIngredient(input.alternativeIngredientId);
	}

	const step = db.select().from(steps).where(eq(steps.id, stepId)).get();
	if (!step) throw new StepNotFoundError(`No step ${stepId}`);

	const prepAttribute = input.prepAttribute?.trim() || null;
	const note = input.note?.trim() || null;
	const quantityUnit = input.quantityUnit?.trim() ?? '';
	const alternativeIngredientId = input.alternativeIngredientId ?? null;

	return db.transaction((tx) => {
		const existing = tx
			.select({ position: ingredientUsages.position })
			.from(ingredientUsages)
			.where(eq(ingredientUsages.stepId, stepId))
			.all();
		const position = existing.length + 1;

		const usage = tx
			.insert(ingredientUsages)
			.values({
				stepId,
				position,
				ingredientId: input.ingredientId,
				quantityValue: input.quantityValue,
				quantityUnit,
				prepAttribute,
				alternativeIngredientId,
				note
			})
			.returning()
			.get();

		recordVersion(tx, step.recipeId);
		return usage;
	});
}

export class IngredientUsageNotFoundError extends Error {}

// Declares (or clears, when `alternativeIngredientId` is null) the
// Alternative Ingredient on one specific Usage - scoped to that Usage only,
// never implied on other Usages of the same Ingredient elsewhere (see
// CONTEXT.md's Alternative entry).
export function setUsageAlternative(
	usageId: number,
	alternativeIngredientId: number | null
): IngredientUsage {
	const usage = db.select().from(ingredientUsages).where(eq(ingredientUsages.id, usageId)).get();
	if (!usage) throw new IngredientUsageNotFoundError(`No ingredient usage with id ${usageId}`);

	if (alternativeIngredientId != null) {
		requireIngredient(alternativeIngredientId);
	}

	const step = db.select().from(steps).where(eq(steps.id, usage.stepId)).get();
	if (!step) throw new StepNotFoundError(`No step ${usage.stepId}`);

	return db.transaction((tx) => {
		const updated = tx
			.update(ingredientUsages)
			.set({ alternativeIngredientId })
			.where(eq(ingredientUsages.id, usageId))
			.returning()
			.get();
		recordVersion(tx, step.recipeId);
		return updated;
	});
}

// A pool Step's other referrers - the Compositions (besides the one
// initiating a removal) whose list still references `poolStepId`, used to
// warn before a Step is dropped from the pool entirely. Included regardless
// of whether that other Composition has overridden the slot, since the
// underlying pool Step - and this lineage - is still shared.
export function getOtherCompositionsReferencingStep(
	poolStepId: number,
	excludingCompositionId: number
): Composition[] {
	const rows = db
		.select({ composition: compositions })
		.from(compositionSteps)
		.innerJoin(compositions, eq(compositions.id, compositionSteps.compositionId))
		.where(
			and(
				eq(compositionSteps.poolStepId, poolStepId),
				ne(compositionSteps.compositionId, excludingCompositionId)
			)
		)
		.all();
	return rows.map((row) => row.composition);
}

function renumberComposition(tx: Tx, compositionId: number) {
	const rows = tx
		.select()
		.from(compositionSteps)
		.where(eq(compositionSteps.compositionId, compositionId))
		.orderBy(asc(compositionSteps.position))
		.all();
	rows.forEach((row, index) => {
		const position = index + 1;
		if (row.position !== position) {
			tx.update(compositionSteps).set({ position }).where(eq(compositionSteps.id, row.id)).run();
		}
	});
}

// Removes a Step reference from one Composition's list, and optionally from
// other Compositions that also reference it - `alsoFromCompositionIds`
// should be exactly the subset of `getOtherCompositionsReferencingStep`'s
// result the author chose to also drop it from; Compositions left off keep
// their own reference untouched.
// Once no Composition references the pool Step at all, it's removed from
// the pool entirely.
export function removeStepFromComposition(
	compositionStepId: number,
	alsoFromCompositionIds: number[] = []
): void {
	const row = db
		.select()
		.from(compositionSteps)
		.where(eq(compositionSteps.id, compositionStepId))
		.get();
	if (!row) throw new CompositionStepNotFoundError(`No composition step ${compositionStepId}`);

	const composition = getCompositionById(row.compositionId);
	if (!composition) throw new CompositionNotFoundError(`No composition ${row.compositionId}`);

	db.transaction((tx) => {
		const alsoIds = new Set(alsoFromCompositionIds);
		const rowsToRemove =
			alsoIds.size === 0
				? [row]
				: tx
						.select()
						.from(compositionSteps)
						.where(eq(compositionSteps.poolStepId, row.poolStepId))
						.all()
						.filter((r) => r.id === row.id || alsoIds.has(r.compositionId));

		const affectedCompositionIds = new Set<number>();
		for (const r of rowsToRemove) {
			affectedCompositionIds.add(r.compositionId);
			tx.delete(compositionSteps).where(eq(compositionSteps.id, r.id)).run();
			if (r.overrideStepId !== null) {
				tx.delete(steps).where(eq(steps.id, r.overrideStepId)).run();
			}
		}

		for (const compositionId of affectedCompositionIds) {
			renumberComposition(tx, compositionId);
		}

		const stillReferenced = tx
			.select()
			.from(compositionSteps)
			.where(eq(compositionSteps.poolStepId, row.poolStepId))
			.all();
		if (stillReferenced.length === 0) {
			tx.delete(steps).where(eq(steps.id, row.poolStepId)).run();
		}

		recordVersion(tx, composition.recipeId);
	});
}

// Formats a Quantity for display, applying the Ingredient's rounding
// toggle (see CONTEXT.md). Rounding never changes the stored value - it
// only affects the string returned here, and is marked with "~" whenever
// the rounded figure differs from the exact one.
export function formatQuantity(value: number, unit: string, ingredient: Ingredient): string {
	let displayValue = value;
	let approximate = false;
	if (ingredient.roundToWholeUnit) {
		const rounded = Math.round(value);
		approximate = rounded !== value;
		displayValue = rounded;
	}
	const number = approximate ? `~${displayValue}` : `${displayValue}`;
	return unit ? `${number} ${unit}` : number;
}

// Weaves each `{{n}}` token in a Step's instruction into the formatted
// Quantity of that Step's nth Ingredient Usage (1-indexed, in Usage
// order) - see CONTEXT.md's "Quantities are woven directly into a Step's
// instruction text at point of use". A token with no matching Usage is
// left as-is.
export function renderInstruction(
	instruction: string,
	usages: (IngredientUsage & { ingredient: Ingredient })[]
): string {
	return instruction.replace(/\{\{(\d+)\}\}/g, (match, indexStr) => {
		const usage = usages[Number(indexStr) - 1];
		if (!usage) return match;
		return formatQuantity(usage.quantityValue, usage.quantityUnit, usage.ingredient);
	});
}

export type UsageWithIngredient = IngredientUsage & {
	ingredient: Ingredient;
	scaledQuantityValue: number;
	displayQuantity: string;
	scalingFormula: ScalingFormula | null;
	alternativeIngredient: Ingredient | null;
};

// One Composition's slot, resolved to its effective content - the override
// Step's content if the slot is overridden, the shared pool Step's
// otherwise (see CONTEXT.md).
export type EffectiveStep = Step & {
	compositionStepId: number;
	poolStepId: number;
	isOverride: boolean;
	usages: UsageWithIngredient[];
	renderedInstruction: string;
	otherCompositionsReferencing: Composition[];
	scaledDurationMin: number | null;
	scaledDurationMax: number | null;
	durationScalingFormula: ScalingFormula | null;
};

export type CompositionDetail = Composition & { steps: EffectiveStep[] };
export type RecipeDetail = Recipe & {
	compositions: Composition[];
	composition: CompositionDetail;
	targetServings: number;
};

function toQuantityFormulaInput(row: ScalingFormula | undefined): QuantityScalingFormula | null {
	if (!row) return null;
	if (row.kind === 'fixed') return { kind: 'fixed' };
	if (row.kind === 'rate_vs_servings') {
		return { kind: 'rate_vs_servings', ratePercent: row.ratePercent ?? 100 };
	}
	// vs_other_usage never applies to a Quantity (see CONTEXT.md) - treated as
	// no formula if it somehow ends up attached to one.
	return null;
}

function toDurationFormulaInput(row: ScalingFormula | undefined): DurationScalingFormula | null {
	if (!row) return null;
	if (row.kind === 'fixed') return { kind: 'fixed' };
	if (row.kind === 'rate_vs_servings') {
		return { kind: 'rate_vs_servings', ratePercent: row.ratePercent ?? 100 };
	}
	return {
		kind: 'vs_other_usage',
		otherUsageId: row.otherUsageId ?? 0,
		perUnitAmount: row.perUnitAmount ?? 0,
		direction: row.direction ?? 'increase',
		thresholdSide: row.thresholdSide ?? 'short'
	};
}

type RawUsage = IngredientUsage & {
	ingredient: Ingredient;
	alternativeIngredient: Ingredient | null;
};

function loadRawUsagesByStepId(stepIds: number[]): Map<number, RawUsage[]> {
	const usagesByStepId = new Map<number, RawUsage[]>();
	if (stepIds.length === 0) return usagesByStepId;

	const usageRows = db
		.select({
			usage: ingredientUsages,
			ingredient: ingredients,
			alternative: alternativeIngredients
		})
		.from(ingredientUsages)
		.innerJoin(ingredients, eq(ingredients.id, ingredientUsages.ingredientId))
		.leftJoin(
			alternativeIngredients,
			eq(alternativeIngredients.id, ingredientUsages.alternativeIngredientId)
		)
		.where(inArray(ingredientUsages.stepId, stepIds))
		.orderBy(asc(ingredientUsages.position))
		.all();

	for (const row of usageRows) {
		const usage = {
			...row.usage,
			ingredient: row.ingredient,
			alternativeIngredient: row.alternative
		};
		const list = usagesByStepId.get(usage.stepId) ?? [];
		list.push(usage);
		usagesByStepId.set(usage.stepId, list);
	}
	return usagesByStepId;
}

// Resolves every Usage's Quantity at `targetServings`, applying its Scaling
// Formula if it has one (default strict-linear otherwise - see CONTEXT.md).
function scaleUsages(
	rawUsagesByStepId: Map<number, RawUsage[]>,
	baseServings: number,
	targetServings: number
): Map<number, UsageWithIngredient[]> {
	const allUsageIds = [...rawUsagesByStepId.values()].flatMap((list) => list.map((u) => u.id));
	const formulas = getQuantityScalingFormulasByUsageIds(allUsageIds);

	const usagesByStepId = new Map<number, UsageWithIngredient[]>();
	for (const [stepId, rawUsages] of rawUsagesByStepId) {
		const scaled = rawUsages.map((raw) => {
			const formulaRow = formulas.get(raw.id);
			const scaledQuantityValue = computeScaledQuantity(
				raw.quantityValue,
				baseServings,
				targetServings,
				toQuantityFormulaInput(formulaRow)
			);
			return {
				...raw,
				scaledQuantityValue,
				displayQuantity: formatQuantity(scaledQuantityValue, raw.quantityUnit, raw.ingredient),
				scalingFormula: formulaRow ?? null
			};
		});
		usagesByStepId.set(stepId, scaled);
	}
	return usagesByStepId;
}

// Resolves every content Step's Duration at `targetServings`, applying its
// Scaling Formula if it has one (default constant otherwise - see
// CONTEXT.md). The "vs. another Usage" template reads that Usage's already-
// scaled Quantity from `usagesByStepId`, so it always sees the same number
// shown for that Usage.
function scaleDurations(
	contentSteps: Step[],
	usagesByStepId: Map<number, UsageWithIngredient[]>,
	baseServings: number,
	targetServings: number
): Map<number, { min: number | null; max: number | null; formula: ScalingFormula | null }> {
	const durationFormulas = getDurationScalingFormulasByStepIds(contentSteps.map((s) => s.id));

	const result = new Map<
		number,
		{ min: number | null; max: number | null; formula: ScalingFormula | null }
	>();
	for (const step of contentSteps) {
		const formulaRow = durationFormulas.get(step.id);
		if (step.durationMin === null) {
			result.set(step.id, { min: null, max: null, formula: formulaRow ?? null });
			continue;
		}

		let otherUsage: { baseQuantity: number; scaledQuantity: number } | undefined;
		if (formulaRow?.kind === 'vs_other_usage' && formulaRow.otherUsageId !== null) {
			const stepUsages = usagesByStepId.get(step.id) ?? [];
			const otherUsageEntry = stepUsages.find((u) => u.id === formulaRow.otherUsageId);
			if (otherUsageEntry) {
				otherUsage = {
					baseQuantity: otherUsageEntry.quantityValue,
					scaledQuantity: otherUsageEntry.scaledQuantityValue
				};
			}
		}

		const formulaInput = toDurationFormulaInput(formulaRow);
		const min = computeScaledDuration(
			step.durationMin,
			baseServings,
			targetServings,
			formulaInput,
			otherUsage
		);
		const max =
			step.durationMax !== null
				? computeScaledDuration(
						step.durationMax,
						baseServings,
						targetServings,
						formulaInput,
						otherUsage
					)
				: null;
		result.set(step.id, { min, max, formula: formulaRow ?? null });
	}
	return result;
}

// One Composition's Steps in order, each resolved to its effective content
// and Usages, with every Quantity and Duration scaled to `targetServings`
// (default the Recipe's own base `servings` - see CONTEXT.md). The
// whole-recipe ingredient list and the inline per-step display both read
// from `steps[].usages` here, so they can never disagree.
export function getCompositionDetail(
	compositionId: number,
	targetServings?: number
): CompositionDetail | undefined {
	const composition = getCompositionById(compositionId);
	if (!composition) return undefined;

	const recipe = getRecipeById(composition.recipeId);
	if (!recipe) return undefined;
	const baseServings = recipe.servings;
	const resolvedTargetServings = targetServings ?? baseServings;

	const rows = db
		.select()
		.from(compositionSteps)
		.where(eq(compositionSteps.compositionId, compositionId))
		.orderBy(asc(compositionSteps.position))
		.all();

	const contentStepIds = rows.map((row) => row.overrideStepId ?? row.poolStepId);
	const contentSteps =
		contentStepIds.length === 0
			? []
			: db.select().from(steps).where(inArray(steps.id, contentStepIds)).all();
	const stepsById = new Map(contentSteps.map((step) => [step.id, step]));

	const rawUsagesByStepId = loadRawUsagesByStepId(contentStepIds);
	const usagesByStepId = scaleUsages(rawUsagesByStepId, baseServings, resolvedTargetServings);
	const durationsByStepId = scaleDurations(
		contentSteps,
		usagesByStepId,
		baseServings,
		resolvedTargetServings
	);

	const effectiveSteps: EffectiveStep[] = rows.flatMap((row) => {
		const contentStepId = row.overrideStepId ?? row.poolStepId;
		const contentStep = stepsById.get(contentStepId);
		if (!contentStep) return [];

		const usages = usagesByStepId.get(contentStepId) ?? [];
		const otherCompositionsReferencing = getOtherCompositionsReferencingStep(
			row.poolStepId,
			compositionId
		);
		const scaledDuration = durationsByStepId.get(contentStepId) ?? {
			min: null,
			max: null,
			formula: null
		};
		const renderUsages = usages.map((usage) => ({
			...usage,
			quantityValue: usage.scaledQuantityValue
		}));

		return [
			{
				...contentStep,
				compositionStepId: row.id,
				poolStepId: row.poolStepId,
				isOverride: row.overrideStepId !== null,
				usages,
				renderedInstruction: renderInstruction(contentStep.instruction, renderUsages),
				otherCompositionsReferencing,
				scaledDurationMin: scaledDuration.min,
				scaledDurationMax: scaledDuration.max,
				durationScalingFormula: scaledDuration.formula
			}
		];
	});

	return { ...composition, steps: effectiveSteps };
}

// The full Recipe detail: every Composition (for tab switching), and one
// selected Composition's resolved Steps, scaled to `targetServings`
// (default the Recipe's own base `servings`) - the default Composition's if
// none is specified (see CONTEXT.md).
export function getRecipe(
	id: number,
	compositionId?: number,
	targetServings?: number
): RecipeDetail | undefined {
	const recipe = getRecipeById(id);
	if (!recipe) return undefined;
	const resolvedTargetServings = targetServings ?? recipe.servings;

	const allCompositions = listCompositions(id);
	const selected =
		(compositionId !== undefined
			? allCompositions.find((c) => c.id === compositionId)
			: undefined) ??
		allCompositions.find((c) => c.isDefault) ??
		allCompositions[0];
	if (!selected) return undefined;

	const composition = getCompositionDetail(selected.id, resolvedTargetServings);
	if (!composition) return undefined;

	return {
		...recipe,
		compositions: allCompositions,
		composition,
		targetServings: resolvedTargetServings
	};
}

// A Recipe's Version history, oldest first - the single shared timeline
// covering the Step pool and every Composition together (see CONTEXT.md).
// A caller displaying "Version N" should use 1-indexed position in this
// list; no version-number column is stored, so history stays append-only
// even if entries are ever pruned.
export function listRecipeVersions(recipeId: number): RecipeVersion[] {
	return db
		.select()
		.from(recipeVersions)
		.where(eq(recipeVersions.recipeId, recipeId))
		.orderBy(asc(recipeVersions.id))
		.all();
}

export function getRecipeVersionById(id: number): RecipeVersion | undefined {
	return db.select().from(recipeVersions).where(eq(recipeVersions.id, id)).get();
}

// Reverts a Recipe to a prior Version, restoring the Step pool and every
// Composition together, unambiguously - there's no per-Variant history to
// reconcile (see CONTEXT.md). Rather than truncating the timeline, this
// replaces the live state with the target Version's snapshot and then
// records that restored state as a new Version at the end of the timeline,
// so the fact something was reverted - and what was reverted away from -
// stays in the history rather than being destroyed by it.
export function revertToVersion(recipeId: number, versionId: number): RecipeVersion {
	const version = getRecipeVersionById(versionId);
	if (!version || version.recipeId !== recipeId) {
		throw new RecipeVersionNotFoundError(`No version ${versionId} on recipe ${recipeId}`);
	}
	const snapshot = JSON.parse(version.snapshot) as RecipeSnapshot;

	return db.transaction((tx) => {
		// Cascades: deleting a Composition removes its composition_steps rows;
		// deleting a Step removes any remaining composition_steps referencing it
		// plus its ingredient_usages.
		tx.delete(compositions).where(eq(compositions.recipeId, recipeId)).run();
		tx.delete(steps).where(eq(steps.recipeId, recipeId)).run();

		const stepIdMap = new Map<number, number>();
		for (const s of snapshot.steps) {
			const inserted = insertStep(tx, recipeId, {
				instruction: s.instruction,
				durationKind: s.durationKind,
				durationMin: s.durationMin,
				durationMax: s.durationMax,
				durationUnit: s.durationUnit
			});
			stepIdMap.set(s.id, inserted.id);
		}

		const compositionIdMap = new Map<number, number>();
		for (const c of snapshot.compositions) {
			const inserted = tx
				.insert(compositions)
				.values({ recipeId, name: c.name, isDefault: c.isDefault, seededFromCompositionId: null })
				.returning()
				.get();
			compositionIdMap.set(c.id, inserted.id);
		}
		// Second pass: `seededFromCompositionId` is informational lineage only
		// (see CONTEXT.md) - remap it now that every Composition in the
		// snapshot has a new id, dropping it if its source didn't make it into
		// this snapshot.
		for (const c of snapshot.compositions) {
			if (c.seededFromCompositionId === null) continue;
			const remappedSource = compositionIdMap.get(c.seededFromCompositionId);
			if (remappedSource === undefined) continue;
			tx.update(compositions)
				.set({ seededFromCompositionId: remappedSource })
				.where(eq(compositions.id, compositionIdMap.get(c.id)!))
				.run();
		}

		for (const cs of snapshot.compositionSteps) {
			const compositionId = compositionIdMap.get(cs.compositionId);
			const poolStepId = stepIdMap.get(cs.poolStepId);
			if (compositionId === undefined || poolStepId === undefined) continue;
			const overrideStepId =
				cs.overrideStepId !== null ? (stepIdMap.get(cs.overrideStepId) ?? null) : null;
			tx.insert(compositionSteps)
				.values({ compositionId, position: cs.position, poolStepId, overrideStepId })
				.run();
		}

		const usageIdMap = new Map<number, number>();
		for (const u of snapshot.ingredientUsages) {
			const newStepId = stepIdMap.get(u.stepId);
			if (newStepId === undefined) continue;
			const inserted = tx
				.insert(ingredientUsages)
				.values({
					stepId: newStepId,
					ingredientId: u.ingredientId,
					position: u.position,
					quantityValue: u.quantityValue,
					quantityUnit: u.quantityUnit,
					prepAttribute: u.prepAttribute,
					// The Alternative Ingredient is a global Ingredient reference,
					// not a recipe-scoped row, so it needs no remapping - unlike
					// `otherUsageId` on a Scaling Formula below.
					alternativeIngredientId: u.alternativeIngredientId,
					note: u.note
				})
				.returning()
				.get();
			usageIdMap.set(u.id, inserted.id);
		}

		// `otherUsageId` is the one Scaling Formula field that points at
		// another recipe-scoped row (an Ingredient Usage) rather than a global
		// or self-contained value, so it needs the same remap as everything
		// above - dropped if its target usage didn't make it into this
		// snapshot's Step (see CONTEXT.md: it's always a Usage on the same
		// Step as the Duration it's attached to).
		for (const f of snapshot.scalingFormulas) {
			const newIngredientUsageId =
				f.ingredientUsageId !== null ? (usageIdMap.get(f.ingredientUsageId) ?? null) : null;
			const newStepId = f.stepId !== null ? (stepIdMap.get(f.stepId) ?? null) : null;
			if (f.ingredientUsageId !== null && newIngredientUsageId === null) continue;
			if (f.stepId !== null && newStepId === null) continue;
			const newOtherUsageId =
				f.otherUsageId !== null ? (usageIdMap.get(f.otherUsageId) ?? null) : null;
			if (f.otherUsageId !== null && newOtherUsageId === null) continue;

			tx.insert(scalingFormulas)
				.values({
					ingredientUsageId: newIngredientUsageId,
					stepId: newStepId,
					kind: f.kind,
					ratePercent: f.ratePercent,
					otherUsageId: newOtherUsageId,
					perUnitAmount: f.perUnitAmount,
					direction: f.direction,
					thresholdSide: f.thresholdSide
				})
				.run();
		}

		return recordVersion(tx, recipeId, versionId);
	});
}
