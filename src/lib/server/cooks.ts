import { desc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	compositions,
	cookDiners,
	cookLogAnnotations,
	cooks,
	ingredientUsages,
	profiles,
	recipeVersions,
	steps,
	COOK_OUTCOMES,
	type Cook,
	type CookLogAnnotation,
	type CookOutcome,
	type Profile
} from './db/schema';

export class CompositionNotFoundError extends Error {}
export class CookNotFoundError extends Error {}
export class StepNotFoundError extends Error {}
export class IngredientUsageNotFoundError extends Error {}
export class AnnotationTargetError extends Error {}
export class InvalidOutcomeError extends Error {}
export class BlankCookedAtError extends Error {}
export class NoVersionHistoryError extends Error {}

const MAX_SUMMARY_LENGTH = 2000;
const MAX_NOTE_LENGTH = 1000;

export type LogCookInput = {
	compositionId: number;
	actingProfileId: number;
	dinerProfileIds: number[];
	cookedAt: string;
	outcome: string;
	summary?: string;
};

// Logs a Cook - one occasion of making a Recipe (see CONTEXT.md's Cook).
// Records the Recipe's *current* Version rather than creating a new one:
// this never calls recordVersion, so logging a Cook can never accidentally
// mutate the Recipe. `dinerProfileIds` is stored as a standalone snapshot,
// independent of whatever the live Diners cookie selection happens to be by
// the time anyone looks back at this Cook.
export function logCook(recipeId: number, input: LogCookInput): Cook {
	const composition = db
		.select()
		.from(compositions)
		.where(eq(compositions.id, input.compositionId))
		.get();
	if (!composition || composition.recipeId !== recipeId) {
		throw new CompositionNotFoundError(
			`No composition ${input.compositionId} on recipe ${recipeId}`
		);
	}

	if (!COOK_OUTCOMES.includes(input.outcome as CookOutcome)) {
		throw new InvalidOutcomeError(`Unknown outcome "${input.outcome}"`);
	}

	const cookedAt = input.cookedAt.trim();
	if (!cookedAt) throw new BlankCookedAtError('Cooked date must not be blank');

	const currentVersion = db
		.select()
		.from(recipeVersions)
		.where(eq(recipeVersions.recipeId, recipeId))
		.orderBy(desc(recipeVersions.id))
		.get();
	if (!currentVersion) {
		throw new NoVersionHistoryError(`Recipe ${recipeId} has no version history yet`);
	}

	const summary = input.summary?.trim().slice(0, MAX_SUMMARY_LENGTH) || null;
	const dinerIds = [...new Set(input.dinerProfileIds)];

	return db.transaction((tx) => {
		const cook = tx
			.insert(cooks)
			.values({
				recipeId,
				compositionId: input.compositionId,
				recipeVersionId: currentVersion.id,
				actingProfileId: input.actingProfileId,
				cookedAt,
				outcome: input.outcome as CookOutcome,
				summary
			})
			.returning()
			.get();

		if (dinerIds.length > 0) {
			tx.insert(cookDiners)
				.values(dinerIds.map((profileId) => ({ cookId: cook.id, profileId })))
				.run();
		}

		return cook;
	});
}

export type CookWithDiners = Cook & { diners: Profile[]; actingProfile: Profile | undefined };

// Every Cook logged for a Recipe, most recent first - household-wide, so
// this takes no acting/viewing Profile to filter by (see CONTEXT.md's Cook:
// "not personal to the acting Profile").
export function listCooksForRecipe(recipeId: number): CookWithDiners[] {
	const cookRows = db
		.select()
		.from(cooks)
		.where(eq(cooks.recipeId, recipeId))
		.orderBy(desc(cooks.cookedAt), desc(cooks.id))
		.all();
	if (cookRows.length === 0) return [];

	const cookIds = cookRows.map((c) => c.id);
	const dinersByCookId = getDinersByCookIds(cookIds);
	const actingProfileRows = db
		.select()
		.from(profiles)
		.where(inArray(profiles.id, [...new Set(cookRows.map((c) => c.actingProfileId))]))
		.all();
	const actingProfileById = new Map(actingProfileRows.map((profile) => [profile.id, profile]));

	return cookRows.map((cook) => ({
		...cook,
		diners: dinersByCookId.get(cook.id) ?? [],
		actingProfile: actingProfileById.get(cook.actingProfileId)
	}));
}

