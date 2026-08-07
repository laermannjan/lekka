import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	scalingFormulas,
	ingredientUsages,
	steps,
	SCALING_FORMULA_KINDS,
	SCALING_DIRECTIONS,
	SCALING_THRESHOLD_SIDES,
	type ScalingFormula,
	type ScalingDirection,
	type ScalingThresholdSide
} from './db/schema';
import { hasDuration } from './db/content';
import { recordVersion } from './recipe-versions';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class InvalidScalingFormulaError extends Error {}
export class ScalingUsageNotFoundError extends Error {}
export class ScalingStepNotFoundError extends Error {}

// The form-layer shape a Scaling Formula is authored from - one of the v1
// guided templates (see CONTEXT.md). `vs_other_usage` only ever applies to
// a Duration; passing it to `setQuantityScalingFormula` is rejected.
export type ScalingFormulaInput =
	| { kind: 'fixed' }
	| { kind: 'rate_vs_servings'; ratePercent: number }
	| {
			kind: 'vs_other_usage';
			otherUsageId: number;
			perUnitAmount: number;
			direction: ScalingDirection;
			thresholdSide: ScalingThresholdSide;
	  };

function validateFormulaInput(
	input: ScalingFormulaInput,
	opts: { allowVsOtherUsage: boolean }
): void {
	if (!SCALING_FORMULA_KINDS.includes(input.kind)) {
		throw new InvalidScalingFormulaError(`Unknown scaling formula kind "${input.kind}"`);
	}
	if (input.kind === 'rate_vs_servings') {
		if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) {
			throw new InvalidScalingFormulaError('Rate must be a non-negative number');
		}
	}
	if (input.kind === 'vs_other_usage') {
		if (!opts.allowVsOtherUsage) {
			throw new InvalidScalingFormulaError(
				'The "vs. another Usage" template only applies to a Duration'
			);
		}
		if (!Number.isInteger(input.otherUsageId) || input.otherUsageId < 1) {
			throw new InvalidScalingFormulaError('Pick a usage to reference');
		}
		if (!Number.isFinite(input.perUnitAmount) || input.perUnitAmount < 0) {
			throw new InvalidScalingFormulaError('Per-unit amount must be a non-negative number');
		}
		if (!SCALING_DIRECTIONS.includes(input.direction)) {
			throw new InvalidScalingFormulaError(`Unknown direction "${input.direction}"`);
		}
		if (!SCALING_THRESHOLD_SIDES.includes(input.thresholdSide)) {
			throw new InvalidScalingFormulaError(`Unknown threshold side "${input.thresholdSide}"`);
		}
	}
}

// Attaches a Scaling Formula to an Ingredient Usage's Quantity, replacing
// any formula already there. Passing `{ kind: 'fixed' }` or
// `{ kind: 'rate_vs_servings', ratePercent: 100 }` both stay distinct,
// author-visible choices even though 100%-rate computes the same as linear
// (see CONTEXT.md).
export function setQuantityScalingFormula(
	ingredientUsageId: number,
	input: ScalingFormulaInput
): ScalingFormula {
	validateFormulaInput(input, { allowVsOtherUsage: false });

	const usage = db
		.select()
		.from(ingredientUsages)
		.where(eq(ingredientUsages.id, ingredientUsageId))
		.get();
	if (!usage) throw new ScalingUsageNotFoundError(`No ingredient usage ${ingredientUsageId}`);
	const step = db.select().from(steps).where(eq(steps.id, usage.stepId)).get();
	if (!step) throw new ScalingStepNotFoundError(`No step ${usage.stepId}`);

	return db.transaction((tx) => {
		tx.delete(scalingFormulas)
			.where(eq(scalingFormulas.ingredientUsageId, ingredientUsageId))
			.run();
		const formula = tx
			.insert(scalingFormulas)
			.values({
				ingredientUsageId,
				kind: input.kind,
				ratePercent: input.kind === 'rate_vs_servings' ? input.ratePercent : null
			})
			.returning()
			.get();
		recordVersion(tx, step.recipeId);
		return formula;
	});
}

