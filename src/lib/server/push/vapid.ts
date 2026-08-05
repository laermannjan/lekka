// The server's single VAPID (RFC 8292) keypair. Generated once, on first
// use, and persisted to `vapid_keys` so it survives restarts/redeploys - a
// Web Push subscription is bound to the public key that created it, so a
// self-hoster who never touches an env var still gets a stable keypair
// (see docs/decisions.md's migrate-on-boot entry for the same
// no-manual-step philosophy).
import webpush from 'web-push';
import { db } from '../db';
import { vapidKeys, type VapidKeys } from '../db/schema';

let cached: VapidKeys | undefined;

export function getVapidKeys(): VapidKeys {
	if (cached) return cached;

	const existing = db.select().from(vapidKeys).get();
	if (existing) {
		cached = existing;
		return existing;
	}

	const { publicKey, privateKey } = webpush.generateVAPIDKeys();
	const created = db.insert(vapidKeys).values({ publicKey, privateKey }).returning().get();
	cached = created;
	return created;
}

// Test-only: clear the in-memory cache so a test can exercise the
// generate-vs-reuse paths independently of whatever ran before it in the
// same test file.
export function _resetVapidCacheForTests(): void {
	cached = undefined;
}

// The subject (contact) URI Apple/Google's push services can reach the
// operator at if a subscription needs attention - a plausible-looking
// placeholder is fine for a self-hosted single-household app with no
// registered domain of its own.
export const VAPID_SUBJECT = 'mailto:admin@localhost';
