/**
 * Classic-script build of the player: `dist/cdn/v1.js`.
 *
 * This is the file served as /player/v1.js. It started as the build the
 * show.fm app used before the player moved here, option for option. Since
 * 1.1 it minifies the component CSS and uses terser, to stay inside the
 * 30 kB budget. configFile: false keeps it independent of svelte.config.js:
 * only this build (and the ESM build) compiles with customElement: true.
 * Versioning: compatible changes update v1.js in place; breaking player
 * changes ship as a new v2 entry.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig, transformWithEsbuild } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Minifies each component's CSS before Svelte scopes it. Custom elements
 * carry their CSS as a string inside the script, which the JS minifier
 * leaves as written, so without this every comment and indent ships.
 */
const minifyStyles = {
	name: 'minify-styles',
	style: async ({ content, filename }: { content: string; filename?: string }) => {
		const result = await transformWithEsbuild(content, `${filename ?? 'component'}.css`, {
			loader: 'css',
			minify: true,
			// Keep the output to syntax every browser the player supports reads.
			target: ['chrome87', 'edge88', 'firefox78', 'safari14']
		});
		return { code: result.code };
	}
};

/**
 * The CDN script carries English only: strings.ts's bundled locales
 * (locales/index.ts) become locales/lazy.ts, which loads German and French
 * from dist/cdn/locales/ when an element needs them.
 */
const lazyLocales = {
	name: 'lazy-locales',
	enforce: 'pre' as const,
	resolveId(source: string, importer?: string) {
		if (/^\.\/locales\/index(\.js)?$/.test(source) && importer) {
			return fileURLToPath(new URL('./src/lib/locales/lazy.ts', import.meta.url));
		}
		return null;
	}
};

export default defineConfig({
	plugins: [
		lazyLocales,
		svelte({
			configFile: false,
			preprocess: [vitePreprocess(), minifyStyles],
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
		// terser packs this bundle about 2 kB (gzipped) smaller than esbuild,
		// which keeps the classic script inside its size budget.
		minify: 'terser',
		terserOptions: { ecma: 2020, compress: { passes: 2 } }
	}
});
