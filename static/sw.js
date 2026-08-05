// Service worker for lekka's Step timer Web Push notifications (see
// docs/research/pwa-timer-notifications.md and issue #27). Deliberately
// minimal - no offline caching, no fetch handler - its only job is to wake
// up on a push event and show a notification. Registered from
// src/lib/push.ts.

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

// Non-negotiable: call showNotification() synchronously off every push
// event, with no async work first - Apple revokes a subscription after
// ~3 pushes that don't result in a shown notification (see the research
// doc's userVisibleOnly section). The payload is built entirely
// server-side for exactly this reason.
self.addEventListener('push', (event) => {
	let data = { title: 'Timer done', body: 'Your timer finished.' };
	if (event.data) {
		try {
			data = { ...data, ...event.data.json() };
		} catch {
			data.body = event.data.text();
		}
	}

	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			tag: data.tag,
			icon: '/icon.svg',
			badge: '/icon.svg'
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			if (clientList.length > 0) return clientList[0].focus();
			return self.clients.openWindow('/');
		})
	);
});
