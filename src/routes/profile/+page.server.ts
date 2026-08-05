import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankNameError,
	DuplicateNameError,
	createProfile,
	listProfiles,
	resolveProfile
} from '$lib/server/profiles';
import { setProfileCookie } from '$lib/server/session';

export const load: PageServerLoad = () => {
	return { profiles: listProfiles() };
};

export const actions: Actions = {
	select: async ({ request, cookies }) => {
		const data = await request.formData();
		const profile = resolveProfile(data.get('profileId'));
		if (!profile) {
			return fail(400, { error: 'Pick a profile.' });
		}

		setProfileCookie(cookies, profile.id);
		redirect(303, '/');
	},

	create: async ({ request, cookies }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');

		let profile;
		try {
			profile = createProfile(name);
		} catch (error) {
			if (error instanceof BlankNameError) {
				return fail(400, { error: 'Enter a name.' });
			}
			if (error instanceof DuplicateNameError) {
				return fail(400, { error: 'That name is already taken.' });
			}
			throw error;
		}

		setProfileCookie(cookies, profile.id);
		redirect(303, '/');
	}
};
