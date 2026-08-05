// Manually-triggered whole-instance data export (see #16, #31) - a plain
// GET download rather than a form action, since there's no user input, just
// a file to hand back.
import type { RequestHandler } from './$types';
import { exportData } from '$lib/server/data-export';

export const GET: RequestHandler = () => {
	const dump = exportData();
	const filename = `lekka-export-${dump.exportedAt.slice(0, 10)}.json`;

	return new Response(JSON.stringify(dump, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
