import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const PROFILE_COOKIE = 'profile_id';

// Persistent until explicitly changed (household picker, not a login session).
const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function setProfileCookie(cookies: Cookies, profileId: number) {
	cookies.set(PROFILE_COOKIE, String(profileId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: PROFILE_COOKIE_MAX_AGE
	});
}

export function clearProfileCookie(cookies: Cookies) {
	cookies.delete(PROFILE_COOKIE, { path: '/' });
}

export const DINERS_COOKIE = 'diner_ids';

// Persistent until explicitly changed, same as the acting-Profile cookie -
// Diners persists across sessions until changed (see CONTEXT.md's Diners).
const DINERS_COOKIE_MAX_AGE = PROFILE_COOKIE_MAX_AGE;

export function setDinersCookie(cookies: Cookies, profileIds: number[]) {
	cookies.set(DINERS_COOKIE, profileIds.join(','), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: DINERS_COOKIE_MAX_AGE
	});
}

export function parseDinerIds(raw: string | undefined): number[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map(Number)
		.filter((id) => Number.isInteger(id));
}
