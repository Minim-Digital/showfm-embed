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
import { minify } from 'terser';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
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

/**
 * The elements mount their components fresh and never hydrate server HTML,
 * so Svelte's hydration flag is pinned to false. Rollup then drops every
 * hydration branch in the runtime, in v1.js and in the chunks alike.
 * The build fails if Svelte changes the lines this relies on.
 */
const noHydration: Plugin = {
	name: 'no-hydration',
	transform(code, id) {
		if (!id.replace(/\\/g, '/').endsWith('/svelte/src/internal/client/dom/hydration.js'))
			return null;
		const pinned = code
			.replace('export let hydrating = false;', 'export const hydrating = false;')
			.replace(/(export function set_hydrating\(value\) \{)\s*hydrating = value;/, '$1');
		if (!pinned.includes('export const hydrating = false;') || /\bhydrating = value/.test(pinned)) {
			throw new Error('no-hydration: svelte/src/internal/client/dom/hydration.js has changed');
		}
		return { code: pinned, map: null };
	}
};

/** Where every lazy chunk registers itself, shared by every copy on the page. */
const CHUNK_REGISTRY = "Symbol.for('showfm.chunks.v1')";

/**
 * v1.js is a classic script, and classic scripts cannot share code with a
 * second file the way modules can. So the bundle is built as CommonJS, which
 * Rollup can split, and each file is then wrapped to run without a module
 * system:
 *
 * - v1.js runs at once inside a function. Its `exports` object holds the
 *   bindings the lazy chunks import from it (the Svelte runtime and the
 *   shared modules), so a chunk carries only its own code. Rollup keeps
 *   those exports live: it re-assigns `exports.x` whenever `x` changes.
 * - A dynamic `import()` is rendered as the chunk's path, which the
 *   element's loader (lazy-element.ts) adds as a script next to v1.js.
 * - A lazy chunk registers a factory under CHUNK_REGISTRY, keyed by its
 *   hashed file name. The loader runs it with v1.js's exports. The npm root
 *   (scripts/build.mjs) carries the chunks inline, so their factories are
 *   registered before anything asks and nothing is fetched.
 *
 * The hash in the file name keeps a cached v1.js from running a newer
 * chunk: the chunk it asks for is the one it was built with.
 *
 * Each wrapped file is mangled once more, so `exports` and `require` become
 * local short names: the files read as plain scripts (to publint as well)
 * and come out a little smaller.
 */
const classicChunks: Plugin = {
	name: 'classic-chunks',
	renderDynamicImport() {
		return { left: '(', right: ')' };
	},
	async generateBundle(_options, bundle) {
		for (const file of Object.values(bundle)) {
			if (file.type !== 'chunk') continue;
			let code: string;
			if (file.isEntry) {
				code = `!function(){"use strict";var exports={};\n${file.code}\n}();\n`;
			} else {
				const shared = file.imports.filter((name) => name !== 'v1.js');
				if (shared.length) {
					throw new Error(`${file.fileName} imports ${shared.join(', ')}; only v1.js is shared`);
				}
				code =
					`(globalThis[${CHUNK_REGISTRY}]||(globalThis[${CHUNK_REGISTRY}]={}))[${JSON.stringify(file.fileName)}]=function(require,exports){\n` +
					file.code +
					'\n};\n';
			}
			const mangled = await minify(code, { ecma: 2020, compress: false, mangle: true });
			file.code = mangled.code! + '\n';
		}
	}
};

export default defineConfig({
	plugins: [
		lazyLocales,
		noHydration,
		classicChunks,
		svelte({
			configFile: false,
			preprocess: [vitePreprocess(), minifyStyles],
			compilerOptions: { customElement: true },
			// The episode list, the play button, the mini-player and the
			// transcript are mounted into their elements by hand
			// (episodes.svelte.ts, play.svelte.ts, transcript.svelte.ts), so they
			// need no custom-element wrapper; their CSS still goes into the
			// shadow root they are mounted in.
			dynamicCompileOptions: ({ filename }) =>
				/\/(EpisodeList|PlayButton|MiniPlayer|Transcript)\.svelte$/.test(filename)
					? { customElement: false, css: 'injected' }
					: undefined
		})
	],
	build: {
		lib: {
			entry: 'src/lib/element.ts',
			formats: ['cjs'],
			fileName: () => 'v1.js'
		},
		rollupOptions: {
			// Lets v1.js export what the chunks share, instead of Rollup moving
			// the shared code into a third file.
			preserveEntrySignatures: 'allow-extension',
			output: {
				// episodes.svelte.ts → chunks/episodes-[hash].js, play.svelte.ts →
				// chunks/play-[hash].js, transcript.svelte.ts → chunks/transcript-[hash].js
				chunkFileNames: (chunk) => `chunks/${chunk.name.replace(/\.svelte$/, '')}-[hash].js`,
				exports: 'named',
				// Short names for the bindings v1.js shares with the chunks.
				minifyInternalExports: true
			}
		},
		outDir: 'dist/cdn',
		sourcemap: !!process.env.SOURCEMAP,
		emptyOutDir: true,
		target: 'es2020',
		// terser packs this bundle about 2 kB (gzipped) smaller than esbuild,
		// which keeps the classic script inside its size budget.
		minify: 'terser',
		terserOptions: { ecma: 2020, compress: { passes: 2 } }
	}
});
