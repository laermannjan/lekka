import type { Handle, ServerInit } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db';
import { resolveProfile } from '$lib/server/profiles';
import { PROFILE_COOKIE, clearProfileCookie } from '$lib/server/session';

export const init: ServerInit = () => {
	runMigrations();
};

export const handle: Handle = async ({ event, resolve }) => {
	const raw = event.cookies.get(PROFILE_COOKIE);
	const profile = resolveProfile(raw);

	if (raw && !profile) {
		clearProfileCookie(event.cookies);
	}

	event.locals.profile = profile;

	return resolve(event);
};
