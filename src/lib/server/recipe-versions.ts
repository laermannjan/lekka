import { eq, inArray, or } from 'drizzle-orm';
import { db } from './db';
import {
	compositions,
	compositionSteps,
	ingredientUsages,
	recipeVersions,
	scalingFormulas,
	steps,
	type Composition,
	type CompositionStep,
	type IngredientUsage,
	type RecipeVersion,
	type ScalingFormula,
	type Step
} from './db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A self-contained capture of a Recipe's Step pool and every Composition
// together, plus each Usage's Alternative Ingredient and every Scaling
// Formula on that pool - the unit `recordVersion` stores and
// `revertToVersion` (in ./recipes) restores (see CONTEXT.md's Version: one
// shared timeline, no per-Variant history). Row ids are the ones live at
// capture time; `revertToVersion` remaps them to freshly-inserted rows
// rather than trying to resurrect the same ids.
export type RecipeSnapshot = {
	compositions: Pick<Composition, 'id' | 'name' | 'isDefault' | 'seededFromCompositionId'>[];
	steps: Pick<
		Step,
		'id' | 'instruction' | 'durationKind' | 'durationMin' | 'durationMax' | 'durationUnit'
	>[];
	compositionSteps: Pick<
		CompositionStep,
		'compositionId' | 'position' | 'poolStepId' | 'overrideStepId'
	>[];
	ingredientUsages: Pick<
		IngredientUsage,
		| 'id'
		| 'stepId'
		| 'ingredientId'
		| 'position'
		| 'quantityValue'
		| 'quantityUnit'
		| 'prepAttribute'
		| 'alternativeIngredientId'
		| 'note'
	>[];
	scalingFormulas: Pick<
		ScalingFormula,
		| 'ingredientUsageId'
		| 'stepId'
		| 'kind'
		| 'ratePercent'
		| 'otherUsageId'
		| 'perUnitAmount'
		| 'direction'
		| 'thresholdSide'
	>[];
};

export function captureRecipeSnapshot(tx: Tx, recipeId: number): RecipeSnapshot {
	const compositionRows = tx
		.select()
		.from(compositions)
		.where(eq(compositions.recipeId, recipeId))
		.all();
	const stepRows = tx.select().from(steps).where(eq(steps.recipeId, recipeId)).all();

	const compositionIds = compositionRows.map((c) => c.id);
	const compositionStepRows =
		compositionIds.length === 0
			? []
			: tx
					.select()
					.from(compositionSteps)
					.where(inArray(compositionSteps.compositionId, compositionIds))
					.all();

	const stepIds = stepRows.map((s) => s.id);
	const usageRows =
		stepIds.length === 0
			? []
			: tx.select().from(ingredientUsages).where(inArray(ingredientUsages.stepId, stepIds)).all();

	const usageIds = usageRows.map((u) => u.id);
	const scalingFormulaRows =
		stepIds.length === 0 && usageIds.length === 0
			? []
			: tx
					.select()
					.from(scalingFormulas)
					.where(
						or(
							inArray(scalingFormulas.stepId, stepIds),
							inArray(scalingFormulas.ingredientUsageId, usageIds)
						)
					)
					.all();

	return {
		compositions: compositionRows.map((c) => ({
			id: c.id,
			name: c.name,
			isDefault: c.isDefault,
			seededFromCompositionId: c.seededFromCompositionId
		})),
		steps: stepRows.map((s) => ({
			id: s.id,
			instruction: s.instruction,
			durationKind: s.durationKind,
			durationMin: s.durationMin,
			durationMax: s.durationMax,
			durationUnit: s.durationUnit
		})),
		compositionSteps: compositionStepRows.map((cs) => ({
			compositionId: cs.compositionId,
			position: cs.position,
			poolStepId: cs.poolStepId,
			overrideStepId: cs.overrideStepId
		})),
		ingredientUsages: usageRows.map((u) => ({
			id: u.id,
			stepId: u.stepId,
			ingredientId: u.ingredientId,
			position: u.position,
			quantityValue: u.quantityValue,
			quantityUnit: u.quantityUnit,
			prepAttribute: u.prepAttribute,
			alternativeIngredientId: u.alternativeIngredientId,
			note: u.note
		})),
		scalingFormulas: scalingFormulaRows.map((f) => ({
			ingredientUsageId: f.ingredientUsageId,
			stepId: f.stepId,
			kind: f.kind,
			ratePercent: f.ratePercent,
			otherUsageId: f.otherUsageId,
			perUnitAmount: f.perUnitAmount,
			direction: f.direction,
			thresholdSide: f.thresholdSide
		}))
	};
}

// Records a new Version at the end of the Recipe's single shared timeline,
// capturing the pool, every Composition, and every Scaling Formula together
// in one snapshot (see CONTEXT.md). Called at the end of every mutating
// operation on the pool/compositions/Usages/Scaling Formulas, so the
// timeline never has a gap where the live state doesn't match any Version.
export function recordVersion(
	tx: Tx,
	recipeId: number,
	revertedFromVersionId: number | null = null
): RecipeVersion {
	const snapshot = captureRecipeSnapshot(tx, recipeId);
	return tx
		.insert(recipeVersions)
		.values({ recipeId, snapshot: JSON.stringify(snapshot), revertedFromVersionId })
		.returning()
		.get();
}
