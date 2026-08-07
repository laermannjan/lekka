---
date: 2026-08-06
---

# Web Push timer notifications: in-process `setTimeout`, DB-persisted VAPID keys

#27 asked for the server-side fallback ADR-0003 deferred: a running Step timer must still notify when the phone is locked or the app is backgrounded, per the research finding that only server-fired Web Push (VAPID/RFC 8292) is spec-guaranteed to work in that case. The research doc had suggested a Cloudflare Worker plus Durable Object alarm, but that predates ADR-0001's choice of SvelteKit's Node adapter as one persistent process, which already provides what an external scheduler would.

- **The scheduler is a plain in-process `setTimeout`** (`src/lib/server/push/scheduler.ts`), not a separate queue or worker. Every scheduled push is also written to a `scheduled_pushes` row, and `initScheduler()` re-arms every still-pending row on boot (firing overdue ones immediately), so a restart never silently drops a fire. The in-memory timeout is a precision detail; the DB row is the durable source of truth.
- **The VAPID keypair is generated once and persisted in a `vapid_keys` table** (`src/lib/server/push/vapid.ts`), not supplied via env var. A subscription is bound to the public key that created it, so the key must stay stable across restarts, and a self-hoster who never touches configuration still gets working push.
- **Push subscriptions are per-device, not per-Profile** (`push_subscriptions`, keyed by unique `endpoint`): notification permission and the resulting endpoint are a browser/device fact, not a household-member fact. The client keeps its own subscription id in `localStorage` and hands it back on every schedule/cancel call rather than the server deriving it from a session.
- **Notification content is built server-side into the push payload** (`title`/`body`/`tag` on `scheduled_pushes`), so the service worker's `push` handler (`static/sw.js`) calls `showNotification()` synchronously with no async work first, avoiding Apple's ~3-strikes `userVisibleOnly` revocation the research flags.
- **Manual "Finish timer" cancels the pending push**, otherwise a stale push arrives after the user already handled the timer by hand.
- **PWA installability** (`static/manifest.json`, `apple-mobile-web-app-capable`) ships alongside push rather than as its own ticket, since iOS Safari leaves `Notification`/`Push` undefined until the app is Home-Screen-installed.

## Considered options

- **Cloudflare Worker + Durable Object alarm** (the research doc's original suggestion): written before ADR-0001 landed. Once the Node adapter was chosen as one persistent process, an external scheduler is redundant complexity rather than an improvement.
- **A `setInterval` poll over `scheduled_pushes`** instead of per-row `setTimeout`: adds a fixed delivery-latency floor for no benefit. `setTimeout` fires at an exact time, and cook timers are nowhere near its ~24.8 day overflow ceiling. That ceiling is now enforced rather than assumed (`MAX_TIMER_PUSH_DELAY_MS`, #49): a delay past it is coerced to a 32-bit int and overflows, so an unbounded fire time would notify _immediately_ instead of far in the future. The scheduling endpoint rejects such a request with a 400, and a row already in the DB past the ceiling is left un-armed on boot rather than fired - the row stays the durable source of truth, so a clock skew never destroys a pending push.
- **VAPID keys via env var**: simpler code, but pushes a "lose this and every subscription breaks" burden onto the self-hoster's deployment config. DB persistence keeps it inside the same backup story as everything else, the SQLite volume.
