/**
 * Build of the side-effect-free entry: `dist/server.js`.
 *
 * Only the pure modules (src/lib/modules.ts), so no Svelte plugin. The root
 * entry, dist/index.js, re-exports this file; scripts/build.mjs writes it.
 */
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		lib: {
			entry: 'src/server.ts',
			formats: ['es'],
			fileName: () => 'server.js'
		},
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2020',
		minify: true
	}
});
