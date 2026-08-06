---
date: 2026-08-05
---

# SvelteKit + SQLite + Docker

lekka is a self-hostable, single-household recipe manager whose one binding architecture constraint (#16) is a persistent, wakeable server process able to hold Web Push subscriptions and fire exact-time push (VAPID/RFC 8292) for Step timers. We chose TypeScript throughout, SvelteKit with the Node adapter as that single persistent process, SQLite via Drizzle ORM, and one Docker image, because that satisfies the persistent-process constraint by default and needs no separate database service to self-host.

- **SvelteKit (Node adapter)**: one language and one process for both UI and API. The Node server can host an in-process scheduler for exact-time push without a separate worker or queue service. Good fit for a form-heavy recipe-editing UI.
- **SQLite (Drizzle ORM)**: a single household's data fits SQLite's write-concurrency envelope easily and needs no separate database service, one less moving part for a single-instance deploy. Drizzle gives typed queries and migrations without an ORM's usual weight.
- **Docker**: single image plus `docker-compose.yml`, matching the self-hosted norm (VPS/NAS/homelab). The SQLite file lives on a mounted volume.
- **pnpm**: fast, disk-efficient, standard for SvelteKit projects.

## Considered options

- **Next.js + Postgres**: larger ecosystem, but needs a separate Postgres container and more explicit setup to guarantee a genuinely persistent long-running process, which SvelteKit's Node adapter is by default.
- **Fastify API + separate SPA**: a more explicit "this is a persistent server" split, but more scaffolding and glue for no real benefit at this scale. A meta-framework already puts API and UI in one process.
- **Any serverless or static-only hosting** (Vercel Functions, Cloudflare Workers/Pages): ruled out by the Web Push constraint, since these cannot hold a long-lived process to fire exact-time notifications.

## Consequences

The Web Push requirement is real friction against "easily self-hostable" - a plain static file server is no longer an option. Flagged on #16's Further Notes as an open tension, deliberately not resolved here.
