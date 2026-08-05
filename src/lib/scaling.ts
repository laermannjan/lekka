// Pure Scaling Formula math (see CONTEXT.md's "Scaling Formula"). Isomorphic
// on purpose: the server uses it to compute what's persisted-as-authored
// into what's actually shown at a given servings count, and the recipe-edit
// UI imports the same functions to render a live preview while a formula is
// being authored, without a server round trip.
//
// No formula present means linear scaling for a Quantity, constant
// (unaffected by servings) for a Duration - callers pass `null` for that
// case rather than a synthesized formula, so "no rule" and "an explicit
// rate_vs_servings rule at 100%" stay distinguishable at the UI layer even
// though they compute the same number.

export type ScalingDirection = 'increase' | 'decrease';
export type ScalingThresholdSide = 'short' | 'over';

export type RateVsServingsFormula = {
	kind: 'rate_vs_servings';
	ratePercent: number;
};

export type VsOtherUsageFormula = {
	kind: 'vs_other_usage';
	otherUsageId: number;
	perUnitAmount: number;
	direction: ScalingDirection;
	thresholdSide: ScalingThresholdSide;
};

export type FixedFormula = { kind: 'fixed' };

// A Quantity can only carry the rate-vs-servings or fixed templates - the
// vs-another-Usage template is Duration-only (see CONTEXT.md).
export type QuantityScalingFormula = RateVsServingsFormula | FixedFormula;

export type DurationScalingFormula = RateVsServingsFormula | FixedFormula | VsOtherUsageFormula;

// Strict linear response to a serving-count change - the default for a
// Quantity with no Scaling Formula attached.
export function linearScale(
	baseValue: number,
	baseServings: number,
	targetServings: number
): number {
	if (baseServings <= 0) return baseValue;
	return baseValue * (targetServings / baseServings);
}

// The rate-vs-servings template: at 100% the value tracks servings exactly
// (same as `linearScale`); below 100% it moves slower than servings, above
// 100% faster.
export function rateScale(
	baseValue: number,
	baseServings: number,
	targetServings: number,
	ratePercent: number
): number {
	if (baseServings <= 0) return baseValue;
	const rate = ratePercent / 100;
	return baseValue * (1 + rate * (targetServings / baseServings - 1));
}

// Resolves an Ingredient Usage's Quantity at `targetServings`, given the
// Quantity as authored at `baseServings` and an optional Scaling Formula.
export function computeScaledQuantity(
	baseValue: number,
	baseServings: number,
	targetServings: number,
	formula: QuantityScalingFormula | null
): number {
	if (!formula) return Math.max(0, linearScale(baseValue, baseServings, targetServings));
	if (formula.kind === 'fixed') return baseValue;
	return Math.max(0, rateScale(baseValue, baseServings, targetServings, formula.ratePercent));
}

// The signed per-unit delta the "vs. another Usage" template applies,
// derived from its two independent fill-in-the-blank choices: which way the
// response moves (`direction`), and which side of the reference Usage's
// usual Quantity triggers it (`thresholdSide`). E.g. "increase by 3 min per
// unit short of" means the response grows as the reference Usage's Quantity
// falls below its usual amount - a negative per-unit rate applied to
// (scaled - usual), which is negative when short.
function vsOtherUsageDelta(
	perUnitAmount: number,
	direction: ScalingDirection,
	thresholdSide: ScalingThresholdSide,
	otherUsageBaseQuantity: number,
	otherUsageScaledQuantity: number
): number {
	const sign = (direction === 'increase') === (thresholdSide === 'over') ? 1 : -1;
	return sign * perUnitAmount * (otherUsageScaledQuantity - otherUsageBaseQuantity);
}

// Resolves a Step's Duration value (call once each for min and, if present,
// max) at `targetServings`, given the Duration as authored at
// `baseServings` and an optional Scaling Formula. `otherUsage` is required
// only for the vs-other-Usage template - its referenced Usage's Quantity as
// authored and as already resolved at `targetServings`.
export function computeScaledDuration(
	baseValue: number,
	baseServings: number,
	targetServings: number,
	formula: DurationScalingFormula | null,
	otherUsage?: { baseQuantity: number; scaledQuantity: number }
): number {
	if (!formula || formula.kind === 'fixed') return baseValue;
	if (formula.kind === 'rate_vs_servings') {
		return Math.max(0, rateScale(baseValue, baseServings, targetServings, formula.ratePercent));
	}
	if (!otherUsage) return baseValue;
	const delta = vsOtherUsageDelta(
		formula.perUnitAmount,
		formula.direction,
		formula.thresholdSide,
		otherUsage.baseQuantity,
		otherUsage.scaledQuantity
	);
	return Math.max(0, baseValue + delta);
}
