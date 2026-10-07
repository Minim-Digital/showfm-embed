/**
 * Standalone entry for the embeddable player bundle.
 *
 * Built by `pnpm build` (vite.cdn.config.ts, customElement: true) into
 * dist/cdn/v1.js, and into the ESM entry (vite.esm.config.ts). Importing the
 * component registers <showfm-player> via the tag in its <svelte:options>.
 *
 * <podcasterplus-player> is the pre-rebrand element name. Embed snippets are
 * copy-pasted into pages we cannot edit, so the old tag must keep upgrading
 * forever. It registers as a subclass alias because a custom-element
 * constructor may only be passed to customElements.define once.
 */
import ShowfmPlayer from './ShowfmPlayer.svelte';

// The `element` static only exists in the customElement build (and svelte-check
// types the component without it), hence the cast and the runtime guard.
const element = (ShowfmPlayer as unknown as { element?: typeof HTMLElement }).element;
if (element && !customElements.get('podcasterplus-player')) {
	customElements.define('podcasterplus-player', class extends element {});
}
