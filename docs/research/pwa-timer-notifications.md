# PWA timer/notification platform constraints

Research for lekka's step-level cook timer feature: can a client-side timer
reliably notify a user when a recipe step finishes, including while the
phone is locked or the app isn't foregrounded? What do iOS Safari, Android
Chrome, and desktop Chrome/Firefox actually guarantee, as of primary sources
(specs, MDN compat data, WebKit/Chrome vendor docs, caniuse) checked
2026-08-05?

## Summary / Recommendation

**A pure client-side `setTimeout`/`setInterval` + local notification is not
sufficient for lekka's core promise ("get notified when the timer ends,
even if your phone is locked"). Reliable notification while backgrounded
requires a server-side Web Push component.** This is not a hedge - it's the
direct consequence of two independent, well-documented facts:

1. Every engine we care about intentionally suspends or heavily throttles
   JS timers in tabs/apps that are hidden or not in the foreground -
   Chrome's page freezing and per-minute "intensive throttling" of chained
   timers ([Chrome 88 timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88), [Page Lifecycle API](https://developer.chrome.com/blog/page-lifecycle-api)), Firefox's 1 Hz clamp on background tabs ([Mozilla bug 633421](https://bugzilla.mozilla.org/show_bug.cgi?id=633421)), and Safari's background-tab suspension of timers/animations, shipped in 2015 and still the model today ([WebKit bug 150515](https://bugs.webkit.org/show_bug.cgi?id=150515)). On iOS this suspension applies just as much to an installed home-screen PWA the moment it's not the active app - there is no "keep running in the background" exemption for web content.
2. There is no reliable "wake me up at exactly T+10min" scheduling primitive
   for a page or service worker. The one API designed for that,
   **Notification Triggers**, was abandoned by Google before shipping
   anywhere ("development... has ended... wasn't clear that we could
   provide consistent and reliable experiences across platforms",
   [developer.chrome.com](https://developer.chrome.com/docs/web-platform/notification-triggers)).
   **Periodic Background Sync** is Chromium-only, requires the PWA to be
   installed, is gated by a rolling site-engagement score, and is explicitly
   an opportunistic/periodic mechanism, not an exact-time scheduler
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API), [Chrome capability guide](https://developer.chrome.com/docs/capabilities/periodic-background-sync)).

The only mechanism that reliably wakes something up while the page/app is
not running is **server-side Web Push**: the OS-level push transport
(APNs on Apple platforms, Google's push infrastructure on Chrome/Android)
delivers the message and briefly revives the service worker even if the
tab/app was fully closed - because delivery happens outside the page's own
JS execution. Apple's own WebKit blog confirms delivered pushes "show on
the Lock Screen, in Notification Center, and on a paired Apple Watch"
exactly like a native app ([webkit.org](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

### Recommended architecture for lekka

- **MVP / common case (screen on, user actively cooking):** client-side
  timer using wall-clock target timestamps (`Date.now() + duration`, not
  tick-counting, to survive throttling/drift), `ServiceWorkerRegistration
.showNotification()` for the actual notification, [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
  to stop the screen from locking while the timer view is the foregrounded
  tab, and the [Web Locks API](https://www.w3.org/TR/web-locks/) to elect a single tab as the "owner" of a
  given timer so duplicate notifications don't fire if the recipe is open
  in two tabs. This covers the majority real case: phone or laptop screen
  on, user glancing at the app periodically.
- **Robust fallback (screen off / app switched away / tab closed,
  especially iOS):** a small server component (e.g. a Cloudflare Worker +
  Durable Object alarm, since lekka's stack already leans Cloudflare) that
  the client hands the timer's target timestamp to at start time. The
  server holds the [Web Push](https://www.w3.org/TR/push-api/) subscription (VAPID-authenticated, [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html)) and fires the push at the exact target time regardless of what the
  client is doing. This is the only path that is spec-guaranteed to work
  with the phone locked.
- **Non-negotiable implementation detail:** the service worker's `push`
  handler must call `event.waitUntil(registration.showNotification(...))`
  for literally every push, immediately. Apple enforces this hard: "after
  three push events where you fail to post a notification in a timely
  manner, your site's push subscription will be revoked" ([WWDC22 session 10098](https://developer.apple.com/videos/play/wwdc2022/10098/), transcript). Chrome has an analogous "permission hygiene" posture for
  low-engagement/abusive senders. Design the push payload so the service
  worker never needs to do async work (DB lookups, etc.) before showing
  the notification - build the notification content server-side and put
  it directly in the push payload.
- **Hard product constraint on iOS, not just an engineering nuance:** the
  `Notification` and `Push` APIs are simply `undefined` in Safari until the
  app has been added to the Home Screen with a valid manifest - "the
  `Notification` interface is undefined, unless the page is a web app saved
  to the home screen" ([MDN / browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json)), and this only became possible at all in **iOS/iPadOS 16.4**
  (March 2023, [webkit.org](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Any user on iOS who hasn't installed lekka to their home screen
  cannot get notifications at all, full stop - the UI must nudge
  installation before timers are framed as "notify me."
- **Skip Periodic Background Sync and Notification Triggers entirely** -
  one is dead (never shipped anywhere), the other is Chromium-only,
  install-gated, engagement-scored, and not an exact-time primitive. Don't
  build around either.
- **Watch, but don't build on yet: Declarative Web Push** (iOS 18.4 /
  macOS 15.5+, [webkit.org](https://webkit.org/blog/16535/meet-declarative-web-push/)) removes the "must run SW JS to show the notification" requirement
  and the associated revocation risk - the browser can render the
  notification straight from the push payload's JSON. It's now merged into
  the core Push API Working Draft co-edited by Apple and Mozilla ([w3.org/TR/push-api](https://www.w3.org/TR/push-api/)), but Chromium support is still an open, unimplemented issue as of
  this research ([issues.chromium.org/issues/382298314](https://issues.chromium.org/issues/382298314)). Design the push payload to be declarative-push-compatible from day
  one (self-contained JSON, no required server round-trip in the SW) so
  adopting it later is a small change, but don't depend on it shipping in
  Chrome.

Bottom line: **ship the client-side timer for the "watching the screen"
case immediately, but treat server-side Web Push as part of the v1 scope
for the actual "notify me while my phone is locked" promise** - that promise
is exactly the case client-side timers cannot deliver on any of the three
platform families researched.

---

## iOS Safari / installed PWA

- **Notification/Push API availability is gated on Home Screen
  installation.** Regular Safari tabs cannot use `Notification` or `Push`
  at all - the interfaces are literally undefined until the page "is a web
  app saved to the home screen" with a manifest `display` value other than
  the default ([MDN BCD, api/Notification.json](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json); confirmed for `showNotification()` too in [api/ServiceWorkerRegistration.json](https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerRegistration.json)). caniuse's summary table matches this: iOS Safari shows only
  "partial support" starting at 16.4, versus "not supported" before that
  ([caniuse.com/notifications](https://caniuse.com/notifications)).
- **This capability shipped in iOS/iPadOS 16.4 (beta, announced ~Jan 2023,
  released March 2023).** The WebKit blog post is explicit: "iOS and
  iPadOS 16.4 beta 1 comes support for Web Push for Home Screen web apps,"
  and Web Push "notifications from web apps work exactly like notifications
  from other apps, showing on the Lock Screen, in Notification Center, and
  on a paired Apple Watch" ([webkit.org/blog/13878](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). The same release also added the Badging API for home-screen apps.
- **Permission must be requested from a direct user gesture.** "A web app
  that has been added to the Home Screen can request permission to receive
  push notifications as long as that request is in response to direct user
  interaction - such as tapping on a 'subscribe' button" (same post). This
  matches the general web platform direction: Firefox has required
  transient activation for `Notification.requestPermission()` since version
  72, and browsers are moving to disallow non-gesture-triggered requests
  entirely ([MDN, Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)).
- **The `userVisibleOnly` promise is strictly enforced, with a stated
  violation count.** Safari's Web Push (first shipped for macOS Safari 16 /
  Ventura, then extended to iOS Home Screen apps in 16.4) requires
  `pushManager.subscribe({ userVisibleOnly: true, ... })` and a notification
  shown for literally every push. WebKit's own announcement: "Handling a
  push event is not an invitation for your JavaScript to get silent
  background runtime. Doing so would violate both a user's trust and a
  user's battery life... Violations of the `userVisibleOnly` promise will
  result in a push subscription being revoked" ([webkit.org/blog/12945, "Meet Web Push"](https://webkit.org/blog/12945/meet-web-push/)). The exact threshold is stated in Apple's own WWDC22 session: "in the
  beta build of macOS Ventura, after three push events where you fail to
  post a notification in a timely manner, your site's push subscription
  will be revoked. You will need to go through the permission workflow
  again" ([WWDC22 - Meet Web Push for Safari, session 10098](https://developer.apple.com/videos/play/wwdc2022/10098/)).
- **Background tab/app suspension is not new and not a corner case - it's
  the baseline model.** WebKit shipped full suspension of background-tab
  activity (timers, animations, DOM object activity) in 2015: "suspend all
  activity on background tabs where possible to improve performance for
  users who use multiple tabs," resolved fixed and landed as [r194006](https://commits.webkit.org/r194006) ([WebKit bug 150515](https://bugs.webkit.org/show_bug.cgi?id=150515)). An installed home-screen web app that isn't the frontmost app is, from
  WebKit's perspective, functionally backgrounded content and subject to
  the same suspension - Apple does not describe a special "keep JS alive
  while backgrounded" exemption for home-screen web apps.
- **Screen Wake Lock has an iOS-specific installed-PWA bug window.** Per
  MDN's compat data, WakeLock shipped in Safari 16.4 generally, but "does
  not work in standalone Home Screen Web Apps" for the entire 16.4-18.3
  range - it was only fixed for installed PWAs in **iOS 18.4** ([MDN BCD, api/WakeLock.json](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json)). If lekka wants to keep the screen on during an active timer view on
  an installed iOS PWA, that only reliably works from iOS 18.4 onward -
  earlier versions may silently fail to hold the lock.
- **Real-world reliability reports are inconsistent across iOS point
  releases**, and should be read as anecdotal (Apple Developer Forums, not
  an official errata list) but numerous and consistent enough to flag
  explicitly:
  - Multiple developers report push notifications "work perfectly on
    Android" but become unreliable on iOS 16.4+ over time, described as a
    widespread pattern rather than one app's bug ([Apple Developer Forums thread 728796](https://developer.apple.com/forums/thread/728796?page=2)).
  - A forum thread dated to iOS 18.1.1 reports `indexedDB` being
    `undefined` inside a service worker woken specifically by a push event
    (works fine when the SW is woken by other means), plus
    `pushManager.getSubscription()` returning `null` after an app restart
    despite the subscription still being valid server-side, and
    `navigator.permissions.query()` for notifications always returning
    `'prompt'` regardless of actual permission state, with `onchange` never
    firing - all reported as Safari-only regressions, working correctly in
    Chrome/Firefox/Edge on the same origin ([Apple Developer Forums thread 769794](https://developer.apple.com/forums/thread/769794)).
  - A commonly cited (non-primary, but widely corroborated) root cause for
    "my subscription silently stopped working" reports is missing
    `event.waitUntil()` in the push handler, which races the notification
    display against service worker termination - consistent with the
    `userVisibleOnly` enforcement above.
  - Practical implication for lekka: **do not assume iOS push behaves
    identically across even minor point releases.** Treat "notification
    didn't arrive" as an expected failure mode to design around (e.g.
    re-sync missed timers when the app is reopened), not just a bug to fix
    once.
- **"Backgrounded but open" vs "fully closed/swiped away" vs "phone
  locked" - what's actually different:**
  - _Phone locked, app not running_: works for **push-delivered**
    notifications only, since APNs delivers independently of the app's own
    execution state (per the webkit.org Lock Screen quote above). Does not
    work for a client-side `setTimeout` since no JS is executing at all.
  - _App backgrounded (user switched to another app) but not swiped away_:
    same as above for push. For client-side timers, WebKit's background-tab
    suspension model (bug 150515) means the timer is not guaranteed to keep
    ticking; there is no primary-source SLA for how long a backgrounded
    home-screen web app is kept alive before full suspension.
  - _App fully closed/terminated_: only push-delivered notifications work;
    there is no service worker execution to rely on at all until something
    (a push event or the user reopening the app) revives it.
- **Declarative Web Push (iOS 18.4 / iPadOS 18.4 / macOS 15.5 beta)** lets
  the browser show a notification straight from the push payload's JSON,
  without requiring a live service worker to run at all, and removes the
  "silent push" revocation penalty for cases where the SW legitimately
  fails to run (e.g. because Intelligent Tracking Prevention had already
  cleared the SW registration): "there is no penalty for service workers
  failing to display a notification; the declarative push message itself is
  used as a fallback" ([webkit.org/blog/16535](https://webkit.org/blog/16535/meet-declarative-web-push/)). This is very recent (2025) and, per the Chromium issue tracker, not
  yet implemented outside WebKit ([issues.chromium.org/issues/382298314](https://issues.chromium.org/issues/382298314)).

## Android Chrome

- **No install requirement for Notification/Push, unlike iOS.** Per MDN's
  compat data, Chrome for Android has supported the `Notification`
  interface since version 42, with the only restriction being that "a
  notification can only be sent from a service worker" - no home-screen
  installation is required ([MDN BCD, api/Notification.json](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json)). This is a real platform asymmetry worth designing around: Android
  users get notifications-in-a-plain-tab; iOS users do not.
  Push API support matches this (Chrome 42+, per [MDN BCD api/PushManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json)).
- **Background tab throttling is the same Blink engine behavior as
  desktop Chrome** (see Desktop Chrome section) - Chrome 88's intensive
  throttling of chained timers in hidden pages applies equally on Android
  ([developer.chrome.com/blog/timer-throttling-in-chrome-88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)), plus Chrome's Memory Saver mode can discard inactive background
  tabs outright to free memory, requiring a full reload on return ([developer.chrome.com/blog/memory-and-energy-saver-mode](https://developer.chrome.com/blog/memory-and-energy-saver-mode)).
- **Underlying Android OS power management (Doze/App Standby) can delay
  even push delivery when the device is deeply idle.** This is reported
  directly against Chrome/web push, not just native apps: a Chromium issue
  titled "SW: push messages not waking Android 8.0 from deep sleep" ([crbug.com/777106](https://bugs.chromium.org/p/chromium/issues/detail?id=777106)) and a related developer discussion noting that "high priority push
  notification can't wake up android phone while in doze" for web push
  specifically, in contrast to native apps where FCM high-priority messages
  are documented to get a temporary Doze/App Standby exemption for native
  apps ([Android Developers, Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby); [chromium-dev discussion thread](https://groups.google.com/a/chromium.org/g/push-notifications-dev/c/gWsM4Hg2JZE)). Treat this as a known reliability gap rather than a guarantee - Web
  Push on Android is generally reliable in normal use, but not proven to
  have the same Doze-bypass guarantee native apps get.
- **Periodic Background Sync is available but installed-PWA-only and
  engagement-gated.** It's a Chromium/Blink feature (shipped Chrome 80+,
  per [MDN BCD api/PeriodicSyncManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json)), restricted to installed web apps, and Chrome uses a rolling
  site-engagement score to gate whether/how often it fires: "a
  `periodicsync` event won't be fired at all unless the engagement score is
  greater than zero... sites that the user interacts more with are allowed
  to run more frequent updates" ([developer.chrome.com/docs/capabilities/periodic-background-sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync)). Not an exact-time primitive - unsuitable for "fire this specific
  10-minute timer."

## Desktop Chrome / Firefox

- **Chrome timer throttling has two escalating tiers**, documented
  precisely on developer.chrome.com ([Chrome 88 timer throttling post](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)):
  - _Standard throttling_: applies once a page is hidden; the browser
    checks/executes chained timers once per **second**.
  - _Intensive throttling_ (new in Chrome 88, Jan 2021): once a page has
    been hidden for **>5 minutes**, has a chain of **≥5** nested timers, has
    been silent (no audio) for **≥30 seconds**, and has no active WebRTC
    connection, timers are checked only once per **minute**.
  - Exceptions: pages actively playing audio/video, or with open WebRTC
    connections, are exempted from intensive throttling.
- **Chrome's Page Lifecycle API adds a further "frozen" state** on top of
  throttling: "browsers freeze pages as a way to preserve CPU/battery/data
  usage... freezable tasks in the page's task queues won't be started" -
  i.e. beyond throttling delivery rate, the browser can stop delivering
  timer callbacks at all for a hidden page ([developer.chrome.com/blog/page-lifecycle-api](https://developer.chrome.com/blog/page-lifecycle-api)). As of Chrome 133 (Feb 2025), Energy Saver mode extends this to
  actively freeze CPU-intensive background tabs even without going through
  full discard ([developer.chrome.com/blog/freezing-on-energy-saver](https://developer.chrome.com/blog/freezing-on-energy-saver)).
  Chrome's Memory Saver mode can go further and fully **discard** an
  inactive background tab, unloading the page entirely (state is lost;
  reload happens on tab revisit) ([developer.chrome.com/blog/tab-discarding](https://developer.chrome.com/blog/tab-discarding)).
- **Service workers themselves are short-lived, independent of the page.**
  Chrome documents that it "terminates a service worker if the SW has been
  idle for 30 seconds," with events/API calls resetting the idle timer;
  this is documented primarily in the context of Manifest V3 extension
  service workers ([developer.chrome.com, extension SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle); [Chrome 110 change announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/_RxghHKGQ8s)), but the underlying "terminate an idle SW to save memory" behavior is
  the general Chromium service worker model, not an extension-only
  concept - a page-context service worker cannot be assumed to stay alive
  indefinitely either. Practical implication: a service worker cannot
  itself hold a long-running `setTimeout` across the full 10 minutes of a
  cook timer and expect to survive - it will very likely be terminated and
  restarted before firing.
- **Firefox clamps background-tab timers to 1 Hz, confirmed directly in
  Mozilla's own bug tracker.** [Bugzilla 633421](https://bugzilla.mozilla.org/show_bug.cgi?id=633421), "Clamp
  setTimeout/setInterval to something higher than 10ms in inactive tabs,"
  is the origin of Firefox's background throttling; Firefox relaxes this
  specifically for tabs actively playing through Web Audio ([Bugzilla 1181073](https://bugzilla.mozilla.org/show_bug.cgi?id=1181073)). No primary source was found confirming a Chrome-88-style
  "intensive"/per-minute second throttling tier in Firefox - the confirmed
  Firefox behavior is the 1-second clamp, not a further escalation.
- **Notification/Push/service worker support is broad and does not
  require installation on desktop.** Both Chrome and Firefox support
  `Notification`, `showNotification()`, and `PushManager` in ordinary tabs,
  no PWA installation needed (Chrome since v20/v42 respectively, Firefox
  since v22/v44 - [MDN BCD api/Notification.json](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json), [api/PushManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json)). Desktop Safari also supports both starting at Safari 16 / macOS
  Ventura (2022), again without requiring the site be added to the Dock -
  installation is an iOS-specific gate, not a Safari-wide one.
- **User-gesture requirement for permission prompts is real but
  browser-specific in enforcement.** Firefox has explicitly disallowed
  non-gesture-triggered `Notification.requestPermission()` calls since
  Firefox 72; browsers generally disallow the request from cross-origin
  iframes and require a secure context (HTTPS) ([MDN, Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)). Chrome does not hard-block non-gesture requests the same way, but
  since **Chrome 80** (Jan 2020) it defaults to a "quiet" (non-intrusive)
  permission UI for sites with low acceptance rates or abusive notification
  content, escalating in Chrome 84 and Chrome 86 to automatic enrollment
  for sites sending abusive content ([Chromium Blog, "Introducing quieter permission UI for notifications"](https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html); [developer.chrome.com, notification-permission-data-in-crux](https://developer.chrome.com/blog/notification-permission-data-in-crux)). Practical implication: always gate the permission prompt behind an
  explicit "enable timer notifications" user action, never trigger it on
  page load.

## Service worker wake-up APIs: the real support matrix

| API                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Support                                                                                                                                                                                                                                                                                                                                                                                                          | Fit for lekka                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notification Triggers** (`showTrigger` + `TimestampTrigger`)     | **Abandoned.** Google's own docs: "development of Notification Triggers API... has ended. It wasn't clear that we could provide consistent and reliable experiences across platforms" ([developer.chrome.com/docs/web-platform/notification-triggers](https://developer.chrome.com/docs/web-platform/notification-triggers)). Explainer repo last updated 2019, no status update since ([beverloo/notification-triggers](https://github.com/beverloo/notification-triggers)). | Never shipped in any stable browser; not present in MDN's compat data for `ServiceWorkerRegistration` at all ([api/ServiceWorkerRegistration.json](https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerRegistration.json)).                                                                                                                                                                    | Do not use. It doesn't exist anywhere in production.                                                                                                                                                                                                                                                                                                                             |
| **Periodic Background Sync**                                       | Experimental, Chromium-only. MDN: "Limited Availability... not Baseline because it does not work in some of the most widely-used browsers" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API)).                                                                                                                                                                                                                             | Chrome/Edge/Samsung Internet/Opera only, from Chrome 80 (`version_added: 80` in [MDN BCD api/PeriodicSyncManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json)); **Firefox: not supported. Safari/iOS: not supported.** Installed-PWA-only, engagement-score-gated ([developer.chrome.com](https://developer.chrome.com/docs/capabilities/periodic-background-sync)). | Wrong tool even where supported - it's periodic/opportunistic, not exact-time, and entirely absent on Safari/Firefox.                                                                                                                                                                                                                                                            |
| **Web Push (`PushManager` + `push` event + `showNotification()`)** | Live standard, actively developed. W3C Working Draft, republished Dec 1, 2025, co-edited by Apple (Marcos Cáceres) and Mozilla (Kagami Rosylight) ([w3.org/TR/push-api](https://www.w3.org/TR/push-api/)).                                                                                                                                                                                                                                                                    | Chrome 42+, Firefox 44+, Edge 17+, Safari 16 (macOS Ventura)/16.4 (iOS Home Screen apps) ([MDN BCD api/PushManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json)). Broadly shipped everywhere that matters for lekka, with the iOS install-gate as the one caveat.                                                                                                            | **This is the mechanism to build on.** Real OS-level wake-up, works with app closed/phone locked, universally supported (with the iOS install caveat noted above).                                                                                                                                                                                                               |
| **Declarative Web Push**                                           | Newly merged into the core Push API spec ([w3.org/TR/push-api](https://www.w3.org/TR/push-api/)); shipped in Safari/WebKit (iOS/iPadOS 18.4, macOS 15.5) ([webkit.org/blog/16535](https://webkit.org/blog/16535/meet-declarative-web-push/)).                                                                                                                                                                                                                                 | WebKit only so far; Chromium implementation is an open, unimplemented issue as of this research ([issues.chromium.org/issues/382298314](https://issues.chromium.org/issues/382298314)).                                                                                                                                                                                                                          | Design payloads to be forward-compatible with it, but don't depend on it in Chrome yet.                                                                                                                                                                                                                                                                                          |
| **Web Locks API** (`navigator.locks`)                              | Standard, stable. W3C Working Draft ([w3.org/TR/web-locks](https://www.w3.org/TR/web-locks/)), used for cross-tab/cross-worker coordination, not scheduling.                                                                                                                                                                                                                                                                                                                  | Chrome 69+, Firefox 96+, Safari 15.4+ ([MDN BCD api/LockManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/LockManager.json)) - broadly supported.                                                                                                                                                                                                                                           | Not a wake-up mechanism at all; useful only for the orthogonal problem of avoiding duplicate timers/notifications across multiple open tabs of the same origin (leader-election pattern, see [w3c/web-locks EXPLAINER.md](https://github.com/w3c/web-locks/blob/main/EXPLAINER.md)).                                                                                             |
| **Screen Wake Lock API**                                           | Standard, stable-ish. W3C Working Draft ([w3.org/TR/screen-wake-lock](https://www.w3.org/TR/screen-wake-lock/)).                                                                                                                                                                                                                                                                                                                                                              | Chrome 85+, Firefox 126+, Safari 16.4+ desktop and iOS, though **broken specifically inside installed iOS Home Screen web apps from 16.4 through 18.3**, fixed only in iOS 18.4 ([MDN BCD api/WakeLock.json](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json); cross-checked against [caniuse.com/wake-lock](https://caniuse.com/wake-lock)).                                             | Useful only while the tab is foregrounded and visible - the lock is "automatically released when document becomes inactive" ([MDN, Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)), so it does **not** extend background execution at all; it only stops the screen from sleeping while the user is actively looking at the timer. |

## Recommended patterns / libraries for production

- **Client-side timer**: store an absolute target timestamp
  (`Date.now() + ms`), not a countdown decremented by `setInterval` ticks.
  Recompute remaining time from the wall clock on `visibilitychange`/on
  resume rather than trusting elapsed tick count - this is the standard
  mitigation for both Chrome's throttling tiers and Firefox's 1 Hz clamp
  (both of which delay/coalesce callbacks but don't change `Date.now()`).
- **`ServiceWorkerRegistration.showNotification()` over the bare
  `Notification` constructor** for anything triggered from a service
  worker context (required on iOS regardless, and generally the more
  capable API - supports actions, badges, etc. per [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerRegistration.json)).
- **Screen Wake Lock** while a timer's countdown view is the active,
  visible tab - re-acquire on `visibilitychange` back to visible, per
  MDN's documented pattern ([MDN, Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)). Remember the iOS installed-PWA bug window above (broken until
  18.4) - treat wake-lock failure as expected on older iOS and don't block
  the timer feature on it.
- **Web Locks API for a leader-election pattern** across tabs, following
  the pattern documented in the spec's own explainer: each tab tries to
  acquire a named lock for a given timer id; only the winner is
  responsible for scheduling the local fallback/showing the notification,
  avoiding duplicate notifications from multiple open tabs of the same
  recipe ([w3c/web-locks EXPLAINER.md](https://github.com/w3c/web-locks/blob/main/EXPLAINER.md)).
- **Server-side Web Push with VAPID** ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html)) as the backgrounded-delivery fallback: client posts the subscription
  and the timer's target timestamp to the backend at timer-start; backend
  schedules a precise-time job (a Cloudflare Durable Object alarm fits
  naturally here) and sends the push at fire time. Build the notification
  content into the push payload itself so the service worker's `push`
  handler can call `showNotification()` synchronously without any async
  work, minimizing the risk of hitting Apple's ~3-strikes revocation for
  slow/failed `userVisibleOnly` compliance.
- **Reconciliation on reopen**: because push delivery on Android can be
  delayed under deep Doze ([crbug.com/777106](https://bugs.chromium.org/p/chromium/issues/detail?id=777106)) and iOS push reliability has multiple anecdotal reports of silent
  failures across point releases (Apple Developer Forums [728796](https://developer.apple.com/forums/thread/728796?page=2), [769794](https://developer.apple.com/forums/thread/769794)), always reconcile timer state when the app is reopened - if a timer's
  target timestamp has already passed, show the "done" state immediately
  rather than assuming the push notification is what informed the user.
