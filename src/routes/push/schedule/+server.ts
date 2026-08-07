// Schedules (or cancels) the server-side Web Push fallback for one running
// Step timer - see docs/adr/0004-web-push-timer-notifications.md and
// src/lib/server/push/scheduler.ts. The client calls POST at timer-start
// time and DELETE when a timer is finished manually before firing.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	cancelTimerPush,
	scheduleTimerPush,
	isWithinTimerCeiling
} from '$lib/server/push/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const subscriptionId = Number(body?.subscriptionId);
	const timerId = String(body?.timerId ?? '');
	const title = String(body?.title ?? '');
	const bodyText = String(body?.body ?? '');
	const firesAt = Number(body?.firesAt);

	if (!subscriptionId || !timerId || !title || !firesAt) {
		error(400, 'Missing subscriptionId, timerId, title, or firesAt');
	}

	// A fire time past the scheduler's ceiling can't be represented by the
	// underlying timer and would fire immediately - reject it outright rather
	// than notifying the user now for a timer they set for far in the future.
	// `scheduleTimerPush` throws on this too; checking here turns it into a
	// 400 instead of an uncaught error surfacing as a 500.
	if (!isWithinTimerCeiling(firesAt)) {
		error(400, 'firesAt is too far in the future');
	}

	const row = scheduleTimerPush({ subscriptionId, timerId, title, body: bodyText, firesAt });
	return json({ id: row.id });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const subscriptionId = Number(body?.subscriptionId);
	const timerId = String(body?.timerId ?? '');

	if (!subscriptionId || !timerId) {
		error(400, 'Missing subscriptionId or timerId');
	}

	cancelTimerPush(timerId, subscriptionId);
	return new Response(null, { status: 204 });
};
