import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.profile && url.pathname !== '/profile') {
		redirect(303, '/profile');
	}

	return { profile: locals.profile };
};
