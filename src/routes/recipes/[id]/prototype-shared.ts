// PROTOTYPE - shared *data* helpers for the three UI variants on this route.
// Deliberately no layout and no styling here: each variant is free to throw
// out the whole structure, which is the point of the exercise. Delete this
// file along with the variants once one has won.

import type { EffectiveStep, UsageWithIngredient } from '$lib/server/recipes';
import type { Ingredient } from '$lib/server/db/schema';

export function ingredientLabel(ingredient: Ingredient): string {
	return ingredient.descriptors
		? `${ingredient.baseTerm} (${ingredient.descriptors})`
		: ingredient.baseTerm;
}

export type AggregatedLine = {
	key: string;
	ingredient: Ingredient;
	unit: string;
	total: number;
	display: string;
	usages: UsageWithIngredient[];
};

// What #41 asks the real whole-recipe list to do: one line per Ingredient,
// summed across every Usage, split by unit so incompatible units are never
// silently added. Rounding is applied to the displayed total only.
export function aggregateIngredients(steps: EffectiveStep[]): AggregatedLine[] {
	const lines = new Map<string, AggregatedLine>();

	for (const step of steps) {
		for (const usage of step.usages) {
			const key = `${usage.ingredientId}:${usage.quantityUnit}`;
			const existing = lines.get(key);
			if (existing) {
				existing.total += usage.scaledQuantityValue;
				existing.usages.push(usage);
			} else {
				lines.set(key, {
					key,
					ingredient: usage.ingredient,
					unit: usage.quantityUnit,
					total: usage.scaledQuantityValue,
					display: '',
					usages: [usage]
				});
			}
		}
	}

	for (const line of lines.values()) {
		const rounded = line.ingredient.roundToWholeUnit
			? Math.max(1, Math.round(line.total))
			: Math.round(line.total * 100) / 100;
		line.display = line.unit ? `${rounded} ${line.unit}` : String(rounded);
	}

	return [...lines.values()];
}

export function durationLabel(step: EffectiveStep): string | null {
	if (step.scaledDurationMin === null) return null;
	const range =
		step.scaledDurationMax !== null && step.scaledDurationMax !== step.scaledDurationMin
			? `${step.scaledDurationMin}–${step.scaledDurationMax}`
			: String(step.scaledDurationMin);
	return `${range} ${step.durationUnit ?? ''}`.trim();
}

export const DURATION_KIND_LABELS: Record<string, string> = {
	active: 'hands on',
	wait: 'waiting',
	cook: 'on the heat',
	estimate: 'roughly'
};

export const OUTCOME_LABELS: Record<string, string> = {
	'worked-well': 'Worked well',
	'needs-tweaks': 'Needs tweaks',
	'did-not-work': 'Did not work'
};

export const SERVING_CHOICES = [1, 2, 4, 6, 8, 12];

// Every variant changes servings and Composition by navigating, not by
// mutating - a read-only prototype, per the skill's anti-patterns.
export function viewUrl(
	search: URLSearchParams,
	patch: Record<string, string | number | undefined>
): string {
	const next = new URLSearchParams(search);
	next.set('variant', next.get('variant') ?? 'A');
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) next.delete(key);
		else next.set(key, String(value));
	}
	return `?${next.toString()}`;
}
