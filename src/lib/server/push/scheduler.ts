// In-process scheduler that fires a Step timer's Web Push at its exact
// target time, regardless of what the client is doing (see
// docs/research/pwa-timer-notifications.md's "Recommended architecture").
// Backed by the `scheduled_pushes` table so a server restart never loses a
// pending fire: `initScheduler()` re-arms every still-pending row from the
// DB on boot, and every subsequent schedule/cancel keeps both the DB row
// and the in-memory `setTimeout` in sync.
//
// A plain `setTimeout` is enough here - lekka's persistent Node server
// (see docs/decisions.md's stack entry) is exactly the kind of long-running
// process this needs, and cook timers are minutes/hours out, nowhere near
// setTimeout's ~24.8 day overflow ceiling.
import { and, eq, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '../db';
import { scheduledPushes, type ScheduledPush } from '../db/schema';
import { getVapidKeys, VAPID_SUBJECT } from './vapid';
import { getSubscriptionById, removeSubscription } from './subscriptions';

const timers = new Map<number, ReturnType<typeof setTimeout>>();

export type ScheduleInput = {
	subscriptionId: number;
	timerId: string;
	title: string;
	body: string;
	firesAt: number;
};

// Called once from hooks.server.ts's `init` - re-arms every pending push
// still in the future, and fires off (synchronously, best-effort) any that
// should already have gone out while the server was down.
export function initScheduler(): void {
	const pending = db.select().from(scheduledPushes).where(isNull(scheduledPushes.firedAt)).all();

	for (const row of pending) {
		arm(row);
	}
}

export function scheduleTimerPush(input: ScheduleInput): ScheduledPush {
	const row = db.insert(scheduledPushes).values(input).returning().get();
	arm(row);
	return row;
}

// Called when a timer is finished manually before it would have fired
// (see TimerStore.finish) - the user already knows, so the push would just
// be a stale/confusing duplicate.
export function cancelTimerPush(timerId: string, subscriptionId: number): void {
	const rows = db
		.select()
		.from(scheduledPushes)
		.where(
			and(
				eq(scheduledPushes.timerId, timerId),
				eq(scheduledPushes.subscriptionId, subscriptionId),
				isNull(scheduledPushes.firedAt)
			)
		)
		.all();

	for (const row of rows) {
		const handle = timers.get(row.id);
		if (handle) {
			clearTimeout(handle);
			timers.delete(row.id);
		}
		db.delete(scheduledPushes).where(eq(scheduledPushes.id, row.id)).run();
	}
}

function arm(row: ScheduledPush): void {
	const delay = row.firesAt - Date.now();
	if (delay <= 0) {
		void fire(row);
		return;
	}
	const handle = setTimeout(() => void fire(row), delay);
	timers.set(row.id, handle);
}

async function fire(row: ScheduledPush): Promise<void> {
	timers.delete(row.id);

	// Row may have been cancelled between arming and firing (e.g. the user
	// hit "Finish" moments before the target time) - re-check it's still
	// pending before sending anything.
	const stillPending = db
		.select()
		.from(scheduledPushes)
		.where(and(eq(scheduledPushes.id, row.id), isNull(scheduledPushes.firedAt)))
		.get();
	if (!stillPending) return;

	const subscription = getSubscriptionById(row.subscriptionId);
	if (!subscription) {
		db.delete(scheduledPushes).where(eq(scheduledPushes.id, row.id)).run();
		return;
	}

	const { publicKey, privateKey } = getVapidKeys();
	// Self-contained payload, built server-side, with everything the
	// service worker's `push` handler needs to call showNotification()
	// synchronously and nothing that requires async work first - see the
	// research doc's note on Apple's ~3-strikes userVisibleOnly revocation.
	const payload = JSON.stringify({ title: row.title, body: row.body, tag: row.timerId });

	try {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth }
			},
			payload,
			{ vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey } }
		);
	} catch (err) {
		// 404/410 means the browser/OS revoked or expired the subscription -
		// stop holding onto it. Any other error (e.g. a transient network
		// blip) is logged and dropped; there's no reasonable retry window
		// left once a timer's fire time has already passed.
		const statusCode = (err as { statusCode?: number }).statusCode;
		if (statusCode === 404 || statusCode === 410) {
			removeSubscription(subscription.endpoint);
		} else {
			console.error('Failed to send timer push notification', err);
		}
	} finally {
		db.update(scheduledPushes)
			.set({ firedAt: Date.now() })
			.where(eq(scheduledPushes.id, row.id))
			.run();
	}
}

// Test-only: drop every armed timeout so a test file can start clean
// without leaking handles across specs.
export function _resetSchedulerForTests(): void {
	for (const handle of timers.values()) clearTimeout(handle);
	timers.clear();
}
