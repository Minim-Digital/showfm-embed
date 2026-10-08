/**
 * The episode list's lazy chunk: mounts EpisodeList.svelte into a
 * `<showfm-episodes>` element (episodes-element.ts registers the element in
 * v1.js and loads this on first connect).
 *
 * The element's attributes are read live into reactive props, and the
 * `strings` property works as it does on the player, including a value set
 * before the chunk arrived.
 */
import { mount, unmount } from 'svelte';
import EpisodeList from './EpisodeList.svelte';
import styles from './episode-list.css?inline';

/** Every attribute the list reads. `style` is read for `style="minimal"`; `lang` for its strings. */
const EPISODE_LIST_ATTRIBUTES = [
	'podcast',
	'variant',
	'style',
	'layout',
	'count',
	'season',
	'hide',
	'descriptions',
	'mini-player',
	'heading-level',
	'credit',
	'platform',
	'load',
	'theme',
	'accent',
	'api',
	'lang'
] as const;

// The host: a block that reserves --showfm-height (the builder measures the
// list and writes it into the snippet) and grows downwards only. A 404
// collapses it and gives the reserved height back. Then the list's styles.
const HOST_CSS =
	':host{display:block;min-height:var(--showfm-height,0)}' +
	':host([data-showfm-collapsed]){display:none!important;min-height:0}';

function readAttributes(host: HTMLElement): Record<string, string | null> {
	const attrs: Record<string, string | null> = {};
	for (const name of EPISODE_LIST_ATTRIBUTES) attrs[name] = host.getAttribute(name);
	return attrs;
}

/**
 * Mounts the list into `host`. Returns the function the element calls on
 * disconnect (false) and reconnect (true).
 */
export function mountEpisodes(host: HTMLElement): (connected: boolean) => void {
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
		observer.observe(host, { attributes: true, attributeFilter: [...EPISODE_LIST_ATTRIBUTES] });
		// The page's language can change too (the list follows <html lang>).
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
		app = mount(EpisodeList, { target: root, props });
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
