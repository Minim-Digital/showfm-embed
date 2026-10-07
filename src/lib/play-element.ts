/**
 * `<showfm-play>` and `<showfm-mini-player>` as v1.js registers them: stubs
 * (lazy-element.ts) for one lazy chunk, play.svelte.ts, which holds the play
 * button and the page's mini-player.
 *
 * The mini-player is never written by hand. When an element that wants it
 * starts playing (a play button by default, a list with mini-player="on"),
 * it dispatches a bubbling `showfm:mini-player` event. The first one adds a
 * `<showfm-mini-player>` to the end of the body, which loads the chunk; it
 * stays the page's one mini-player and follows the page's shared audio.
 */
import { defineLazy, lazyElement } from './lazy-element';

/** The mini-player element, before and after its chunk has mounted. */
type MiniPlayerHost = HTMLElement & {
	/** The element that opened it, kept until the chunk is here. */
	showfmOpener?: Element;
	/** Set by the chunk once mounted. */
	showfmOpen?: (opener: Element) => void;
};

const chunk = () => import('./play.svelte.js');

function openMiniPlayer(event: Event) {
	let mini = document.querySelector<MiniPlayerHost>('showfm-mini-player');
	if (!mini) {
		mini = document.createElement('showfm-mini-player');
		document.body.append(mini);
	}
	const opener = event.target as Element;
	if (mini.showfmOpen) mini.showfmOpen(opener);
	else mini.showfmOpener = opener;
}

/** Registers both elements. Called by element.ts (the source is marked side-effect free). */
export function defineShowfmPlay() {
	defineLazy('showfm-play', lazyElement(chunk, 'mountPlay'));
	// Only the copy that defines the mini-player listens, so a page with two
	// copies of the script still gets one.
	if (defineLazy('showfm-mini-player', lazyElement(chunk, 'mountMiniPlayer'))) {
		document.addEventListener('showfm:mini-player', openMiniPlayer);
	}
}
