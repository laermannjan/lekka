# lekka

Self-hosted, household-shared recipe manager. See `CONTEXT.md` for the domain glossary and `docs/adr/` for stack/architecture decisions.

## Stack

SvelteKit (Node adapter) + SQLite (Drizzle ORM), packaged as a single Docker image. See `docs/adr/0001-sveltekit-sqlite-docker-stack.md` for why.

## Local development

Requires Node 24+ and [pnpm](https://pnpm.io) (via `corepack enable`).

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm run dev        # starts the dev server at http://localhost:5173
                     # (migrations run automatically against the local SQLite file)
```

Other useful scripts:

```sh
pnpm run check       # typecheck (svelte-check)
pnpm run lint         # prettier --check + eslint
pnpm run format       # prettier --write
pnpm run test:unit -- --run   # unit tests (vitest)
pnpm run test:e2e     # e2e tests (playwright, builds and previews the app)
pnpm run test         # both, the same thing CI runs
pnpm run db:generate  # generate a new migration after changing the schema
pnpm run db:migrate   # apply pending migrations to the local database by hand
                      # (the app does this itself on boot - see ADR-0002)
pnpm run db:studio    # Drizzle Studio, browse the local database
```

## Running via Docker

```sh
docker compose up --build
```

This builds the production image, runs it on `http://localhost:3000`, and persists the SQLite database in a named volume (`lekka-data`) mounted at `/app/data`.

If you deploy behind a different host/port (a reverse proxy, a non-default port, a real domain), update the `ORIGIN` env var in `docker-compose.yml` to match — SvelteKit's Node adapter uses it to validate form submissions and rejects them otherwise.
