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
