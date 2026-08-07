import type { DurationKind, IngredientUsage, ScalingFormula, Step } from './schema';

// The column sets that make up a row's *content* - everything it carries
// apart from its own identity and the recipe-scoped ids that place it.
//
// Named here because several paths recreate these rows against a fresh set
// of ids - copying a Step's content into an override, seeding a Variant,
// capturing a snapshot, reverting to one - and every one of them has to move
// exactly the same columns. Spelled out per call site instead, a column added
// to a table reaches some of those paths and not others, and the new field is
// silently dropped on override, on Variant seeding, or on revert. That has
// already shipped twice (commit 20f1080 on the Version path, and the
// Step-copy path `insertRemappedFormula` was extracted from).

export type StepContent = Pick<
	Step,
	'instruction' | 'durationKind' | 'durationMin' | 'durationMax' | 'durationUnit'
>;

export function toStepContent(step: StepContent): StepContent {
	return {
		instruction: step.instruction,
		durationKind: step.durationKind,
		durationMin: step.durationMin,
		durationMax: step.durationMax,
		durationUnit: step.durationUnit
	};
}

export type IngredientUsageContent = Pick<
	IngredientUsage,
	| 'ingredientId'
	| 'position'
	| 'quantityValue'
	| 'quantityUnit'
	| 'prepAttribute'
	| 'alternativeIngredientId'
	| 'note'
>;

export function toIngredientUsageContent(usage: IngredientUsageContent): IngredientUsageContent {
	return {
		ingredientId: usage.ingredientId,
		position: usage.position,
		quantityValue: usage.quantityValue,
		quantityUnit: usage.quantityUnit,
		prepAttribute: usage.prepAttribute,
		// The Alternative Ingredient is a global Ingredient reference, not a
		// recipe-scoped row, so it travels as-is - unlike `otherUsageId` on a
		// Scaling Formula, which every copy path has to remap.
		alternativeIngredientId: usage.alternativeIngredientId,
		note: usage.note
	};
}

// A Scaling Formula's own fields, without the three recipe-scoped ids it
// hangs off (`ingredientUsageId`, `stepId`, `otherUsageId`) - those are
// remapped per copy rather than carried over (see `insertRemappedFormula`).
export type ScalingFormulaContent = Pick<
	ScalingFormula,
	'kind' | 'ratePercent' | 'perUnitAmount' | 'direction' | 'thresholdSide'
>;

export function toScalingFormulaContent(formula: ScalingFormulaContent): ScalingFormulaContent {
	return {
		kind: formula.kind,
		ratePercent: formula.ratePercent,
		perUnitAmount: formula.perUnitAmount,
		direction: formula.direction,
		thresholdSide: formula.thresholdSide
	};
}

// A Scaling Formula as it travels between rows: its content plus the three
// ids, each of which needs translating onto the copy's rows.
export type ScalingFormulaLinks = Pick<
	ScalingFormula,
	'ingredientUsageId' | 'stepId' | 'otherUsageId'
>;
export type PortableScalingFormula = ScalingFormulaContent & ScalingFormulaLinks;

export function toPortableScalingFormula(formula: PortableScalingFormula): PortableScalingFormula {
	return {
		ingredientUsageId: formula.ingredientUsageId,
		stepId: formula.stepId,
		otherUsageId: formula.otherUsageId,
		...toScalingFormulaContent(formula)
	};
}

// Whether a Step carries a Duration at all - the one predicate for it, so the
// paths that copy a Duration's Scaling Formula and the path that renders a
// scaled Duration can never disagree about what "has a Duration" means. A
// Step's four duration columns are always written together or all left null
// (see `validateDuration`), so either one answers it; asking about both keeps
// that true even if a future path writes them apart.
export function hasDuration<T extends Pick<Step, 'durationKind' | 'durationMin'>>(
	step: T
): step is T & { durationKind: DurationKind; durationMin: number } {
	return step.durationKind !== null && step.durationMin !== null;
}
