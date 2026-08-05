import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listIngredients } from '$lib/server/ingredients';
import {
	BlankInstructionError,
	BlankVariantNameError,
	CompositionNotFoundError,
	CompositionStepNotFoundError,
	IngredientNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	RecipeVersionNotFoundError,
	addIngredientUsage,
	addStep,
	createVariant,
	getRecipe,
	listRecipeVersions,
	overrideStep,
	removeStepFromComposition,
	revertToVersion,
	updateStepInstruction
} from '$lib/server/recipes';
import { DURATION_KINDS } from '$lib/server/db/schema';

export const load: PageServerLoad = ({ params, url }) => {
	const id = Number(params.id);
	const compositionIdParam = url.searchParams.get('composition');
	const compositionId = compositionIdParam ? Number(compositionIdParam) : undefined;

	const recipe = getRecipe(id, compositionId);
	if (!recipe) error(404, 'Recipe not found');

	// Oldest first in storage; reverse so the page shows the most recent
	// Version first, numbered by its position on the shared timeline (see
	// CONTEXT.md's Version).
	const versions = listRecipeVersions(id)
		.map((version, index) => ({ ...version, number: index + 1 }))
		.reverse();

	return { recipe, ingredients: listIngredients(), durationKinds: DURATION_KINDS, versions };
};

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
		const note = String(data.get('note') ?? '');

		try {
			addIngredientUsage(stepId, {
				ingredientId,
				quantityValue,
				quantityUnit,
				prepAttribute,
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
