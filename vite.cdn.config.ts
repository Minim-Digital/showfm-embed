/**
 * Classic-script build of the player: `dist/cdn/v1.js`.
 *
 * This is the file served as /player/v1.js. It mirrors the build the show.fm
 * app used before the player moved here, option for option, so the output is
 * the same script. configFile: false keeps it independent of svelte.config.js:
 * only this build (and the ESM build) compiles with customElement: true.
 * Versioning: compatible changes update v1.js in place; breaking player
 * changes ship as a new v2 entry.
 */
import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [
		svelte({
			configFile: false,
			preprocess: vitePreprocess(),
			compilerOptions: { customElement: true }
		})
	],
	build: {
		lib: {
			entry: 'src/lib/element.ts',
			formats: ['iife'],
			name: 'PodcasterPlusPlayer',
			fileName: () => 'v1.js'
		},
		outDir: 'dist/cdn',
		emptyOutDir: true,
		target: 'es2020',
		minify: true
	}
});
