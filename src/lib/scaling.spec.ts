import { describe, expect, it } from 'vitest';
import { computeScaledDuration, computeScaledQuantity, linearScale, rateScale } from './scaling';

describe('scaling', () => {
	describe('linearScale', () => {
		it('scales strictly proportionally to servings', () => {
			expect(linearScale(200, 4, 8)).toEqual(400);
			expect(linearScale(200, 4, 2)).toEqual(100);
		});

		it('is a no-op at the base servings count', () => {
			expect(linearScale(200, 4, 4)).toEqual(200);
		});
	});

	describe('rateScale', () => {
		it('matches linear scaling at a 100% rate', () => {
			expect(rateScale(200, 4, 8, 100)).toEqual(linearScale(200, 4, 8));
		});

		it('moves half as much at a 50% rate', () => {
			// doubling servings would be +200 linear; at 50% rate it's +100
			expect(rateScale(200, 4, 8, 50)).toEqual(300);
		});

		it('stays constant at a 0% rate', () => {
			expect(rateScale(200, 4, 8, 0)).toEqual(200);
			expect(rateScale(200, 4, 2, 0)).toEqual(200);
		});

		it('moves further than linear above a 100% rate', () => {
			expect(rateScale(200, 4, 8, 200)).toEqual(600);
		});
	});

	describe('computeScaledQuantity', () => {
		it('defaults to linear scaling with no formula', () => {
			expect(computeScaledQuantity(200, 4, 8, null)).toEqual(400);
		});

		it('stays fixed with a fixed formula regardless of servings', () => {
			expect(computeScaledQuantity(200, 4, 8, { kind: 'fixed' })).toEqual(200);
			expect(computeScaledQuantity(200, 4, 1, { kind: 'fixed' })).toEqual(200);
		});

		it('applies a rate_vs_servings formula', () => {
			expect(
				computeScaledQuantity(200, 4, 8, { kind: 'rate_vs_servings', ratePercent: 50 })
			).toEqual(300);
		});

		it('never goes negative', () => {
			expect(
				computeScaledQuantity(10, 4, 1, { kind: 'rate_vs_servings', ratePercent: 500 })
			).toEqual(0);
		});
	});

	describe('computeScaledDuration', () => {
		it('defaults to constant with no formula', () => {
			expect(computeScaledDuration(240, 4, 8, null)).toEqual(240);
		});

		it('stays fixed with a fixed formula', () => {
			expect(computeScaledDuration(240, 4, 8, { kind: 'fixed' })).toEqual(240);
		});

		it('applies a rate_vs_servings formula', () => {
			expect(
				computeScaledDuration(240, 4, 8, { kind: 'rate_vs_servings', ratePercent: 100 })
			).toEqual(480);
		});

		it('increases when short of the referenced usage (increase + short)', () => {
			// starter usual 100g, currently at 60g (40g short) -> +3min per gram short
			const result = computeScaledDuration(
				240,
				4,
				4,
				{
					kind: 'vs_other_usage',
					otherUsageId: 1,
					perUnitAmount: 3,
					direction: 'increase',
					thresholdSide: 'short'
				},
				{ baseQuantity: 100, scaledQuantity: 60 }
			);
			expect(result).toEqual(240 + 3 * 40);
		});

		it('increases when over the referenced usage (increase + over)', () => {
			const result = computeScaledDuration(
				240,
				4,
				4,
				{
					kind: 'vs_other_usage',
					otherUsageId: 1,
					perUnitAmount: 3,
					direction: 'increase',
					thresholdSide: 'over'
				},
				{ baseQuantity: 100, scaledQuantity: 140 }
			);
			expect(result).toEqual(240 + 3 * 40);
		});

		it('decreases when short of the referenced usage (decrease + short)', () => {
			const result = computeScaledDuration(
				240,
				4,
				4,
				{
					kind: 'vs_other_usage',
					otherUsageId: 1,
					perUnitAmount: 3,
					direction: 'decrease',
					thresholdSide: 'short'
				},
				{ baseQuantity: 100, scaledQuantity: 60 }
			);
			expect(result).toEqual(240 - 3 * 40);
		});

		it('stays at base when the referenced usage is at its usual quantity', () => {
			const result = computeScaledDuration(
				240,
				4,
				4,
				{
					kind: 'vs_other_usage',
					otherUsageId: 1,
					perUnitAmount: 3,
					direction: 'increase',
					thresholdSide: 'short'
				},
				{ baseQuantity: 100, scaledQuantity: 100 }
			);
			expect(result).toEqual(240);
		});

		it('never goes negative', () => {
			const result = computeScaledDuration(
				10,
				4,
				4,
				{
					kind: 'vs_other_usage',
					otherUsageId: 1,
					perUnitAmount: 3,
					direction: 'decrease',
					thresholdSide: 'short'
				},
				{ baseQuantity: 100, scaledQuantity: 60 }
			);
			expect(result).toEqual(0);
		});
	});
});
