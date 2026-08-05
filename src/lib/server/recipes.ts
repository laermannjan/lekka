import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	ingredients,
	ingredientUsages,
	recipes,
	steps,
	DURATION_KINDS,
	type DurationKind,
	type Ingredient,
	type IngredientUsage,
	type Recipe,
	type Step
} from './db/schema';

const MAX_TITLE_LENGTH = 120;
const MAX_INSTRUCTION_LENGTH = 2000;

export class BlankTitleError extends Error {}
export class BlankInstructionError extends Error {}
export class InvalidDurationError extends Error {}
export class InvalidQuantityError extends Error {}
export class IngredientNotFoundError extends Error {}

export function createRecipe(title: string): Recipe {
	const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
	if (!trimmed) throw new BlankTitleError('Title must not be blank');

	return db.insert(recipes).values({ title: trimmed }).returning().get();
}

export function listRecipes(): Recipe[] {
	return db.select().from(recipes).orderBy(asc(recipes.createdAt)).all();
}

export function getRecipeById(id: number): Recipe | undefined {
	return db.select().from(recipes).where(eq(recipes.id, id)).get();
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

export function addStep(
	recipeId: number,
	input: { instruction: string; duration?: DurationInput }
): Step {
	const instruction = input.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH);
	if (!instruction) throw new BlankInstructionError('Instruction must not be blank');
	const durationColumns = validateDuration(input.duration);

	return db.transaction((tx) => {
		const existing = tx
			.select({ position: steps.position })
			.from(steps)
			.where(eq(steps.recipeId, recipeId))
			.all();
		const position = existing.length + 1;

		return tx
			.insert(steps)
			.values({
				recipeId,
				position,
				instruction,
				durationKind: durationColumns?.durationKind ?? null,
				durationMin: durationColumns?.durationMin ?? null,
				durationMax: durationColumns?.durationMax ?? null,
				durationUnit: durationColumns?.durationUnit ?? null
			})
			.returning()
			.get();
	});
}

export function updateStepInstruction(stepId: number, instruction: string): Step {
	const trimmed = instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH);
	if (!trimmed) throw new BlankInstructionError('Instruction must not be blank');

	return db
		.update(steps)
		.set({ instruction: trimmed })
		.where(eq(steps.id, stepId))
		.returning()
		.get();
}

export function addIngredientUsage(
	stepId: number,
	input: {
		ingredientId: number;
		quantityValue: number;
		quantityUnit?: string;
		prepAttribute?: string;
		note?: string;
	}
): IngredientUsage {
	if (!Number.isFinite(input.quantityValue) || input.quantityValue < 0) {
		throw new InvalidQuantityError('Quantity must be a non-negative number');
	}

	const ingredient = db
		.select()
		.from(ingredients)
		.where(eq(ingredients.id, input.ingredientId))
		.get();
	if (!ingredient) throw new IngredientNotFoundError(`No ingredient with id ${input.ingredientId}`);

	const prepAttribute = input.prepAttribute?.trim() || null;
	const note = input.note?.trim() || null;
	const quantityUnit = input.quantityUnit?.trim() ?? '';

	return db.transaction((tx) => {
		const existing = tx
			.select({ position: ingredientUsages.position })
			.from(ingredientUsages)
			.where(eq(ingredientUsages.stepId, stepId))
			.all();
		const position = existing.length + 1;

		return tx
			.insert(ingredientUsages)
			.values({
				stepId,
				position,
				ingredientId: input.ingredientId,
				quantityValue: input.quantityValue,
				quantityUnit,
				prepAttribute,
				note
			})
			.returning()
			.get();
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
	displayQuantity: string;
};
export type StepWithUsages = Step & {
	usages: UsageWithIngredient[];
	renderedInstruction: string;
};
export type RecipeDetail = Recipe & { steps: StepWithUsages[] };

// The full Recipe detail: its default Composition's Steps in order, each
// with its Ingredient Usages in order. The whole-recipe ingredient list
// and the inline per-step display both read from `steps[].usages` here,
// so they can never disagree (see CONTEXT.md).
export function getRecipe(id: number): RecipeDetail | undefined {
	const recipe = getRecipeById(id);
	if (!recipe) return undefined;

	const recipeSteps = db
		.select()
		.from(steps)
		.where(eq(steps.recipeId, id))
		.orderBy(asc(steps.position))
		.all();

	const stepIds = recipeSteps.map((step) => step.id);
	const usageRows =
		stepIds.length === 0
			? []
			: db
					.select({ usage: ingredientUsages, ingredient: ingredients })
					.from(ingredientUsages)
					.innerJoin(ingredients, eq(ingredients.id, ingredientUsages.ingredientId))
					.where(inArray(ingredientUsages.stepId, stepIds))
					.orderBy(asc(ingredientUsages.position))
					.all();

	const usagesByStepId = new Map<number, UsageWithIngredient[]>();
	for (const row of usageRows) {
		const usage = {
			...row.usage,
			ingredient: row.ingredient,
			displayQuantity: formatQuantity(
				row.usage.quantityValue,
				row.usage.quantityUnit,
				row.ingredient
			)
		};
		const list = usagesByStepId.get(usage.stepId) ?? [];
		list.push(usage);
		usagesByStepId.set(usage.stepId, list);
	}

	return {
		...recipe,
		steps: recipeSteps.map((step) => {
			const usages = usagesByStepId.get(step.id) ?? [];
			return { ...step, usages, renderedInstruction: renderInstruction(step.instruction, usages) };
		})
	};
}
