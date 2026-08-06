import { defineConfig, devices } from '@playwright/test';

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
	testMatch: '**/*.e2e.{ts,js}',
	// A failing e2e run on CI otherwise leaves nothing behind but a log line.
	// Retrying once and tracing that retry keeps the cost at zero for a green
	// run while making a red one debuggable: the trace viewer replays the DOM,
	// network and console at every step. `.github/workflows/ci.yml` uploads
	// both directories when the step fails.
	retries: process.env.CI ? 2 : 0,
	use: { trace: 'on-first-retry' },
	reporter: [['list'], ['html', { open: 'never' }]],
	// The only browser this suite runs. Declared rather than left to
	// Playwright's default so `test:e2e` can install just this one instead of
	// downloading chromium, firefox and webkit on every CI run. Adding a
	// browser here means adding it to that script too, and forgetting fails
	// loudly - Playwright names the missing executable and how to install it.
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
