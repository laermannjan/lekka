// Storage for a device's Web Push subscription (see CONTEXT.md-adjacent
// note on push_subscriptions in db/schema.ts). One row per unique endpoint
// - re-subscribing the same device (e.g. after clearing permission and
// re-granting it) just updates the keys in place rather than piling up
// stale rows.
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { pushSubscriptions, type PushSubscription } from '../db/schema';

export type SubscriptionInput = {
	endpoint: string;
	p256dh: string;
	auth: string;
};

export function saveSubscription(input: SubscriptionInput): PushSubscription {
	return db
		.insert(pushSubscriptions)
		.values(input)
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { p256dh: input.p256dh, auth: input.auth }
		})
		.returning()
		.get();
}

export function removeSubscription(endpoint: string): void {
	db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export function getSubscriptionById(id: number): PushSubscription | undefined {
	return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id)).get();
}
