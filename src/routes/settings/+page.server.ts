import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { InvalidExportError, restoreData } from '$lib/server/data-export';

export const actions: Actions = {
	// Restore fully replaces whatever is currently in the instance - no
	// merge, no dedup (see #31). Deliberately no confirmation dialog beyond
	// the browser's native file picker; the page's own copy warns the user.
	restore: async ({ request }) => {
		let data: FormData;
		try {
			data = await request.formData();
		} catch (error) {
			if (isPayloadTooLarge(error)) {
				return fail(413, {
					error:
						'That export is larger than this instance accepts. Raise the BODY_SIZE_LIMIT env var and restore again.'
				});
			}
			throw error;
		}

		const file = data.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose an export file to restore.' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			return fail(400, { error: 'That file is not valid JSON.' });
		}

		try {
			restoreData(parsed);
		} catch (error) {
			if (error instanceof InvalidExportError) {
				return fail(400, { error: error.message });
			}
			throw error;
		}

		return { restored: true };
	}
};

// An upload past BODY_SIZE_LIMIT is rejected by the adapter while the body is
// still streaming, so it surfaces as `request.formData()` rejecting rather
// than as anything the action can inspect first. The rejection is a
// `SvelteKitError` - an Error carrying a status, not the `HttpError` that
// `isHttpError` recognizes - so match it structurally (#39).
function isPayloadTooLarge(error: unknown): boolean {
	return (
		error instanceof Error && 'status' in error && (error as { status: unknown }).status === 413
	);
}
