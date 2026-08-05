# Decisions

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
