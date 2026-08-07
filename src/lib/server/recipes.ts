import { asc, count, eq, inArray, and, max, min, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from './db';
import {
	compositions,
	compositionSteps,
	cooks,
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
	hasDuration,
	toIngredientUsageContent,
	toScalingFormulaContent,
	toStepContent,
	type PortableScalingFormula,
	type StepContent
} from './db/content';
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

function insertStep(tx: Tx, recipeId: number, content: StepContent): Step {
	return tx
		.insert(steps)
		.values({ recipeId, ...toStepContent(content) })
		.returning()
		.get();
}

// Clones every Ingredient Usage from one Step onto another, preserving order,
// together with the Scaling Formulas attached to those Usages' Quantities and
// to the source Step's Duration. Used wherever a Step's content gets copied
// into a fresh Step row - seeding a Variant's override (`createVariant`) and
// taking over an unmodified Step as an override (`overrideStep`) - since Step
// is the sole override unit and an override owns its own Usages outright (see
// CONTEXT.md's Composition: an override carries instruction, Duration and
// Usages together, and a Scaling Formula is part of that content).
function copyUsagesAndFormulasToStep(tx: Tx, fromStep: Step, toStep: Step): void {
	const sourceUsages = tx
		.select()
		.from(ingredientUsages)
		.where(eq(ingredientUsages.stepId, fromStep.id))
		.orderBy(asc(ingredientUsages.position))
		.all();

	// Each copy's new id is needed twice over - to key its own Scaling Formula
	// to, and to remap a Duration formula's `otherUsageId` onto - so the copies
	// have to be matched back to their sources one for one. They're read back
	// by id rather than from `.returning()`, which gives no row order on a
	// multi-row insert: `toStep` is a Step this transaction just created, so
	// the Usages below are its only ones, and AUTOINCREMENT hands out strictly
	// increasing ids in the order the rows were written.
	const usageIdMap = new Map<number, number>();
	if (sourceUsages.length > 0) {
		tx.insert(ingredientUsages)
			.values(
				sourceUsages.map((usage) => ({ stepId: toStep.id, ...toIngredientUsageContent(usage) }))
			)
			.run();
		const copies = tx
			.select({ id: ingredientUsages.id })
			.from(ingredientUsages)
			.where(eq(ingredientUsages.stepId, toStep.id))
			.orderBy(asc(ingredientUsages.id))
			.all();
		sourceUsages.forEach((usage, index) => usageIdMap.set(usage.id, copies[index].id));
	}

	copyScalingFormulasToStep(tx, fromStep, toStep, sourceUsages, usageIdMap);
}

// Recreates one Scaling Formula against a fresh set of rows, translating each
// of its three recipe-scoped ids through the given maps, and does nothing if
// any of them has no counterpart - a formula whose Usage or Step didn't make
// it across has nothing left to attach to.
//
// Every path that recreates formulas on new rows goes through here: reverting
// to a snapshot and copying a Step's content both move the same columns under
// the same remap, and keeping that in one place is what stops a path from
// quietly dropping a field. This omission has already shipped twice - commit
// 20f1080 on the Version path, and the Step-copy path this helper was
// extracted from. The same goes for the "a Duration formula needs a Duration"
// invariant below: it's enforced here rather than at each call site, so a path
// added later can't route through the remap and still land a formula on a
// Duration-less Step.
//
// `otherUsageId` is the one field pointing at another recipe-scoped row -
// always a Usage on the same Step (see CONTEXT.md). Left unmapped it would
// resolve against a Usage on a different Step, and would be cascade-deleted
// the moment the source Step went away (exactly what `overrideStep` does to a
// Step it re-overrides).
function insertRemappedFormula(
	tx: Tx,
	formula: PortableScalingFormula,
	usageIdMap: Map<number, number>,
	stepIdMap: Map<number, number>
): void {
	const ingredientUsageId =
		formula.ingredientUsageId !== null ? (usageIdMap.get(formula.ingredientUsageId) ?? null) : null;
	if (formula.ingredientUsageId !== null && ingredientUsageId === null) return;

	const stepId = formula.stepId !== null ? (stepIdMap.get(formula.stepId) ?? null) : null;
	if (formula.stepId !== null && stepId === null) return;

	const otherUsageId =
		formula.otherUsageId !== null ? (usageIdMap.get(formula.otherUsageId) ?? null) : null;
	if (formula.otherUsageId !== null && otherUsageId === null) return;

	// A Duration formula only lands on a row that has a Duration for it to
	// scale - an override may drop the Duration the source Step had, and a
	// formula on a Duration-less Step is a state `setDurationScalingFormula`
	// refuses to create in the first place (see CONTEXT.md: a formula is part
	// of the thing it scales and doesn't outlive it).
	if (stepId !== null) {
		const targetStep = tx.select().from(steps).where(eq(steps.id, stepId)).get();
		if (!targetStep || !hasDuration(targetStep)) return;
	}

	tx.insert(scalingFormulas)
		.values({
			ingredientUsageId,
			stepId,
			otherUsageId,
			...toScalingFormulaContent(formula)
		})
		.run();
}

// Clones the Scaling Formulas that belong to a Step's content onto its copy:
// one per copied Ingredient Usage's Quantity, plus the Step's own Duration
// formula. `usageIdMap` maps each source Usage id to its copy.
function copyScalingFormulasToStep(
	tx: Tx,
	fromStep: Step,
	toStep: Step,
	sourceUsages: IngredientUsage[],
	usageIdMap: Map<number, number>
): void {
	const quantityFormulas = getQuantityScalingFormulasByUsageIds(
		sourceUsages.map((usage) => usage.id),
		tx
	);
	const durationFormula = getDurationScalingFormulasByStepIds([fromStep.id], tx).get(fromStep.id);

	const sourceFormulas = [...quantityFormulas.values()];
	// "Vs. another Usage" moves the Duration by a per-unit amount expressed in
	// that Duration's own unit, so it means something different the moment the
	// unit does - an override re-entering "4 hours" where the source said "240
	// minutes" would otherwise keep a per-minute amount and read it as
	// per-hour. There's no unit conversion to fall back on (a Duration's unit
	// is free text), so the rule is dropped rather than silently reinterpreted,
	// the same way it's dropped when the Duration goes away entirely.
	if (
		durationFormula &&
		(durationFormula.kind !== 'vs_other_usage' || toStep.durationUnit === fromStep.durationUnit)
	) {
		sourceFormulas.push(durationFormula);
	}

	// Every Step id in play here is the source Step's, and they all land on the
	// one copy.
	const stepIdMap = new Map([[fromStep.id, toStep.id]]);
	for (const formula of sourceFormulas) {
		insertRemappedFormula(tx, formula, usageIdMap, stepIdMap);
	}
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

export const RECIPE_SORTS = [
	'alphabetical',
	'recently-added',
	'last-cooked',
	'most-cooked'
] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

export type ListRecipesOptions = {
	sort?: RecipeSort;
	search?: string;
};

// The Recipe browse view's household-wide sort/search (see CONTEXT.md's
// Cook: "the basis for browsing a Recipe by last-cooked ... or
// most-cooked ... alongside plain alphabetical and recently-added"). Every
// sort is computed from existing rows, no new fields. `recently-added` uses
// `min(recipeVersions.id)` rather than its text `createdAt` timestamp, since
// id order tracks creation order exactly even when two Versions land in the
// same second.
export function listRecipes(options: ListRecipesOptions = {}): Recipe[] {
	const sort = options.sort ?? 'recently-added';
	const search = options.search?.trim().toLowerCase();

	let rows = db.select().from(recipes).orderBy(asc(recipes.id)).all();
	if (search) {
		rows = rows.filter((recipe) => recipe.title.toLowerCase().includes(search));
	}

	switch (sort) {
		case 'alphabetical':
			return rows.sort((a, b) => a.title.localeCompare(b.title));
		case 'last-cooked': {
			const lastCookedByRecipeId = getLastCookedDatesByRecipeId();
			return rows.sort((a, b) => {
				const aDate = lastCookedByRecipeId.get(a.id);
				const bDate = lastCookedByRecipeId.get(b.id);
				if (aDate === undefined && bDate === undefined) return 0;
				if (aDate === undefined) return 1;
				if (bDate === undefined) return -1;
				return bDate.localeCompare(aDate);
			});
		}
		case 'most-cooked': {
			const cookCountByRecipeId = getCookCountsByRecipeId();
			return rows.sort(
				(a, b) => (cookCountByRecipeId.get(b.id) ?? 0) - (cookCountByRecipeId.get(a.id) ?? 0)
			);
		}
		case 'recently-added':
		default: {
			const firstVersionIdByRecipeId = getFirstVersionIdsByRecipeId();
			return rows.sort(
				(a, b) =>
					(firstVersionIdByRecipeId.get(b.id) ?? 0) - (firstVersionIdByRecipeId.get(a.id) ?? 0)
			);
		}
	}
}

function getFirstVersionIdsByRecipeId(): Map<number, number> {
	const rows = db
		.select({ recipeId: recipeVersions.recipeId, firstVersionId: min(recipeVersions.id) })
		.from(recipeVersions)
		.groupBy(recipeVersions.recipeId)
		.all();
	return new Map(rows.map((row) => [row.recipeId, row.firstVersionId!]));
}

function getLastCookedDatesByRecipeId(): Map<number, string> {
	const rows = db
		.select({ recipeId: cooks.recipeId, lastCookedAt: max(cooks.cookedAt) })
		.from(cooks)
		.groupBy(cooks.recipeId)
		.all();
	return new Map(rows.map((row) => [row.recipeId, row.lastCookedAt!]));
}

function getCookCountsByRecipeId(): Map<number, number> {
	const rows = db
		.select({ recipeId: cooks.recipeId, cookCount: count() })
		.from(cooks)
		.groupBy(cooks.recipeId)
		.all();
	return new Map(rows.map((row) => [row.recipeId, row.cookCount]));
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
			// A slot whose override Step has gone missing still seeds as a slot -
			// it falls back to the pool Step it references, rather than dropping
			// out of the Variant and leaving a hole in the position sequence.
			// Belt and braces: `overrideStepId` cascades, so deleting the Step
			// takes the slot with it and this shouldn't be reachable at all.
			const sourceOverride =
				row.overrideStepId === null
					? undefined
					: tx.select().from(steps).where(eq(steps.id, row.overrideStepId)).get();

			let overrideStepId: number | null = null;
			if (sourceOverride) {
				const copiedOverride = insertStep(tx, recipeId, sourceOverride);
				copyUsagesAndFormulasToStep(tx, sourceOverride, copiedOverride);
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

		// Copied before the previous override Step is dropped below, and with
		// every Usage reference remapped onto this copy, so nothing the copy
		// owns is left pointing into the Step about to be deleted.
		const previousContentStep = tx
			.select()
			.from(steps)
			.where(eq(steps.id, previousContentStepId))
			.get();
		if (previousContentStep) {
			copyUsagesAndFormulasToStep(tx, previousContentStep, overrideStepRow);
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
		if (!hasDuration(step)) {
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
			const inserted = insertStep(tx, recipeId, s);
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
				.values({ stepId: newStepId, ...toIngredientUsageContent(u) })
				.returning()
				.get();
			usageIdMap.set(u.id, inserted.id);
		}

		// Formulas hang off ids this revert has just reissued, so each one goes
		// through the same remap as the Step-content copy path - dropped if the
		// Usage or Step it attached to didn't make it into this snapshot.
		for (const f of snapshot.scalingFormulas) {
			insertRemappedFormula(tx, f, usageIdMap, stepIdMap);
		}

		return recordVersion(tx, recipeId, versionId);
	});
}
