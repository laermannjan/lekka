// In-process scheduler that fires a Step timer's Web Push at its exact
// target time, regardless of what the client is doing (see
// docs/research/pwa-timer-notifications.md's "Recommended architecture").
// Backed by the `scheduled_pushes` table so a server restart never loses a
// pending fire: `initScheduler()` re-arms every still-pending row from the
// DB on boot, and every subsequent schedule/cancel keeps both the DB row
// and the in-memory `setTimeout` in sync.
//
// A plain `setTimeout` is enough here - lekka's persistent Node server
// (see docs/adr/0001-sveltekit-sqlite-docker-stack.md) is exactly the kind of long-running
// process this needs, and cook timers are minutes/hours out, nowhere near
// setTimeout's ~24.8 day overflow ceiling - which `MAX_TIMER_PUSH_DELAY_MS`
// below enforces rather than assumes.
import { and, eq, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '../db';
import { scheduledPushes, type ScheduledPush } from '../db/schema';
import { getVapidKeys, VAPID_SUBJECT } from './vapid';
import { getSubscriptionById, removeSubscription } from './subscriptions';

const timers = new Map<number, ReturnType<typeof setTimeout>>();

// The furthest out a push can be scheduled: `setTimeout`'s delay is coerced
// to a 32-bit signed int, so anything past this overflows and fires on the
// next tick - i.e. a timer meant for next year would notify immediately.
// Cook timers are minutes/hours out, so this bound only ever catches a
// nonsense or hostile request; better a 400 than a surprise notification.
export const MAX_TIMER_PUSH_DELAY_MS = 2_147_483_647;

// The one place that decides whether a fire time is schedulable at all, so
// the route handler validates against the same rule the scheduler enforces
// rather than restating it.
export function isWithinTimerCeiling(firesAt: number): boolean {
	return firesAt - Date.now() <= MAX_TIMER_PUSH_DELAY_MS;
}

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
	if (!isWithinTimerCeiling(input.firesAt)) {
		throw new RangeError(
			`firesAt is more than ${MAX_TIMER_PUSH_DELAY_MS}ms in the future, which the timer cannot represent`
		);
	}
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
	// `scheduleTimerPush` refuses these, so a row can only get here by having
	// been written directly into the DB, or by the host clock moving
	// backwards. Arming it would overflow the delay and fire it now, which is
	// the exact failure the bound exists to avoid. Leave it un-armed and
	// pending: the row is the durable source of truth
	// (docs/adr/0004-web-push-timer-notifications.md), so deleting it would
	// destroy a legitimate push over what may be a temporary clock skew.
	if (delay > MAX_TIMER_PUSH_DELAY_MS) {
		console.error(
			`Not arming scheduled push ${row.id}: fires_at is beyond the timer's ${MAX_TIMER_PUSH_DELAY_MS}ms ceiling`
		);
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
