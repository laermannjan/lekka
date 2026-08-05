# Decisions

## Cook logging: record the current Version id, don't remap Cook Log Annotations across reverts (2026-08-06)

**Context**: #29 asked for logging a Cook (date, Version/Composition used, acting Profile, Diners present, outcome, summary) and Cook Log Annotations pinned to a specific Step or Ingredient Usage within a Cook, with the hard constraint that logging never mutates the Recipe.

**Decision**: `logCook` looks up the Recipe's already-most-recent `recipe_versions` row and stores its id - it never calls `recordVersion`, so a Cook is guaranteed to never create a Version as a side effect. `cook_log_annotations.step_id`/`ingredient_usage_id` are plain foreign keys onto the live `steps`/`ingredient_usages` tables (`onDelete: 'cascade'`), the same shape `scaling_formulas` already uses for its exactly-one-target Step/Usage reference.

**Consequence, accepted**: unlike `scaling_formulas` (which `revertToVersion` explicitly remaps to the newly-inserted rows via its id-map), a Cook Log Annotation is _not_ remapped on revert - `revertToVersion` deletes and re-inserts every Step/Composition with new ids, so an Annotation pinned before a revert cascades away with the Step/Usage row it pointed at. A Cook's own summary/outcome/diners survive any Recipe edit (they don't reference Step/Usage rows), but per-Step/Usage Annotations are scoped to "as the Recipe currently stands," not preserved independent of later edits.

