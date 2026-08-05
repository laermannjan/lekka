import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../db';
import { pushSubscriptions } from '../db/schema';
import { getSubscriptionById, removeSubscription, saveSubscription } from './subscriptions';

describe('push subscriptions', () => {
	beforeEach(() => {
		db.delete(pushSubscriptions).run();
	});

	function input(endpoint = 'https://push.example/abc') {
		return { endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' };
	}

	it('saves a new subscription', () => {
		const saved = saveSubscription(input());

		expect(saved.endpoint).toBe('https://push.example/abc');
		expect(getSubscriptionById(saved.id)).toMatchObject(input());
	});

	it('updates keys in place when the same endpoint re-subscribes', () => {
		const first = saveSubscription(input());

		const updated = saveSubscription({ ...input(), p256dh: 'new-p256dh', auth: 'new-auth' });

		expect(updated.id).toBe(first.id);
		expect(getSubscriptionById(first.id)).toMatchObject({
			p256dh: 'new-p256dh',
			auth: 'new-auth'
		});
	});

	it('removes a subscription by endpoint', () => {
		const saved = saveSubscription(input());

		removeSubscription(saved.endpoint);

		expect(getSubscriptionById(saved.id)).toBeUndefined();
	});
});
