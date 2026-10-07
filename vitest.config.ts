import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	test: {
		projects: [
			{
				// The player's own tests. Svelte compiles the components the
				// ordinary way here (svelte.config.js, no customElement), as the
				// show.fm app's test suite did.
				plugins: [svelte()],
				resolve: { conditions: ['browser'] },
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
					environment: 'jsdom',
					// Testing Library's automatic cleanup between tests hooks into
					// the global afterEach, as in the show.fm app's config.
					globals: true,
					setupFiles: ['./src/test-setup.ts'],
					// axe passes over the whole player take seconds in jsdom.
					testTimeout: 15_000
				}
			},
			{
				// Contract tests against the BUILT files in dist/. Run `pnpm build`
				// first; CI runs them after the build step. The Svelte plugin is
				// here for the @showfm/embed/svelte test, which compiles the
				// shipped .svelte source as a consuming Svelte app would.
				plugins: [svelte()],
				resolve: { conditions: ['browser'] },
				test: {
					name: 'contract',
					include: ['tests/contract/**/*.test.ts'],
					environment: 'jsdom',
					globals: true,
					setupFiles: ['./src/test-setup.ts']
				}
			}
		]
	}
});
