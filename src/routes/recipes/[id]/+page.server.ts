import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listIngredients } from '$lib/server/ingredients';
import {
	BlankInstructionError,
	BlankVariantNameError,
	CompositionNotFoundError,
	CompositionStepNotFoundError,
	IngredientNotFoundError,
	IngredientUsageNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	InvalidServingsError,
	RecipeNotFoundError,
	RecipeVersionNotFoundError,
	StepNotFoundError,
	addIngredientUsage,
	addStep,
	createVariant,
	getRecipe,
	getRecipeById,
	listRecipeVersions,
	overrideStep,
	removeStepFromComposition,
	revertToVersion,
	setUsageAlternative,
	updateServings,
	updateStepInstruction
} from '$lib/server/recipes';
import {
	InvalidScalingFormulaError,
	ScalingStepNotFoundError,
	ScalingUsageNotFoundError,
	removeDurationScalingFormula,
	removeQuantityScalingFormula,
	setDurationScalingFormula,
	setQuantityScalingFormula,
	type ScalingFormulaInput
} from '$lib/server/scaling';
import { parseRowId, parseRowIds } from '$lib/server/form';
import {
	DURATION_KINDS,
	CATEGORY_GROUPS,
	COOK_OUTCOMES,
	type ScalingDirection,
	type ScalingThresholdSide
} from '$lib/server/db/schema';
import {
	BlankNameError as BlankCategoryNameError,
	CategoryNotFoundError,
	DuplicateNameError as DuplicateCategoryNameError,
	InvalidCategoryGroupError,
	addCategoryToRecipe,
	createCategory,
	listCategories,
	listCategoriesForRecipe,
	removeCategoryFromRecipe
} from '$lib/server/categories';
import { isFavorite, listFavoriteProfiles, setFavorite } from '$lib/server/favorites';
import { listProfiles } from '$lib/server/profiles';
import {
	getAvoidTagIdsForProfiles,
	getFlaggedTagsByIngredientIds,
	getUsageIdsWithClearingAlternative
} from '$lib/server/dietary';
import {
	BlankNameError as BlankCollectionNameError,
	CollectionNotFoundError,
	addRecipeToCollection,
	createCollection,
	listCollections,
	listCollectionsForRecipe,
	removeRecipeFromCollection
} from '$lib/server/collections';
import {
	AnnotationTargetError,
	BlankCookedAtError,
	BlankNoteError,
	CompositionNotFoundError as CookCompositionNotFoundError,
	CookNotFoundError,
	IngredientUsageNotFoundError as CookIngredientUsageNotFoundError,
	InvalidOutcomeError,
	NoVersionHistoryError,
	ProfileNotFoundError,
	StepNotFoundError as CookStepNotFoundError,
	addCookLogAnnotation,
	listAnnotationsForCooks,
	listCooksForRecipe,
	logCook
} from '$lib/server/cooks';

