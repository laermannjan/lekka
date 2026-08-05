// Browser-side Web Push helpers backing the "notify me while my phone is
// locked" fallback for Step timers (see docs/decisions.md and
// docs/research/pwa-timer-notifications.md). Deliberately not
// device-authenticated beyond the subscription id itself - a device that
// opted in stores its subscription id in localStorage and hands it back
// with every schedule/cancel call; the server never has to derive it from
// a session.

const SUBSCRIPTION_ID_KEY = 'lekka:push-subscription-id';

export function isPushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

// True once this device has a stored subscription id from a prior
// subscribe() call - a cheap, synchronous check for whether to offer
// "enable notifications" vs. "notifications enabled" in the UI.
export function isSubscribed(): boolean {
	return typeof localStorage !== 'undefined' && localStorage.getItem(SUBSCRIPTION_ID_KEY) !== null;
}

function getStoredSubscriptionId(): number | null {
	const raw = localStorage.getItem(SUBSCRIPTION_ID_KEY);
	return raw ? Number(raw) : null;
}

// VAPID public keys arrive base64url-encoded; PushManager.subscribe wants
// the raw bytes as a Uint8Array (standard conversion, see MDN's Web Push
// guide).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64Safe);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

// Must be called from a direct user gesture (e.g. a button click) - both
// iOS Safari and Firefox reject Notification.requestPermission() otherwise
// (see the research doc's permission-gesture notes).
export async function subscribeToPush(): Promise<boolean> {
	if (!isPushSupported()) return false;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	const registration = await navigator.serviceWorker.register('/sw.js');
	await navigator.serviceWorker.ready;

	const { publicKey } = await fetch('/push').then((res) => res.json());
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey)
	});

	const json = subscription.toJSON();
	const response = await fetch('/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
	});
	const { id } = await response.json();
	localStorage.setItem(SUBSCRIPTION_ID_KEY, String(id));
	return true;
}

export async function unsubscribeFromPush(): Promise<void> {
	if (!isPushSupported()) return;

	const registration = await navigator.serviceWorker.getRegistration('/sw.js');
	const subscription = await registration?.pushManager.getSubscription();
	if (subscription) {
		await fetch('/push', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
		await subscription.unsubscribe();
	}
	localStorage.removeItem(SUBSCRIPTION_ID_KEY);
}

// Hands the server a running timer's exact target time so it can fire the
// push even if this tab is backgrounded/closed or the phone is locked. A
// no-op if this device never enabled notifications - the client-side
// countdown (see TimerStore) still works either way.
export async function scheduleTimerPush(
	timerId: string,
	title: string,
	body: string,
	firesAt: number
): Promise<void> {
	const subscriptionId = getStoredSubscriptionId();
	if (!subscriptionId) return;

	await fetch('/push/schedule', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ subscriptionId, timerId, title, body, firesAt })
	});
}

// Cancels a still-pending server-side push - called when a timer is
// finished manually before it would have fired, so the user doesn't get a
// stale/confusing notification after they already handled it.
export async function cancelTimerPush(timerId: string): Promise<void> {
	const subscriptionId = getStoredSubscriptionId();
	if (!subscriptionId) return;

	await fetch('/push/schedule', {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ subscriptionId, timerId })
	});
}
