/**
 * Build of the `load="click"` loader: `dist/cdn/click-loader.js`, and with
 * `--mode self-hosted` the self-hosting loader `dist/cdn/click-loader-local.js`,
 * which has no CDN default (src/cdn/click-loader.ts).
 *
 * A classic script meant to be pasted inline, so it is minified as far as
 * it goes; .size-limit.json holds it to its budget. It imports nothing.
 */
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
	// Folded at build time: each file carries only its own branch.
	define: { __SHOWFM_LOCAL__: String(mode === 'self-hosted') },
	build: {
		lib: {
			entry: 'src/cdn/click-loader.ts',
			formats: ['iife'],
			name: 'ShowfmClickLoader',
			fileName: () => (mode === 'self-hosted' ? 'click-loader-local.js' : 'click-loader.js')
		},
		// No "use strict" prologue: the loader uses nothing it changes, and
		// it is pasted inline, so its bytes count.
		rollupOptions: { output: { strict: false } },
		outDir: 'dist/cdn',
		emptyOutDir: false,
		target: 'es2020',
		minify: 'terser',
		terserOptions: { ecma: 2020, compress: { passes: 2 } }
	}
}));
