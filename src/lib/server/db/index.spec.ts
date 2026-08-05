import { describe, expect, it } from 'vitest';
import { db } from './index';
import { sql } from 'drizzle-orm';

describe('db', () => {
	it('connects and can run a query', () => {
		const result = db.get<{ value: number }>(sql`select 1 as value`);
		expect(result).toEqual({ value: 1 });
	});
});
