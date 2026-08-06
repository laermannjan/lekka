import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// Every spec in the repo runs here, in node. There is no
					// component-test project yet, so nothing excludes
					// `*.svelte.spec.ts`: an exclusion with no second project behind
					// it silently drops such a test instead of failing the moment
					// someone writes one.
					include: ['src/**/*.{test,spec}.{js,ts}'],
					setupFiles: ['src/lib/server/db/test-setup.ts'],
					// All server specs share one SQLite file (see test-setup.ts) with no
					// per-file isolation; running files in parallel races their
					// beforeEach table clears against each other.
					fileParallelism: false
				}
			}
		]
	}
});
