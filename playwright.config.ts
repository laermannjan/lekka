import { defineConfig } from '@playwright/test';

// Each run starts from an empty database. The server migrates on boot (see
// docs/decisions.md, "Schema migrations"), so clearing the file is the whole
// of the setup. It's part of the server command rather than module scope
// here because Playwright re-evaluates this config in every worker process -
// deleting from module scope would wipe the database out from under the
// already-running server. Kept out of the repo by .gitignore's `*.db` rule.
const E2E_DATABASE_URL = 'e2e.db';

export default defineConfig({
	webServer: {
		command: `rm -f ${E2E_DATABASE_URL} ${E2E_DATABASE_URL}-wal ${E2E_DATABASE_URL}-shm && npm run build && npm run preview`,
		port: 4173,
		env: { DATABASE_URL: E2E_DATABASE_URL }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
