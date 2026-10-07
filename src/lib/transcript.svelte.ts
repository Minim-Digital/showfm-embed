/**
 * The transcript's lazy chunk: mounts Transcript.svelte into a
 * `<showfm-transcript>` element (transcript-element.ts registers the element
 * in v1.js and loads this on first connect). The player's transcript option
 * renders the same element inside the player.
 *
 * The element's attributes are read live into reactive props, and the
 * `strings` property works as it does on the player, including a value set
 * before the chunk arrived.
 */
import { mount, unmount } from 'svelte';
import Transcript from './Transcript.svelte';
import styles from './transcript.css?inline';

/**
 * Every attribute the transcript reads, and `load`, which the element reads
 * before this chunk is fetched (lazy-element.ts). The manifest is made from
 * this list (scripts/cem.mjs).
 */
const TRANSCRIPT_ATTRIBUTES = [
	'episode',
	'for',
	'height',
	'heading-level',
	'load',
	'theme',
	'accent',
	'api',
	'lang'
] as const;

// The host: a block that can reserve --showfm-height before it upgrades. A
// 404, or an episode with no transcript, collapses it. In the mini-player
// (class="panel") it is a panel above the bar's right end, or the last part
// of the phone sheet; its place is here so the mini-player's chunk stays small.
const HOST_CSS =
	':host{display:block;min-height:var(--showfm-height,0)}' +
	':host([data-showfm-collapsed]){display:none!important;min-height:0}' +
	':host(.panel){position:fixed;right:16px;bottom:calc(80px + var(--o,0px));' +
	'width:min(420px,calc(100vw - 32px));overflow:hidden;border:1px solid var(--pp-border);' +
	'border-radius:14px;box-shadow:0 8px 26px rgba(16,16,20,.14)}' +
	':host(.in-sheet){position:static;order:5;flex:1 1 100%;width:auto;box-shadow:none}' +
	'@media (max-width:640px){:host(.panel:not(.in-sheet)){display:none}}';

function readAttributes(host: HTMLElement): Record<string, string | null> {
	const attrs: Record<string, string | null> = {};
	for (const name of TRANSCRIPT_ATTRIBUTES) attrs[name] = host.getAttribute(name);
	return attrs;
}

/**
 * Mounts the transcript into `host`. Returns the function the element calls
 * on disconnect (false) and reconnect (true).
 */
export function mountTranscript(host: HTMLElement): (connected: boolean) => void {
	const element = host as HTMLElement & { strings?: unknown };
	// A value set before the chunk arrived is an own property: take it over.
	const early = Object.prototype.hasOwnProperty.call(element, 'strings')
		? element.strings
		: undefined;
	delete element.strings;
	const props = $state({ host, attrs: readAttributes(host), strings: early });
	Object.defineProperty(element, 'strings', {
		configurable: true,
		get: () => props.strings,
		set: (value: unknown) => (props.strings = value)
	});

	const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = HOST_CSS + styles;
	root.append(style);

	const observer = new MutationObserver(() => (props.attrs = readAttributes(host)));
	let app: Record<string, unknown> | null = null;
	const connect = () => {
		props.attrs = readAttributes(host);
		observer.observe(host, { attributes: true, attributeFilter: [...TRANSCRIPT_ATTRIBUTES] });
		// The page's language can change too (the transcript follows <html lang>).
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
		app = mount(Transcript, { target: root, props });
	};
	connect();

	return (connected) => {
		if (connected && !app) connect();
		else if (!connected && app) {
			observer.disconnect();
			void unmount(app);
			app = null;
		}
	};
}