export const load: PageServerLoad = ({ params, url, locals }) => {
	const id = parseRowId(params.id);
	if (id === undefined) error(404, 'Recipe not found');

	const compositionId = parseRowId(url.searchParams.get('composition'));
	// A serving count to scale *to*, not the Recipe's base servings - a garbage
	// one falls back to the Recipe's own baseline rather than resolving every
	// Quantity against NaN.
	const servings = Number(url.searchParams.get('servings') ?? '');
	const targetServings = Number.isInteger(servings) && servings >= 1 ? servings : undefined;

	const recipe = getRecipe(id, compositionId, targetServings);
	if (!recipe) error(404, 'Recipe not found');

	// Oldest first in storage; reverse so the page shows the most recent
	// Version first, numbered by its position on the shared timeline (see
	// CONTEXT.md's Version).
	const versions = listRecipeVersions(id)
		.map((version, index) => ({ ...version, number: index + 1 }))
		.reverse();

	// The dietary flag (see CONTEXT.md's Diners): every Tag any selected
	// Diner avoids, and which of those land on each Ingredient actually used
	// in this Composition - keyed by Ingredient id since the Tag lives on the
	// Ingredient, not the Usage. A Recipe carrying a flagged Usage stays
	// fully visible; only the offending Usage itself is marked.
	const avoidTagIds = getAvoidTagIdsForProfiles(locals.dinerProfiles.map((profile) => profile.id));
	const usages = recipe.composition.steps.flatMap((step) => step.usages);
	const flaggedTagsByIngredientId = Object.fromEntries(
		getFlaggedTagsByIngredientIds(
			usages.map((usage) => usage.ingredientId),
			avoidTagIds
		)
	);
	// A declared Alternative is only offered as a suggested swap when it
	// clears the flag itself - the flag stays on the Usage regardless.
	const usageIdsWithClearingAlternative = [
		...getUsageIdsWithClearingAlternative(usages, avoidTagIds)
	];

	const cooks = listCooksForRecipe(id);
	const annotationsByCookId = Object.fromEntries(
		listAnnotationsForCooks(cooks.map((cook) => cook.id))
	);

	return {
		recipe,
		ingredients: listIngredients(),
		durationKinds: DURATION_KINDS,
		categoryGroups: CATEGORY_GROUPS,
		categories: listCategories(),
		recipeCategories: listCategoriesForRecipe(id),
		isFavorite: locals.profile ? isFavorite(id, locals.profile.id) : false,
		favoritedBy: listFavoriteProfiles(id),
		collections: listCollections(),
		recipeCollections: listCollectionsForRecipe(id),
		versions,
		diners: locals.dinerProfiles,
		flaggedTagsByIngredientId,
		usageIdsWithClearingAlternative,
		cooks,
		annotationsByCookId,
		cookOutcomes: COOK_OUTCOMES,
		profiles: listProfiles(),
		actingProfile: locals.profile
	};
};

// The Recipe a route is scoped to. Route params are raw strings, so
// `/recipes/abc` reaches an action just as readily as `/recipes/7`, and
// `/recipes/999999` as readily as either. Both get the same 404 the page load
// gives - a well-formed id for a Recipe that isn't there would otherwise reach
// an insert and fail on the foreign key, and an action that creates something
// before attaching it (a Category, a Collection) would leave that behind as an
// orphan whose name then blocks the next legitimate attempt.
function requireRecipeId(params: { id: string }): number {
	const recipeId = parseRowId(params.id);
	if (recipeId === undefined || !getRecipeById(recipeId)) error(404, 'Recipe not found');
	return recipeId;
}

// Reads a guided-template Scaling Formula out of a submitted form, shared by
// both the Quantity and Duration authoring forms (see CONTEXT.md's v1
// catalog). Returns `null` when no template was selected, which the caller
// treats as "remove any formula". Field values are passed on as submitted -
// the domain layer owns which kinds, directions and threshold sides exist, and
// substituting a default for an unrecognised one here would silently store a
// rule the author never wrote.
function readScalingFormula(data: FormData): ScalingFormulaInput | null {
	const kind = String(data.get('scalingKind') ?? '');
	// The authoring form posts `none` for "no formula"; an absent field means
	// the same. Anything else is a template name and must be one the domain
	// layer knows.
	if (!kind || kind === 'none') return null;
	if (kind === 'fixed') return { kind: 'fixed' };
	if (kind === 'rate_vs_servings') {
		return { kind: 'rate_vs_servings', ratePercent: Number(data.get('ratePercent') ?? '') };
	}
	if (kind === 'vs_other_usage') {
		return {
			kind: 'vs_other_usage',
			otherUsageId: Number(data.get('otherUsageId') ?? ''),
			perUnitAmount: Number(data.get('perUnitAmount') ?? ''),
			direction: String(data.get('direction') ?? '') as ScalingDirection,
			thresholdSide: String(data.get('thresholdSide') ?? '') as ScalingThresholdSide
		};
	}
	return { kind } as ScalingFormulaInput;
}

