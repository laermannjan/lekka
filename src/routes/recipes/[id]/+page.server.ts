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
	addIngredientUsage,
	addStep,
	createVariant,
	getRecipe,
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
import {
	DURATION_KINDS,
	CATEGORY_GROUPS,
	SCALING_DIRECTIONS,
	SCALING_THRESHOLD_SIDES,
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
import { isFavorite, setFavorite } from '$lib/server/favorites';
import {
	BlankNameError as BlankCollectionNameError,
	CollectionNotFoundError,
	addRecipeToCollection,
	createCollection,
	listCollections,
	listCollectionsForRecipe,
	removeRecipeFromCollection
} from '$lib/server/collections';

export const load: PageServerLoad = ({ params, url, locals }) => {
	const id = Number(params.id);
	const compositionIdParam = url.searchParams.get('composition');
	const compositionId = compositionIdParam ? Number(compositionIdParam) : undefined;
	const servingsParam = url.searchParams.get('servings');
	const targetServings = servingsParam ? Number(servingsParam) : undefined;

	const recipe = getRecipe(id, compositionId, targetServings);
	if (!recipe) error(404, 'Recipe not found');

	// Oldest first in storage; reverse so the page shows the most recent
	// Version first, numbered by its position on the shared timeline (see
	// CONTEXT.md's Version).
	const versions = listRecipeVersions(id)
		.map((version, index) => ({ ...version, number: index + 1 }))
		.reverse();

	return {
		recipe,
		ingredients: listIngredients(),
		durationKinds: DURATION_KINDS,
		categoryGroups: CATEGORY_GROUPS,
		categories: listCategories(),
		recipeCategories: listCategoriesForRecipe(id),
		isFavorite: locals.profile ? isFavorite(id, locals.profile.id) : false,
		collections: listCollections(),
		recipeCollections: listCollectionsForRecipe(id),
		versions
	};
};

// Reads a guided-template Scaling Formula out of a submitted form, shared by
// both the Quantity and Duration authoring forms (see CONTEXT.md's v1
// catalog). Returns `null` when no template was selected, which the caller
// treats as "remove any formula".
function readScalingFormula(data: FormData): ScalingFormulaInput | null {
	const kind = String(data.get('scalingKind') ?? '');
	if (kind === 'fixed') return { kind: 'fixed' };
	if (kind === 'rate_vs_servings') {
		return { kind: 'rate_vs_servings', ratePercent: Number(data.get('ratePercent') ?? '') };
	}
	if (kind === 'vs_other_usage') {
		const direction = String(data.get('direction') ?? '') as ScalingDirection;
		const thresholdSide = String(data.get('thresholdSide') ?? '') as ScalingThresholdSide;
		return {
			kind: 'vs_other_usage',
			otherUsageId: Number(data.get('otherUsageId')),
			perUnitAmount: Number(data.get('perUnitAmount') ?? ''),
			direction: SCALING_DIRECTIONS.includes(direction) ? direction : 'increase',
			thresholdSide: SCALING_THRESHOLD_SIDES.includes(thresholdSide) ? thresholdSide : 'short'
		};
	}
	return null;
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
		const compositionId = Number(data.get('compositionId'));
		const instruction = String(data.get('instruction') ?? '');
		const duration = readDuration(data);

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
		const stepId = Number(data.get('stepId'));
		const instruction = String(data.get('instruction') ?? '');

		try {
			updateStepInstruction(stepId, instruction);
		} catch (err) {
			if (err instanceof BlankInstructionError) {
				return fail(400, { stepError: 'Enter an instruction.' });
			}
			throw err;
		}
	},

	overrideStep: async ({ request }) => {
		const data = await request.formData();
		const compositionStepId = Number(data.get('compositionStepId'));
		const instruction = String(data.get('instruction') ?? '');
		const duration = readDuration(data);

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
		const compositionStepId = Number(data.get('compositionStepId'));
		const alsoFromCompositionIds = data
			.getAll('alsoFromCompositionIds')
			.map((value) => Number(value));

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
		const stepId = Number(data.get('stepId'));
		const ingredientId = Number(data.get('ingredientId'));
		const quantityValue = Number(data.get('quantityValue'));
		const quantityUnit = String(data.get('quantityUnit') ?? '');
		const prepAttribute = String(data.get('prepAttribute') ?? '');
		const alternativeIngredientIdRaw = String(data.get('alternativeIngredientId') ?? '');
		const alternativeIngredientId = alternativeIngredientIdRaw
			? Number(alternativeIngredientIdRaw)
			: null;
		const note = String(data.get('note') ?? '');

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
			throw err;
		}
	},

	setUsageAlternative: async ({ request }) => {
		const data = await request.formData();
		const usageId = Number(data.get('usageId'));
		const alternativeIngredientIdRaw = String(data.get('alternativeIngredientId') ?? '');
		const alternativeIngredientId = alternativeIngredientIdRaw
			? Number(alternativeIngredientIdRaw)
			: null;

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
		const recipeId = Number(params.id);
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const seedFromCompositionId = Number(data.get('seedFromCompositionId'));

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
		const recipeId = Number(params.id);
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
		const recipeId = Number(params.id);
		const data = await request.formData();
		const categoryId = Number(data.get('categoryId'));

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
		const ingredientUsageId = Number(data.get('ingredientUsageId'));
		const formula = readScalingFormula(data);

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
		const recipeId = Number(params.id);
		const data = await request.formData();
		const categoryId = Number(data.get('categoryId'));

		removeCategoryFromRecipe(recipeId, categoryId);
	},

	createCategory: async ({ request, params }) => {
		const recipeId = Number(params.id);
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

	removeUsageScalingFormula: async ({ request }) => {
		const data = await request.formData();
		const ingredientUsageId = Number(data.get('ingredientUsageId'));
		removeQuantityScalingFormula(ingredientUsageId);
	},

	setDurationScalingFormula: async ({ request }) => {
		const data = await request.formData();
		const stepId = Number(data.get('stepId'));
		const formula = readScalingFormula(data);

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

		const recipeId = Number(params.id);
		const data = await request.formData();
		const isFavoriteNow = data.get('isFavorite') === 'true';

		setFavorite(recipeId, locals.profile.id, !isFavoriteNow);
	},

	addToCollection: async ({ request, params }) => {
		const recipeId = Number(params.id);
		const data = await request.formData();
		const collectionId = Number(data.get('collectionId'));

		try {
			addRecipeToCollection(collectionId, recipeId);
		} catch (err) {
			if (err instanceof CollectionNotFoundError) {
				return fail(400, { collectionError: 'Pick a collection.' });
			}
			throw err;
		}
	},

	removeDurationScalingFormula: async ({ request }) => {
		const data = await request.formData();
		const stepId = Number(data.get('stepId'));
		removeDurationScalingFormula(stepId);
	},

	removeFromCollection: async ({ request, params }) => {
		const recipeId = Number(params.id);
		const data = await request.formData();
		const collectionId = Number(data.get('collectionId'));

		removeRecipeFromCollection(collectionId, recipeId);
	},

	createCollection: async ({ request, params, locals }) => {
		if (!locals.profile) return fail(401, { collectionError: 'Pick a profile first.' });

		const recipeId = Number(params.id);
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

	revertToVersion: async ({ request, params }) => {
		const recipeId = Number(params.id);
		const data = await request.formData();
		const versionId = Number(data.get('versionId'));

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
