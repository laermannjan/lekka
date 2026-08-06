import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './index';
import { sql } from 'drizzle-orm';

afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

describe('db', () => {
	it('connects and can run a query', () => {
		const result = db.get<{ value: number }>(sql`select 1 as value`);
		expect(result).toEqual({ value: 1 });
	});

	// `vite build`'s route analysis imports every server module with no
	// environment loaded, so importing this one must never need a DATABASE_URL.
	it('imports without a DATABASE_URL and only fails once the database is used', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));

		const module = await import('./index');

		expect(() => module.db.get(sql`select 1 as value`)).toThrow('DATABASE_URL is not set');
	});
});
