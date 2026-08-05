import type { Handle, ServerInit } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db';
import { resolveDinerProfiles, resolveProfile } from '$lib/server/profiles';
import {
	DINERS_COOKIE,
	PROFILE_COOKIE,
	clearProfileCookie,
	parseDinerIds
} from '$lib/server/session';
import { initScheduler } from '$lib/server/push/scheduler';

export const init: ServerInit = () => {
	runMigrations();
	// Re-arms every still-pending Step timer push from the DB so a server
	// restart never silently drops a scheduled fire (see
	// src/lib/server/push/scheduler.ts).
	initScheduler();
};

export const handle: Handle = async ({ event, resolve }) => {
	const raw = event.cookies.get(PROFILE_COOKIE);
	const profile = resolveProfile(raw);

	if (raw && !profile) {
		clearProfileCookie(event.cookies);
	}

	event.locals.profile = profile;

	// Diners defaults to just the acting Profile until explicitly changed
	// (see CONTEXT.md's Diners) - resolved once here so every page can flag
	// against it without re-deriving this default itself. A cookie that's
	// present (even set to an empty selection) always wins over the default.
	const dinersRaw = event.cookies.get(DINERS_COOKIE);
	const dinerIds = dinersRaw !== undefined ? parseDinerIds(dinersRaw) : profile ? [profile.id] : [];
	event.locals.dinerProfiles = resolveDinerProfiles(dinerIds);

	return resolve(event);
};
