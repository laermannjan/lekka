import { describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { profiles } from '$lib/server/db/schema';
import { exportData } from '$lib/server/data-export';
import { actions } from './+page.server';

// The restore action reads an uploaded file, and a real household's export is
// far larger than anything else this app posts. The interesting failures are
// the ones that happen while the body is still being read - the adapter
// rejects an oversized upload before `restore` ever sees a file, and the page
// has to say so in its own words rather than let a raw 413 escape (#39).
describe('restore action', () => {
	// `restore` only reads `request`, so the rest of a RequestEvent would be
	// dead weight here.
	function restore(request: Pick<Request, 'formData'>) {
		return actions.restore({ request } as unknown as Parameters<typeof actions.restore>[0]);
	}

	function uploadOf(body: string): Pick<Request, 'formData'> {
		const data = new FormData();
		data.set('file', new File([body], 'lekka-export.json', { type: 'application/json' }));
		return { formData: async () => data };
	}

	// What `@sveltejs/kit`'s node request body reader errors the stream with
	// once an upload passes BODY_SIZE_LIMIT: an Error carrying a status, not
	// the `HttpError` that `isHttpError` recognizes.
	function payloadTooLarge(): Pick<Request, 'formData'> {
		return {
			formData: async () => {
				throw Object.assign(new Error('request body size exceeded BODY_SIZE_LIMIT of 524288'), {
					status: 413,
					text: 'Payload Too Large'
				});
			}
		};
	}

	it('restores an uploaded export', async () => {
		db.insert(profiles).values({ name: 'Jan' }).run();
		const dump = exportData();
		db.insert(profiles).values({ name: 'Intruder' }).run();

		const result = await restore(uploadOf(JSON.stringify(dump)));

		expect(result).toEqual({ restored: true });
		expect(db.select().from(profiles).all()).toHaveLength(1);
	});

	it('explains an upload the adapter rejected as too large', async () => {
		const result = await restore(payloadTooLarge());

		expect(result).toMatchObject({ status: 413 });
		expect((result as { data: { error: string } }).data.error).toMatch(/BODY_SIZE_LIMIT/);
	});

	it('rethrows a failure that is not the body limit', async () => {
		const boom = new Error('socket hung up');

		await expect(
			restore({
				formData: async () => {
					throw boom;
				}
			})
		).rejects.toBe(boom);
	});

	it('surfaces a friendly message for a dump it cannot read', async () => {
		const result = await restore(uploadOf('{"schemaVersion":999,"data":{}}'));

		expect(result).toMatchObject({ status: 400 });
		expect((result as { data: { error: string } }).data.error).toMatch(/schema version 999/);
	});
});