// Removes an Ingredient Usage's Quantity Scaling Formula, if any - the
// Quantity reverts to default strict-linear scaling.
export function removeQuantityScalingFormula(ingredientUsageId: number): void {
	const usage = db
		.select()
		.from(ingredientUsages)
		.where(eq(ingredientUsages.id, ingredientUsageId))
		.get();
	if (!usage) return;
	const step = db.select().from(steps).where(eq(steps.id, usage.stepId)).get();
	if (!step) return;

	db.transaction((tx) => {
		tx.delete(scalingFormulas)
			.where(eq(scalingFormulas.ingredientUsageId, ingredientUsageId))
			.run();
		recordVersion(tx, step.recipeId);
	});
}

// Attaches a Scaling Formula to a Step's Duration, replacing any formula
// already there. For `vs_other_usage`, the referenced Usage must belong to
// this same Step - it's the only Usage in scope wherever this Duration is
// shown.
export function setDurationScalingFormula(
	stepId: number,
	input: ScalingFormulaInput
): ScalingFormula {
	validateFormulaInput(input, { allowVsOtherUsage: true });

	const step = db.select().from(steps).where(eq(steps.id, stepId)).get();
	if (!step) throw new ScalingStepNotFoundError(`No step ${stepId}`);
	if (!hasDuration(step)) {
		throw new InvalidScalingFormulaError(
			'This step has no Duration to attach a Scaling Formula to'
		);
	}

	let otherUsageId: number | null = null;
	if (input.kind === 'vs_other_usage') {
		const otherUsage = db
			.select()
			.from(ingredientUsages)
			.where(eq(ingredientUsages.id, input.otherUsageId))
			.get();
		if (!otherUsage)
			throw new ScalingUsageNotFoundError(`No ingredient usage ${input.otherUsageId}`);
		if (otherUsage.stepId !== stepId) {
			throw new InvalidScalingFormulaError('The referenced usage must belong to the same step');
		}
		otherUsageId = otherUsage.id;
	}

	return db.transaction((tx) => {
		tx.delete(scalingFormulas).where(eq(scalingFormulas.stepId, stepId)).run();
		const formula = tx
			.insert(scalingFormulas)
			.values({
				stepId,
				kind: input.kind,
				ratePercent: input.kind === 'rate_vs_servings' ? input.ratePercent : null,
				otherUsageId,
				perUnitAmount: input.kind === 'vs_other_usage' ? input.perUnitAmount : null,
				direction: input.kind === 'vs_other_usage' ? input.direction : null,
				thresholdSide: input.kind === 'vs_other_usage' ? input.thresholdSide : null
			})
			.returning()
			.get();
		recordVersion(tx, step.recipeId);
		return formula;
	});
}

// Removes a Step's Duration Scaling Formula, if any - the Duration reverts
// to default constant (unaffected by servings).
export function removeDurationScalingFormula(stepId: number): void {
	const step = db.select().from(steps).where(eq(steps.id, stepId)).get();
	if (!step) return;

	db.transaction((tx) => {
		tx.delete(scalingFormulas).where(eq(scalingFormulas.stepId, stepId)).run();
		recordVersion(tx, step.recipeId);
	});
}

// Every Quantity Scaling Formula among the given Usages, keyed by Usage id.
// Reads through `handle`, so the read path (plain `db`) and the paths that
// copy a Step's content mid-transaction share one definition of "the
// formulas belonging to these Usages".
export function getQuantityScalingFormulasByUsageIds(
	usageIds: number[],
	handle: Tx | typeof db = db
): Map<number, ScalingFormula> {
	const result = new Map<number, ScalingFormula>();
	const rows = handle
		.select()
		.from(scalingFormulas)
		.where(inArray(scalingFormulas.ingredientUsageId, usageIds))
		.all();
	for (const row of rows) {
		if (row.ingredientUsageId !== null) result.set(row.ingredientUsageId, row);
	}
	return result;
}

// Every Duration Scaling Formula among the given Steps, keyed by Step id.
export function getDurationScalingFormulasByStepIds(
	stepIds: number[],
	handle: Tx | typeof db = db
): Map<number, ScalingFormula> {
	const result = new Map<number, ScalingFormula>();
	const rows = handle
		.select()
		.from(scalingFormulas)
		.where(inArray(scalingFormulas.stepId, stepIds))
		.all();
	for (const row of rows) {
		if (row.stepId !== null) result.set(row.stepId, row);
	}
	return result;
}
