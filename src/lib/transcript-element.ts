/**
 * `<showfm-transcript>` as v1.js registers it: a stub that costs v1.js a few
 * dozen bytes (lazy-element.ts). The transcript itself is a lazy chunk
 * (transcript.svelte.ts and Transcript.svelte), loaded the first time an
 * element connects, so a page with only a player loads none of it. A
 * `load="click"` transcript fetches nothing, not even the chunk, until
 * `showfm.load()` runs.
 */
import { defineLazy, lazyElement } from './lazy-element';

/** Registers the element. Called by element.ts (the source is marked side-effect free). */
export function defineShowfmTranscript() {
	defineLazy(
		'showfm-transcript',
		lazyElement(() => import('./transcript.svelte.js'), 'mountTranscript')
	);
}
