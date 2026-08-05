import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BlankNameError, createCollection, listCollections } from '$lib/server/collections';

export const load: PageServerLoad = () => {
	return { collections: listCollections() };
};

export const actions: Actions = {
	createCollection: async ({ request, locals }) => {
		if (!locals.profile) error(401, 'Pick a profile first.');

		const data = await request.formData();
		const name = String(data.get('name') ?? '');

		try {
			createCollection(locals.profile.id, name);
		} catch (err) {
			if (err instanceof BlankNameError) {
				return fail(400, { collectionError: 'Enter a name for the collection.' });
			}
			throw err;
		}
	}
};
