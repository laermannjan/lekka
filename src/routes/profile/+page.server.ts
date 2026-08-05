import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BlankNameError,
	DuplicateNameError,
	createProfile,
	listProfiles,
	resolveProfile
} from '$lib/server/profiles';
import { getAvoidTagsForProfile, setProfileAvoidTags } from '$lib/server/dietary';
import { listTags } from '$lib/server/tags';
import { setDinersCookie, setProfileCookie } from '$lib/server/session';

export const load: PageServerLoad = ({ locals }) => {
	return {
		profiles: listProfiles(),
		tags: listTags(),
		avoidTags: locals.profile ? getAvoidTagsForProfile(locals.profile.id) : [],
		diners: locals.dinerProfiles
	};
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
	},

	// Replaces the acting Profile's standing avoid-Tag set (see CONTEXT.md's
	// Profile) - only that Profile can edit its own preference.
	updateAvoidTags: async ({ request, locals }) => {
		if (!locals.profile) return fail(401, { error: 'Pick a profile first.' });

		const data = await request.formData();
		const tagIds = data
			.getAll('tagIds')
			.map(Number)
			.filter((id) => Number.isInteger(id));

		setProfileAvoidTags(locals.profile.id, tagIds);
	},

	// Replaces the Diners selection (see CONTEXT.md's Diners) - independent
	// of the acting Profile, persists until explicitly changed again.
	updateDiners: async ({ request, cookies }) => {
		const data = await request.formData();
		const dinerIds = data
			.getAll('dinerIds')
			.map(Number)
			.filter((id) => Number.isInteger(id));

		setDinersCookie(cookies, dinerIds);
	}
};
