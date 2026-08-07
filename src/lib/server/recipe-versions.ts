import { eq, inArray, or } from 'drizzle-orm';
import { db } from './db';
import {
	compositions,
	compositionSteps,
	ingredientUsages,
	recipes,
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

// A self-contained capture of a Recipe's base servings, its Step pool and
// every Composition together, plus each Usage's Alternative Ingredient and
// every Scaling Formula on that pool - the unit `recordVersion` stores and
// `revertToVersion` (in ./recipes) restores (see CONTEXT.md's Version: one
// shared timeline, no per-Variant history). Row ids are the ones live at
// capture time, and `revertToVersion` restores each row under the id recorded
// here rather than renumbering it - that identity is what a Cook Log
// Annotation pinned to a Step or Usage survives a revert by (see #51).
export type RecipeSnapshot = {
	// Base servings is what default linear scaling treats as 1x (see
	// CONTEXT.md), so a snapshot without it restores every Quantity against
	// whatever baseline happens to be live, and the numbers a cook reads after
	// a revert are not the ones that Version was authored with.
	//
	// Optional only because it genuinely is: every row written before #56 is
	// valid JSON with no `servings` key, and `revertToVersion` has to keep
	// working on one. `captureRecipeSnapshot` always writes it, so an absent
	// key means a pre-#56 row and nothing else.
	servings?: number;
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
	// Not a not-found case to hand back to a caller: every caller already holds
	// the Recipe in this transaction. Throwing keeps a missing row from writing
	// `servings: undefined`, which `JSON.stringify` drops - producing a
	// snapshot indistinguishable from a legitimate pre-#56 one.
	const recipeRow = tx
		.select({ servings: recipes.servings })
		.from(recipes)
		.where(eq(recipes.id, recipeId))
		.get();
	if (!recipeRow) throw new Error(`Cannot snapshot recipe ${recipeId}: no such row`);
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
		servings: recipeRow.servings,
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
// capturing base servings, the pool, every Composition and every Scaling
// Formula together in one snapshot (see CONTEXT.md).
//
// Every operation that changes something `RecipeSnapshot` covers has to call
// this itself, in the same transaction as the change, or the timeline gains a
// gap where the live state matches no Version. Nothing enforces that - adding
// a field to `RecipeSnapshot` means finding its writers by hand.
//
// It isn't a rule about mutations in general: what a Version restores is
// exactly what `RecipeSnapshot` holds, so a Cook, a Favorite, a Collection and
// a Recipe's Categories deliberately record none.
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