function readDuration(data: FormData) {
	const durationKind = String(data.get('durationKind') ?? '');
	if (!durationKind) return undefined;
	const durationMinRaw = String(data.get('durationMin') ?? '');
	const durationMaxRaw = String(data.get('durationMax') ?? '');
	const durationUnit = String(data.get('durationUnit') ?? '');
	return {
		kind: durationKind,
		min: Number(durationMinRaw),
		max: durationMaxRaw ? Number(durationMaxRaw) : undefined,
		unit: durationUnit
	};
}

export const actions: Actions = {
	addStep: async ({ request }) => {
		const data = await request.formData();
		const compositionId = parseRowId(data.get('compositionId'));
		const instruction = String(data.get('instruction') ?? '');
		const duration = readDuration(data);

		if (compositionId === undefined) return fail(400, { stepError: 'Pick a composition.' });

		try {
			addStep(compositionId, { instruction, duration });
		} catch (err) {
			if (err instanceof BlankInstructionError) {
				return fail(400, { stepError: 'Enter an instruction.' });
			}
			if (err instanceof InvalidDurationError) {
				return fail(400, { stepError: err.message });
			}
			if (err instanceof CompositionNotFoundError) {
				return fail(400, { stepError: 'Pick a composition.' });
			}
			throw err;
		}
	},

	updateStepInstruction: async ({ request }) => {
		const data = await request.formData();
		const stepId = parseRowId(data.get('stepId'));
		const instruction = String(data.get('instruction') ?? '');

		if (stepId === undefined) return fail(400, { stepError: 'That step no longer exists.' });

		try {
			updateStepInstruction(stepId, instruction);
		} catch (err) {
			if (err instanceof BlankInstructionError) {
				return fail(400, { stepError: 'Enter an instruction.' });
			}
			// A Step really can go away underneath an open page: removing it from
			// the last Composition referencing it drops it from the pool too.
			if (err instanceof StepNotFoundError) {
				return fail(400, { stepError: 'That step no longer exists.' });
			}
			throw err;
		}
	},

	overrideStep: async ({ request }) => {
		const data = await request.formData();
		const compositionStepId = parseRowId(data.get('compositionStepId'));
		const instruction = String(data.get('instruction') ?? '');
		const duration = readDuration(data);

		if (compositionStepId === undefined) {
			return fail(400, { stepError: 'That step no longer exists in this composition.' });
		}

		try {
			overrideStep(compositionStepId, { instruction, duration });
		} catch (err) {
			if (err instanceof BlankInstructionError) {
				return fail(400, { stepError: 'Enter an instruction.' });
			}
			if (err instanceof InvalidDurationError) {
				return fail(400, { stepError: err.message });
			}
			if (err instanceof CompositionStepNotFoundError) {
				return fail(400, { stepError: 'That step no longer exists in this composition.' });
			}
			throw err;
		}
	},

	removeStep: async ({ request }) => {
		const data = await request.formData();
		const compositionStepId = parseRowId(data.get('compositionStepId'));
		const alsoFromCompositionIds = parseRowIds(data.getAll('alsoFromCompositionIds'));

		if (compositionStepId === undefined) {
			return fail(400, { stepError: 'That step no longer exists in this composition.' });
		}
		if (alsoFromCompositionIds === undefined) {
			return fail(400, { stepError: 'Pick which other compositions to remove this step from.' });
		}

		try {
			removeStepFromComposition(compositionStepId, alsoFromCompositionIds);
		} catch (err) {
			if (err instanceof CompositionStepNotFoundError) {
				return fail(400, { stepError: 'That step no longer exists in this composition.' });
			}
			throw err;
		}
	},

	addIngredientUsage: async ({ request }) => {
		const data = await request.formData();
		const stepId = parseRowId(data.get('stepId'));
		const ingredientId = parseRowId(data.get('ingredientId'));
		const quantityValue = Number(data.get('quantityValue'));
		const quantityUnit = String(data.get('quantityUnit') ?? '');
		const prepAttribute = String(data.get('prepAttribute') ?? '');
		const alternativeIngredientIdRaw = String(data.get('alternativeIngredientId') ?? '');
		const alternativeIngredientId = alternativeIngredientIdRaw
			? parseRowId(alternativeIngredientIdRaw)
			: null;
		const note = String(data.get('note') ?? '');

		if (stepId === undefined) return fail(400, { usageError: 'That step no longer exists.' });
		if (ingredientId === undefined) return fail(400, { usageError: 'Pick an ingredient.' });
		if (alternativeIngredientId === undefined) {
			return fail(400, { usageError: 'Pick an alternative ingredient.' });
		}

		try {
			addIngredientUsage(stepId, {
				ingredientId,
				quantityValue,
				quantityUnit,
				prepAttribute,
				alternativeIngredientId,
				note
			});
		} catch (err) {
			if (err instanceof InvalidQuantityError) {
				return fail(400, { usageError: 'Enter a valid, non-negative quantity.' });
			}
			if (err instanceof IngredientNotFoundError) {
				return fail(400, { usageError: 'Pick an ingredient.' });
			}
			if (err instanceof StepNotFoundError) {
				return fail(400, { usageError: 'That step no longer exists.' });
			}
			throw err;
		}
	},

	setUsageAlternative: async ({ request }) => {
		const data = await request.formData();
		const usageId = parseRowId(data.get('usageId'));
		const alternativeIngredientIdRaw = String(data.get('alternativeIngredientId') ?? '');
		const alternativeIngredientId = alternativeIngredientIdRaw
			? parseRowId(alternativeIngredientIdRaw)
			: null;

		if (usageId === undefined) {
			return fail(400, { usageError: 'That ingredient usage no longer exists.' });
		}
		if (alternativeIngredientId === undefined) {
			return fail(400, { usageError: 'Pick an alternative ingredient.' });
		}

		try {
			setUsageAlternative(usageId, alternativeIngredientId);
		} catch (err) {
			if (err instanceof IngredientNotFoundError) {
				return fail(400, { usageError: 'Pick an alternative ingredient.' });
			}
			if (err instanceof IngredientUsageNotFoundError) {
				return fail(400, { usageError: 'That ingredient usage no longer exists.' });
			}
			throw err;
		}
	},

	createVariant: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const seedFromCompositionId = parseRowId(data.get('seedFromCompositionId'));

		if (seedFromCompositionId === undefined) {
			return fail(400, { variantError: 'Pick a composition to seed from.' });
		}

		try {
			createVariant(recipeId, name, seedFromCompositionId);
		} catch (err) {
			if (err instanceof BlankVariantNameError) {
				return fail(400, { variantError: 'Enter a name for the variant.' });
			}
			if (err instanceof CompositionNotFoundError) {
				return fail(400, { variantError: 'Pick a composition to seed from.' });
			}
			throw err;
		}
	},

	updateServings: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const servings = Number(data.get('servings'));

		try {
			updateServings(recipeId, servings);
		} catch (err) {
			if (err instanceof InvalidServingsError) {
				return fail(400, { servingsError: err.message });
			}
			if (err instanceof RecipeNotFoundError) {
				error(404, 'Recipe not found');
			}
			throw err;
		}
	},

	addCategory: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const categoryId = parseRowId(data.get('categoryId'));

		if (categoryId === undefined) return fail(400, { categoryError: 'Pick a category.' });

		try {
			addCategoryToRecipe(recipeId, categoryId);
		} catch (err) {
			if (err instanceof CategoryNotFoundError) {
				return fail(400, { categoryError: 'Pick a category.' });
			}
			throw err;
		}
	},

	setUsageScalingFormula: async ({ request }) => {
		const data = await request.formData();
		const ingredientUsageId = parseRowId(data.get('ingredientUsageId'));
		const formula = readScalingFormula(data);

		if (ingredientUsageId === undefined) {
			return fail(400, { scalingError: 'That ingredient usage no longer exists.' });
		}

		try {
			if (formula) {
				setQuantityScalingFormula(ingredientUsageId, formula);
			} else {
				removeQuantityScalingFormula(ingredientUsageId);
			}
		} catch (err) {
			if (err instanceof InvalidScalingFormulaError) {
				return fail(400, { scalingError: err.message });
			}
			if (err instanceof ScalingUsageNotFoundError) {
				return fail(400, { scalingError: 'That ingredient usage no longer exists.' });
			}
			throw err;
		}
	},

	removeCategory: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const categoryId = parseRowId(data.get('categoryId'));

		if (categoryId === undefined) {
			return fail(400, { categoryError: 'That category no longer exists.' });
		}

		removeCategoryFromRecipe(recipeId, categoryId);
	},

	createCategory: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const categoryGroup = String(data.get('categoryGroup') ?? '');

		try {
			const category = createCategory(name, categoryGroup);
			addCategoryToRecipe(recipeId, category.id);
		} catch (err) {
			if (err instanceof BlankCategoryNameError) {
				return fail(400, { categoryError: 'Enter a category name.' });
			}
			if (err instanceof DuplicateCategoryNameError) {
				return fail(400, { categoryError: 'That category already exists.' });
			}
			if (err instanceof InvalidCategoryGroupError) {
				return fail(400, { categoryError: 'Pick a category group.' });
			}
			throw err;
		}
	},

	setDurationScalingFormula: async ({ request }) => {
		const data = await request.formData();
		const stepId = parseRowId(data.get('stepId'));
		const formula = readScalingFormula(data);

		if (stepId === undefined) return fail(400, { scalingError: 'That step no longer exists.' });

		try {
			if (formula) {
				setDurationScalingFormula(stepId, formula);
			} else {
				removeDurationScalingFormula(stepId);
			}
		} catch (err) {
			if (err instanceof InvalidScalingFormulaError) {
				return fail(400, { scalingError: err.message });
			}
			if (err instanceof ScalingStepNotFoundError) {
				return fail(400, { scalingError: 'That step no longer exists.' });
			}
			if (err instanceof ScalingUsageNotFoundError) {
				return fail(400, { scalingError: 'Pick a usage to reference.' });
			}
			throw err;
		}
	},

	toggleFavorite: async ({ request, params, locals }) => {
		if (!locals.profile) return fail(401, { favoriteError: 'Pick a profile first.' });

		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const isFavoriteNow = data.get('isFavorite') === 'true';

		setFavorite(recipeId, locals.profile.id, !isFavoriteNow);
	},

	addToCollection: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const collectionId = parseRowId(data.get('collectionId'));

		if (collectionId === undefined) return fail(400, { collectionError: 'Pick a collection.' });

		try {
			addRecipeToCollection(collectionId, recipeId);
		} catch (err) {
			if (err instanceof CollectionNotFoundError) {
				return fail(400, { collectionError: 'Pick a collection.' });
			}
			throw err;
		}
	},

	removeFromCollection: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const collectionId = parseRowId(data.get('collectionId'));

		if (collectionId === undefined) {
			return fail(400, { collectionError: 'That collection no longer exists.' });
		}

		removeRecipeFromCollection(collectionId, recipeId);
	},

	createCollection: async ({ request, params, locals }) => {
		if (!locals.profile) return fail(401, { collectionError: 'Pick a profile first.' });

		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const name = String(data.get('name') ?? '');

		try {
			const collection = createCollection(locals.profile.id, name);
			addRecipeToCollection(collection.id, recipeId);
		} catch (err) {
			if (err instanceof BlankCollectionNameError) {
				return fail(400, { collectionError: 'Enter a name for the collection.' });
			}
			throw err;
		}
	},

	logCook: async ({ request, params, locals }) => {
		if (!locals.profile) return fail(401, { cookError: 'Pick a profile first.' });

		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const compositionId = parseRowId(data.get('compositionId'));
		const cookedAt = String(data.get('cookedAt') ?? '');
		const outcome = String(data.get('outcome') ?? '');
		const summary = String(data.get('summary') ?? '');
		const dinerProfileIds = parseRowIds(data.getAll('dinerProfileIds'));

		if (compositionId === undefined) return fail(400, { cookError: 'Pick a composition.' });
		if (dinerProfileIds === undefined) return fail(400, { cookError: 'Pick the diners again.' });

		try {
			logCook(recipeId, {
				compositionId,
				actingProfileId: locals.profile.id,
				dinerProfileIds,
				cookedAt,
				outcome,
				summary
			});
		} catch (err) {
			if (err instanceof BlankCookedAtError) {
				return fail(400, { cookError: 'Pick a date.' });
			}
			if (err instanceof InvalidOutcomeError) {
				return fail(400, { cookError: 'Pick an outcome.' });
			}
			if (err instanceof CookCompositionNotFoundError) {
				return fail(400, { cookError: 'Pick a composition.' });
			}
			if (err instanceof NoVersionHistoryError) {
				return fail(400, { cookError: 'This recipe has no version history yet.' });
			}
			if (err instanceof ProfileNotFoundError) {
				return fail(400, { cookError: 'One of those profiles no longer exists.' });
			}
			throw err;
		}
	},

	addCookAnnotation: async ({ request }) => {
		const data = await request.formData();
		const cookId = parseRowId(data.get('cookId'));
		const stepIdRaw = String(data.get('stepId') ?? '');
		const ingredientUsageIdRaw = String(data.get('ingredientUsageId') ?? '');
		const stepId = stepIdRaw ? parseRowId(stepIdRaw) : undefined;
		const ingredientUsageId = ingredientUsageIdRaw ? parseRowId(ingredientUsageIdRaw) : undefined;
		const note = String(data.get('note') ?? '');

		if (cookId === undefined) {
			return fail(400, { annotationError: 'That cook no longer exists.' });
		}
		// An unparseable target would otherwise read as "no target given", so a
		// garbage step id would be reported as an annotation pinned to nothing.
		if (stepIdRaw && stepId === undefined) {
			return fail(400, { annotationError: 'That step no longer exists.' });
		}
		if (ingredientUsageIdRaw && ingredientUsageId === undefined) {
			return fail(400, { annotationError: 'That ingredient usage no longer exists.' });
		}

		try {
			addCookLogAnnotation(cookId, { stepId, ingredientUsageId, note });
		} catch (err) {
			if (err instanceof AnnotationTargetError) {
				return fail(400, { annotationError: err.message });
			}
			if (err instanceof BlankNoteError) {
				return fail(400, { annotationError: 'Enter a note.' });
			}
			if (err instanceof CookNotFoundError) {
				return fail(400, { annotationError: 'That cook no longer exists.' });
			}
			if (err instanceof CookStepNotFoundError) {
				return fail(400, { annotationError: 'That step no longer exists.' });
			}
			if (err instanceof CookIngredientUsageNotFoundError) {
				return fail(400, { annotationError: 'That ingredient usage no longer exists.' });
			}
			throw err;
		}
	},

	revertToVersion: async ({ request, params }) => {
		const recipeId = requireRecipeId(params);
		const data = await request.formData();
		const versionId = parseRowId(data.get('versionId'));

		if (versionId === undefined) {
			return fail(400, { versionError: 'That version no longer exists.' });
		}

		try {
			revertToVersion(recipeId, versionId);
		} catch (err) {
			if (err instanceof RecipeVersionNotFoundError) {
				return fail(400, { versionError: 'That version no longer exists.' });
			}
			throw err;
		}
	}
};
