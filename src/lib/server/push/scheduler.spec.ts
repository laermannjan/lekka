import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { pushSubscriptions, scheduledPushes, vapidKeys } from '../db/schema';
import { saveSubscription } from './subscriptions';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({
	default: {
		sendNotification: (...args: unknown[]) => sendNotification(...args),
		generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' })
	}
}));

const { cancelTimerPush, initScheduler, scheduleTimerPush, _resetSchedulerForTests } =
	await import('./scheduler');

describe('timer push scheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		sendNotification.mockReset();
		sendNotification.mockResolvedValue(undefined);
		db.delete(scheduledPushes).run();
		db.delete(pushSubscriptions).run();
		db.delete(vapidKeys).run();
	});

	afterEach(() => {
		_resetSchedulerForTests();
		vi.useRealTimers();
	});

	function subscribe() {
		return saveSubscription({
			endpoint: 'https://push.example/device',
			p256dh: 'p256dh-key',
			auth: 'auth-secret'
		});
	}

	it('fires a push at the scheduled time, not before', async () => {
		const subscription = subscribe();
		scheduleTimerPush({
			subscriptionId: subscription.id,
			timerId: 'step-1',
			title: 'Timer done',
			body: 'Simmer sauce',
			firesAt: Date.now() + 60_000
		});

		await vi.advanceTimersByTimeAsync(59_000);
		expect(sendNotification).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2_000);
		expect(sendNotification).toHaveBeenCalledTimes(1);
	});

	it('marks the row fired after sending', async () => {
		const subscription = subscribe();
		const row = scheduleTimerPush({
			subscriptionId: subscription.id,
			timerId: 'step-1',
			title: 'Timer done',
			body: 'Simmer sauce',
			firesAt: Date.now() + 1_000
		});

		await vi.advanceTimersByTimeAsync(1_000);

		const stored = db
			.select()
			.from(scheduledPushes)
			.all()
			.find((r) => r.id === row.id);
		expect(stored?.firedAt).not.toBeNull();
	});

	it('cancelling before the fire time prevents the push', async () => {
		const subscription = subscribe();
		scheduleTimerPush({
			subscriptionId: subscription.id,
			timerId: 'step-1',
			title: 'Timer done',
			body: 'Simmer sauce',
			firesAt: Date.now() + 10_000
		});

		cancelTimerPush('step-1', subscription.id);
		await vi.advanceTimersByTimeAsync(10_000);

		expect(sendNotification).not.toHaveBeenCalled();
		expect(db.select().from(scheduledPushes).all()).toHaveLength(0);
	});

	it('re-arms a still-pending row from the DB on init, including overdue ones', async () => {
		const subscription = subscribe();
		db.insert(scheduledPushes)
			.values({
				subscriptionId: subscription.id,
				timerId: 'step-1',
				title: 'Timer done',
				body: 'Simmer sauce',
				firesAt: Date.now() - 5_000
			})
			.run();

		initScheduler();
		await vi.advanceTimersByTimeAsync(0);

		expect(sendNotification).toHaveBeenCalledTimes(1);
	});

	it('removes the subscription on a 410 Gone response', async () => {
		const subscription = subscribe();
		sendNotification.mockRejectedValue({ statusCode: 410 });
		scheduleTimerPush({
			subscriptionId: subscription.id,
			timerId: 'step-1',
			title: 'Timer done',
			body: 'Simmer sauce',
			firesAt: Date.now() + 1_000
		});

		await vi.advanceTimersByTimeAsync(1_000);

		expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
	});
});
