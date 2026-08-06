import { defineConfig } from '@playwright/test';

// Each run starts from an empty database. The server migrates on boot (see
// docs/adr/0002-generated-migrations-applied-on-boot.md), so clearing the file is the whole
// of the setup. It's part of the server command rather than module scope
// here because Playwright re-evaluates this config in every worker process -
// deleting from module scope would wipe the database out from under the
// already-running server. Kept out of the repo by .gitignore's `*.db` rule.
const E2E_DATABASE_URL = 'e2e.db';

export default defineConfig({
	webServer: {
		command: `rm -f ${E2E_DATABASE_URL} ${E2E_DATABASE_URL}-wal ${E2E_DATABASE_URL}-shm && pnpm run build && pnpm run preview`,
		port: 4173,
		env: { DATABASE_URL: E2E_DATABASE_URL },
		// Playwright would otherwise reuse a server already on this port off CI,
		// skipping the command above and running the suite against whatever
		// database that server happens to hold. Failing on a busy port is the
		// point: the reset is not optional.
		reuseExistingServer: false,
		// A cold `pnpm run build` on a CI runner outruns the 60s default.
		timeout: 180_000
	},
	testMatch: '**/*.e2e.{ts,js}'
});
