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