export function getCookById(id: number): Cook | undefined {
	return db.select().from(cooks).where(eq(cooks.id, id)).get();
}

function getDinersByCookIds(cookIds: number[]): Map<number, Profile[]> {
	const result = new Map<number, Profile[]>();
	if (cookIds.length === 0) return result;

	const rows = db
		.select({ cookId: cookDiners.cookId, profile: profiles })
		.from(cookDiners)
		.innerJoin(profiles, eq(profiles.id, cookDiners.profileId))
		.where(inArray(cookDiners.cookId, cookIds))
		.all();
	for (const row of rows) {
		const list = result.get(row.cookId) ?? [];
		list.push(row.profile);
		result.set(row.cookId, list);
	}
	return result;
}

export type AddAnnotationInput = { stepId?: number; ingredientUsageId?: number; note: string };

// Adds a Cook Log Annotation pinned to exactly one Step or Ingredient Usage
// within a Cook (see CONTEXT.md's Cook Log Annotation) - the alternative to
// dumping free text at the end. Only one of `stepId`/`ingredientUsageId` may
// be set, same exactly-one-target convention as ScalingFormula.
export function addCookLogAnnotation(cookId: number, input: AddAnnotationInput): CookLogAnnotation {
	const cook = getCookById(cookId);
	if (!cook) throw new CookNotFoundError(`No cook ${cookId}`);

	const hasStep = input.stepId != null;
	const hasUsage = input.ingredientUsageId != null;
	if (hasStep === hasUsage) {
		throw new AnnotationTargetError(
			'A Cook Log Annotation must be pinned to exactly one Step or Ingredient Usage'
		);
	}

	if (hasStep) {
		const step = db.select().from(steps).where(eq(steps.id, input.stepId!)).get();
		if (!step) throw new StepNotFoundError(`No step ${input.stepId}`);
	} else {
		const usage = db
			.select()
			.from(ingredientUsages)
			.where(eq(ingredientUsages.id, input.ingredientUsageId!))
			.get();
		if (!usage)
			throw new IngredientUsageNotFoundError(`No ingredient usage ${input.ingredientUsageId}`);
	}

	const note = input.note.trim().slice(0, MAX_NOTE_LENGTH);
	if (!note) throw new AnnotationTargetError('Annotation note must not be blank');

	return db
		.insert(cookLogAnnotations)
		.values({
			cookId,
			stepId: hasStep ? input.stepId! : null,
			ingredientUsageId: hasUsage ? input.ingredientUsageId! : null,
			note
		})
		.returning()
		.get();
}

export function listAnnotationsForCook(cookId: number): CookLogAnnotation[] {
	return db
		.select()
		.from(cookLogAnnotations)
		.where(eq(cookLogAnnotations.cookId, cookId))
		.orderBy(cookLogAnnotations.id)
		.all();
}

// Every Cook Log Annotation across many Cooks at once, keyed by Cook id -
// for the Cook history list, which needs each Cook's annotations without one
// query per row.
export function listAnnotationsForCooks(cookIds: number[]): Map<number, CookLogAnnotation[]> {
	const result = new Map<number, CookLogAnnotation[]>();
	if (cookIds.length === 0) return result;

	const rows = db
		.select()
		.from(cookLogAnnotations)
		.where(inArray(cookLogAnnotations.cookId, cookIds))
		.orderBy(cookLogAnnotations.id)
		.all();
	for (const row of rows) {
		const list = result.get(row.cookId) ?? [];
		list.push(row);
		result.set(row.cookId, list);
	}
	return result;
}
