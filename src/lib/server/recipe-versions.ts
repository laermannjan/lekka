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
	type Step
} from './db/schema';
import {
	toIngredientUsageContent,
	toPortableScalingFormula,
	toStepContent,
	type IngredientUsageContent,
	type PortableScalingFormula,
	type StepContent
} from './db/content';

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
	steps: (Pick<Step, 'id'> & StepContent)[];
	compositionSteps: Pick<
		CompositionStep,
		'compositionId' | 'position' | 'poolStepId' | 'overrideStepId'
	>[];
	ingredientUsages: (Pick<IngredientUsage, 'id' | 'stepId'> & IngredientUsageContent)[];
	scalingFormulas: PortableScalingFormula[];
};

export function captureRecipeSnapshot(tx: Tx, recipeId: number): RecipeSnapshot {
	const compositionRows = tx
		.select()
		.from(compositions)
		.where(eq(compositions.recipeId, recipeId))
		.all();
	const stepRows = tx.select().from(steps).where(eq(steps.recipeId, recipeId)).all();

	// None of the `inArray`s below needs an empty-list guard: drizzle compiles
	// one over an empty array to `false`, which is exactly the intent.
	const compositionIds = compositionRows.map((c) => c.id);
	const compositionStepRows = tx
		.select()
		.from(compositionSteps)
		.where(inArray(compositionSteps.compositionId, compositionIds))
		.all();

	const stepIds = stepRows.map((s) => s.id);
	const usageRows = tx
		.select()
		.from(ingredientUsages)
		.where(inArray(ingredientUsages.stepId, stepIds))
		.all();

	const usageIds = usageRows.map((u) => u.id);
	const scalingFormulaRows = tx
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
		steps: stepRows.map((s) => ({ id: s.id, ...toStepContent(s) })),
		compositionSteps: compositionStepRows.map((cs) => ({
			compositionId: cs.compositionId,
			position: cs.position,
			poolStepId: cs.poolStepId,
			overrideStepId: cs.overrideStepId
		})),
		ingredientUsages: usageRows.map((u) => ({
			id: u.id,
			stepId: u.stepId,
			...toIngredientUsageContent(u)
		})),
		scalingFormulas: scalingFormulaRows.map(toPortableScalingFormula)
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
