import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankBaseTermError,
	createIngredient,
	listBaseTerms,
	listIngredients
} from '$lib/server/ingredients';
import {
	BlankNameError,
	DuplicateNameError,
	InvalidTagGroupError,
	createTag,
	listTags
} from '$lib/server/tags';

export const load: PageServerLoad = () => {
	return {
		ingredients: listIngredients(),
		tags: listTags(),
		baseTerms: listBaseTerms()
	};
};

export const actions: Actions = {
	createIngredient: async ({ request }) => {
		const data = await request.formData();
		const baseTerm = String(data.get('baseTerm') ?? '');
		const descriptors = String(data.get('descriptors') ?? '');
		const roundToWholeUnit = data.get('roundToWholeUnit') === 'on';
		const tagIds = data.getAll('tagIds').map(String);

		try {
			createIngredient({ baseTerm, descriptors, roundToWholeUnit, tagIds: tagIds.map(Number) });
		} catch (error) {
			if (error instanceof BlankBaseTermError) {
				return fail(400, { ingredientError: 'Enter a base term.' });
			}
			throw error;
		}
	},

	createTag: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const tagGroup = String(data.get('tagGroup') ?? '');

		try {
			createTag(name, tagGroup);
		} catch (error) {
			if (error instanceof BlankNameError) {
				return fail(400, { tagError: 'Enter a tag name.' });
			}
			if (error instanceof DuplicateNameError) {
				return fail(400, { tagError: 'That tag already exists.' });
			}
			if (error instanceof InvalidTagGroupError) {
				return fail(400, { tagError: 'Pick a tag group.' });
			}
			throw error;
		}
	}
};