**Rejected**: teaching `cook_log_annotations` to survive a revert the way `scaling_formulas` does. `revertToVersion`'s remap only exists because a Recipe's own Version snapshot is self-contained by definition; wiring Cooks (a separate, append-only history that's explicitly never touched by Recipe edits) into that remap would mean tracking a second cross-cutting id-map anywhere Steps/Usages get recreated, for a case the acceptance criteria didn't ask for.

## Stack: SvelteKit + SQLite + Docker (2026-08-05)

**Context**: lekka is a self-hostable, single-household recipe manager (see `CONTEXT.md`). The one binding architecture constraint (from #16): a persistent, wakeable server process able to hold Web Push subscriptions and fire exact-time push (VAPID/RFC 8292) for Step timers — this rules out pure static/serverless-only hosting.

**Decision**: TypeScript throughout, SvelteKit with the Node adapter as the single persistent server process, SQLite via Drizzle ORM as the database, shipped as one Docker image.

- **Framework — SvelteKit (Node adapter)**: one language and one process for both UI and API, satisfying the persistent-process constraint directly (the Node server can host an in-process scheduler for exact-time push later, without a separate worker/queue service). Good fit for a form-heavy recipe-editing UI.
- **Database — SQLite (Drizzle ORM)**: a single household's data easily fits SQLite's write-concurrency envelope, and it needs no separate database service to self-host — one less moving part for a FOSS single-instance deploy. Drizzle gives typed queries and migrations without an ORM's usual weight.
- **Hosting — Docker**: single image + `docker-compose.yml`, matching the self-hosted norm (VPS/NAS/homelab). The SQLite file lives on a mounted volume.
- **Package manager — pnpm**: fast, disk-efficient, standard for SvelteKit projects.

**Rejected alternatives**:

- **Next.js + Postgres**: larger ecosystem, but needs a separate Postgres container (extra moving part for a single-household self-host) and requires more explicit setup to guarantee a genuinely persistent long-running server process (vs. SvelteKit's Node adapter, which is one by default).
- **Fastify API + separate SPA**: more explicit "this is clearly a persistent server" split, but more scaffolding/glue for no real benefit at this scale — a meta-framework already gets both API and UI in one process.
- **Any serverless/static-only hosting** (Vercel Functions, Cloudflare Workers/Pages, etc.): explicitly ruled out by the Web Push architecture constraint — these platforms cannot hold a long-lived process to fire exact-time notifications.

**Open tension, deliberately not resolved here**: the Web Push requirement is real friction against "easily self-hostable" — a plain static file server is no longer an option. Flagged on the domain spec's Further Notes; whoever builds the actual push-scheduler ticket should re-check this holds.

## Schema migrations: drizzle-kit generate + migrate-on-boot, not db:push (2026-08-05)

**Context**: #18 (Profile picker) is the first ticket to add a real table, surfacing how the schema actually reaches a running SQLite file. The scaffold (#17) had only documented `drizzle-kit push` as a manual dev step.

**Decision**: schema changes are captured as versioned SQL migration files (`pnpm run db:generate`, checked into `drizzle/`), applied automatically via `drizzle-orm`'s `migrate()` at server startup (`src/lib/server/db/index.ts`). `db:push` is dropped from the documented workflow.

**Why**: `drizzle-kit push` is a prototyping tool that diffs schema against a live DB and isn't meant for production use, and self-hosters have no CLI access to a running container to apply it anyway. Migrate-on-boot means a self-hoster who pulls a new image and restarts the container gets their schema updated with no manual step — matching the "self-hosting shouldn't be fragile" goal from #16.

## Step timers: client-side only in v1, no persistence, no notifications (2026-08-05)

**Context**: #24 (Step timers, client) asked for start/run/manually-finish timers on any Step carrying a Duration, with a compact active-timer count, an on-demand panel, and running state synced between the Step card and the panel. Prior research (`research/pwa-timer-notifications` branch, folded into this decision) established that a pure client-side timer cannot reliably notify a user once the tab is hidden or the phone is locked — every engine throttles/suspends background timers, and the only mechanism that reliably wakes something up while the app isn't running is server-side Web Push, which the stack decision above already anticipates as a later, separate piece of work.

**Decision**: ship the "screen on, actively cooking" case only for #24: a single `TimerStore` (`src/lib/timers.svelte.ts`, wrapping pure state-transition functions in `src/lib/timer-engine.ts`) scoped to the recipe page, holding an absolute wall-clock target timestamp per timer (`Date.now() + durationSec * 1000`) rather than a tick-decremented countdown, recomputed from the clock on every tick so Chrome/Firefox timer throttling only delays the _redraw_, not the actual target time. No push notifications, no service worker, no persistence across reload or navigation - state lives in page memory only, matching the ticket's literal scope. A timer counts down from a Step's Duration `min` (always present) rather than `max` (optional) or an average, since `min` needs no additional business rule to pick.

**Rejected for this ticket**: `Notification`/`showNotification()` local alerts (still fails the "phone locked" case per the research, so it would create a false impression of reliability without solving the real problem); persisting timer state server-side or in `localStorage` (no acceptance criterion asked for surviving a reload, and it would blur the line with the future Web Push ticket's own state model, which needs to be authoritative once it exists).

**Deferred, tracked separately**: the server-side Web Push component (VAPID subscriptions + a precise-time scheduler, e.g. a Durable Object alarm) for "notify me while my phone is locked" - not part of #24's acceptance criteria, and building it now would be scope creep against a ticket titled "(client)".

## Web Push timer notifications: in-process `setTimeout` scheduler, DB-persisted VAPID keys (2026-08-06)

**Context**: #27 asked for the server-side Web Push fallback the two decisions above deferred - a running Step timer must still notify when the phone is locked or the app is backgrounded, per `docs/research/pwa-timer-notifications.md`'s finding that only server-fired Web Push (VAPID/RFC 8292) is spec-guaranteed to work in that case. The research doc's own suggested architecture leaned on a Cloudflare Worker + Durable Object alarm, but that predates (and is superseded by) the actual stack decision above: SvelteKit's Node adapter as one persistent process.

**Decision**:

- **Scheduler is a plain in-process `setTimeout`, not a separate queue/worker** (`src/lib/server/push/scheduler.ts`): lekka's server is already the single persistent Node process the stack decision chose specifically to support this, so a Durable Object alarm (or any external scheduler) would be an extra moving part solving a problem the stack already solves. Every scheduled push is also written to a `scheduled_pushes` row; `initScheduler()` re-arms every still-pending row from the DB on boot (firing overdue ones immediately) so a server restart never silently drops a fire - the in-memory `setTimeout` is a performance/precision detail, the DB row is the durable source of truth.
- **VAPID keypair is generated once and persisted in a `vapid_keys` table**, not supplied via env var (`src/lib/server/push/vapid.ts`): a self-hoster who never touches configuration still gets working push, matching the migrate-on-boot decision's "self-hosting shouldn't be fragile" goal above. A subscription is bound to the public key that created it, so this key must stay stable across restarts - hence persisted, not regenerated per boot.
- **Push subscriptions are per-device, not per-Profile** (`push_subscriptions` table, keyed by unique `endpoint`): notification permission and the resulting endpoint/keys are a browser/device fact, not a household-member fact - matching Profile's no-privacy-walls model (see CONTEXT.md's Profile). The client stores its own subscription id in `localStorage` and hands it back on every schedule/cancel call rather than the server deriving it from a session.
- **Notification content is built entirely server-side and put in the push payload** (`title`/`body`/`tag` on `scheduled_pushes`): the service worker's `push` handler (`static/sw.js`) calls `showNotification()` synchronously with no async work first, avoiding Apple's ~3-strikes `userVisibleOnly` revocation the research doc flags.
- **Manual "Finish timer" cancels the pending push** (`cancelTimerPush`, wired into both Finish buttons in `+page.svelte`): otherwise a stale push could arrive after the user already handled the timer by hand.
- **PWA installability (`static/manifest.json`, `apple-mobile-web-app-capable` meta) ships alongside push**, not as a separate ticket: iOS Safari's `Notification`/`Push` APIs are undefined until the app is Home-Screen-installed, so push is non-functional on iOS without it.

**Rejected alternatives**:

- **Cloudflare Worker + Durable Object alarm** (the research doc's original suggestion): written before the stack decision landed; once SvelteKit's Node adapter was chosen as one persistent process, an external scheduler service is redundant complexity, not an improvement.
- **A `setInterval` polling loop over `scheduled_pushes`** instead of per-row `setTimeout`: would add a fixed delivery-latency floor (the poll interval) for no benefit - `setTimeout` gives exact-time firing directly and cook timers are nowhere near its ~24.8 day overflow ceiling.
- **VAPID keys via env var**: simpler code, but pushes the "must not lose this or every subscription breaks" burden onto the self-hoster's deployment config instead of the app; DB persistence keeps it inside the same backup story as everything else (the SQLite volume).
