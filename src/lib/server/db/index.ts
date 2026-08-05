import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);

export const db = drizzle(client, { schema });

// Called once from hooks.server.ts's `init`, not at import time — SvelteKit's
// build-time module analysis imports this file without DATABASE_URL set,
// and migrating during `vite build` would touch a database that isn't real.
export function runMigrations() {
	migrate(db, { migrationsFolder: 'drizzle' });
}
