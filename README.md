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
pnpm run seed         # WIPES the local database and writes one demo household
                      # (3 Profiles, 6 Recipes, a Variant, Scaling Formulas,
                      #  cook history). Ids are stable across runs.
```

## Running via Docker

```sh
docker compose up --build
```

This builds the production image, runs it on `http://localhost:3000`, and persists the SQLite database in a named volume (`lekka-data`) mounted at `/app/data`.

The container runs as the unprivileged `node` user (uid 1000). A volume created by an earlier, root-running build of this image is owned by root, so the server can't write to it after upgrading - it will fail with `SQLITE_READONLY` and, under `restart: unless-stopped`, crash-loop. Fix the ownership once, then start normally:

```sh
docker compose run --rm --user root lekka chown -R node:node /app/data
```

If you deploy behind a different host/port (a reverse proxy, a non-default port, a real domain), update the `ORIGIN` env var in `docker-compose.yml` to match — SvelteKit's Node adapter uses it to validate form submissions and rejects them otherwise.

### Environment variables

Defaults are the ones the Docker image sets (see `Dockerfile`); running the built server directly gets whatever you export yourself.

| Variable          | Default                                                           | What it does                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`          | (none)                                                            | The URL you reach the instance at, scheme + host + port. Required: without it every form submission is rejected as cross-site.                                                                     |
| `DATABASE_URL`    | `/app/data/lekka.db`                                              | Path to the SQLite file. Keep it on the mounted volume.                                                                                                                                            |
| `PORT`            | `3000`                                                            | Port the server listens on.                                                                                                                                                                        |
| `BODY_SIZE_LIMIT` | `64M` (set by the image; `512K` if you run `node build` yourself) | Largest request body accepted. Restoring a backup uploads the whole export in one request, so this has to clear your dump's size; raise it if a restore comes back saying the export is too large. |

If a reverse proxy sits in front of the instance, its own upload limit applies too (`client_max_body_size` in nginx, for example) and has to be raised alongside `BODY_SIZE_LIMIT`.
