import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listIngredients } from '$lib/server/ingredients';
import {
	BlankInstructionError,
	IngredientNotFoundError,
	InvalidDurationError,
	InvalidQuantityError,
	addIngredientUsage,
	addStep,
	getRecipe,
	updateStepInstruction
} from '$lib/server/recipes';
import { DURATION_KINDS } from '$lib/server/db/schema';

export const load: PageServerLoad = ({ params }) => {
	const id = Number(params.id);
	const recipe = getRecipe(id);
	if (!recipe) error(404, 'Recipe not found');

	return { recipe, ingredients: listIngredients(), durationKinds: DURATION_KINDS };
};

export const actions: Actions = {
	addStep: async ({ request, params }) => {
		const recipeId = Number(params.id);
		const data = await request.formData();
		const instruction = String(data.get('instruction') ?? '');
		const durationKind = String(data.get('durationKind') ?? '');
		const durationMinRaw = String(data.get('durationMin') ?? '');
		const durationMaxRaw = String(data.get('durationMax') ?? '');
		const durationUnit = String(data.get('durationUnit') ?? '');

		const duration = durationKind
			? {
					kind: durationKind,
					min: Number(durationMinRaw),
					max: durationMaxRaw ? Number(durationMaxRaw) : undefined,
					unit: durationUnit
				}
			: undefined;

		try {
			addStep(recipeId, { instruction, duration });
		} catch (err) {
			if (err instanceof BlankInstructionError) {
				return fail(400, { stepError: 'Enter an instruction.' });
			}
			if (err instanceof InvalidDurationError) {
				return fail(400, { stepError: err.message });
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
	}
};
