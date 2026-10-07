/**
 * ESM build of the package root: `dist/index.js`.
 *
 * Importing it registers the elements (a side effect, like loading v1.js) and
 * gives access to the pure modules and the height constants. Svelte is
 * bundled in, not left external: the compiled elements depend on Svelte's
 * internal runtime, which must match the compiler that built them.
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
			entry: 'src/index.ts',
			formats: ['es'],
			fileName: () => 'index.js'
		},
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2020',
		minify: true
	}
});
