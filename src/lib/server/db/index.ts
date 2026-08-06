import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

type Db = BetterSQLite3Database<typeof schema>;

let connection: Db | undefined;

// Opened on first use rather than at import time. SvelteKit's build-time route
// analysis imports every server module with no environment loaded, so a
// module-scope connection makes `vite build` fail anywhere DATABASE_URL isn't
// set - CI, a fresh clone, the Docker build. Nothing the build does ever
// touches `db`, so deferring the connection means the build never opens a
// database that isn't real, rather than being handed a throwaway one.
function connect(): Db {
	if (!connection) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

		const client = new Database(env.DATABASE_URL);
		client.pragma('foreign_keys = ON');
		connection = drizzle(client, { schema });
	}

	return connection;
}

// A Proxy so callers keep importing a plain `db` value: the laziness stays
// inside this module instead of turning every `db.select(...)` across the
// server into `getDb().select(...)`. Methods are bound to the real connection
// so `this` is never the proxy.
export const db: Db = new Proxy({} as Db, {
	get(_target, property) {
		const database = connect();
		const value = Reflect.get(database, property);

		return typeof value === 'function' ? value.bind(database) : value;
	}
});

// Called once from hooks.server.ts's `init`, not at import time - migrating
// during a build would touch a database that isn't real (see connect()).
export function runMigrations() {
	migrate(connect(), { migrationsFolder: 'drizzle' });
}
