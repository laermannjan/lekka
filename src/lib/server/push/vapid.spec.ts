import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '../db';
import { vapidKeys } from '../db/schema';
import { _resetVapidCacheForTests, getVapidKeys } from './vapid';

describe('vapid keys', () => {
	beforeEach(() => {
		db.delete(vapidKeys).run();
		_resetVapidCacheForTests();
	});

	it('generates and persists a keypair on first use', () => {
		const keys = getVapidKeys();

		expect(keys.publicKey).toBeTruthy();
		expect(keys.privateKey).toBeTruthy();
		expect(db.select().from(vapidKeys).all()).toHaveLength(1);
	});

	it('reuses the persisted keypair on subsequent calls', () => {
		const first = getVapidKeys();
		const second = getVapidKeys();

		expect(second.publicKey).toBe(first.publicKey);
		expect(db.select().from(vapidKeys).all()).toHaveLength(1);
	});
});
