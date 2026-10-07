import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Used by svelte-package, svelte-check and the unit tests. These compile the
 * components as ordinary Svelte components, the way a Svelte app consumes
 * them. The custom-element builds (vite.cdn.config.ts, vite.esm.config.ts)
 * set configFile: false and do not read this file.
 */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		/**
		 * ShowfmPlayer.svelte declares its element tag and attributes in
		 * <svelte:options customElement>, which only the element builds use.
		 * Compiled the ordinary way, Svelte warns that the option is unused.
		 * That is expected for this one file, so only that warning is muted.
		 * @param {import('svelte/compiler').Warning} warning
		 */
		warningFilter: (warning) =>
			!(
				warning.code === 'options_missing_custom_element' &&
				warning.filename?.endsWith('ShowfmPlayer.svelte')
			)
	}
};
