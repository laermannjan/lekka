// Registration endpoint for a device's Web Push subscription (see
// docs/research/pwa-timer-notifications.md). Plain JSON fetch endpoints
// rather than SvelteKit form actions - the subscribe/unsubscribe calls are
// driven from browser APIs (PushManager), not a form submission.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVapidKeys } from '$lib/server/push/vapid';
import { removeSubscription, saveSubscription } from '$lib/server/push/subscriptions';

// The client needs the VAPID public key to call
// pushManager.subscribe({ applicationServerKey, ... }).
export const GET: RequestHandler = () => {
	const { publicKey } = getVapidKeys();
	return json({ publicKey });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const endpoint = String(body?.endpoint ?? '');
	const p256dh = String(body?.keys?.p256dh ?? '');
	const auth = String(body?.keys?.auth ?? '');

	if (!endpoint || !p256dh || !auth) {
		error(400, 'Missing endpoint or keys');
	}

	const subscription = saveSubscription({ endpoint, p256dh, auth });
	return json({ id: subscription.id });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const endpoint = String(body?.endpoint ?? '');
	if (!endpoint) error(400, 'Missing endpoint');

	removeSubscription(endpoint);
	return new Response(null, { status: 204 });
};
