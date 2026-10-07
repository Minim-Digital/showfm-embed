/**
 * Standalone entry for the embeddable player bundle.
 *
 * Built by `pnpm build` (vite.cdn.config.ts, customElement: true) into
 * dist/cdn/v1.js, which the package root also runs (scripts/build.mjs).
 *
 * Each element registers only if its name is free. A page can already hold
 * an older copy (another CDN script, or an npm build that predates an
 * element): that copy keeps the elements it defined, and this one adds the
 * ones it lacks, such as <showfm-episodes> or <showfm-play>.
 *
 * <podcasterplus-player> is the pre-rebrand element name. Embed snippets are
 * copy-pasted into pages we cannot edit, so the old tag must keep upgrading
 * forever. It registers as a subclass alias because a custom-element
 * constructor may only be passed to customElements.define once.
 */
import ShowfmPlayer from './ShowfmPlayer.svelte';
import { defineShowfmEpisodes } from './episodes-element';
import { defineShowfmPlay } from './play-element';
import { defineShowfmTranscript } from './transcript-element';

// The `element` static only exists in the customElement build (and svelte-check
// types the component without it), hence the cast and the runtime guard.
const element = (ShowfmPlayer as unknown as { element?: typeof HTMLElement }).element;
if (element && !customElements.get('showfm-player')) {
	customElements.define('showfm-player', element);
}
if (element && !customElements.get('podcasterplus-player')) {
	customElements.define('podcasterplus-player', class extends element {});
}

// showfm.load() upgrades every load="click" facade at once, for consent
// tools. The inline click loader defines it first when it is on the page
// (it also has to add this script); otherwise this one only tells the
// elements already here.
const showfm = ((window as unknown as { showfm?: { load?: () => void } }).showfm ??= {});
showfm.load ??= () => document.dispatchEvent(new Event('showfm:load'));

defineShowfmEpisodes();
defineShowfmPlay();
defineShowfmTranscript();
