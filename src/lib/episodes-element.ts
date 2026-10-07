/**
 * `<showfm-episodes>` as v1.js registers it: a stub that costs v1.js a few
 * hundred bytes (lazy-element.ts). The list itself is a lazy chunk
 * (episodes.svelte.ts and EpisodeList.svelte), loaded the first time an
 * element connects. A `load="click"` list fetches nothing, not even the
 * chunk, until its facade is pressed or `showfm.load()` runs.
 */
import { defineLazy, lazyElement } from './lazy-element';

/** Registers the element. Called by element.ts (the source is marked side-effect free). */
export function defineShowfmEpisodes() {
	defineLazy(
		'showfm-episodes',
		lazyElement(() => import('./episodes.svelte.js'), 'mountEpisodes')
	);
}
