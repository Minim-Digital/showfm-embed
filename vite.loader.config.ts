/**
 * Build of the `load="click"` loader: `dist/cdn/click-loader.js`.
 *
 * A classic script meant to be pasted inline, so it is minified as far as
 * it goes; .size-limit.json holds it to its budget. It imports nothing.
 */
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		lib: {
			entry: 'src/cdn/click-loader.ts',
			formats: ['iife'],
			name: 'ShowfmClickLoader',
			fileName: () => 'click-loader.js'
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
});
