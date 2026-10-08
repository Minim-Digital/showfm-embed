/**
 * The play chunk: mounts PlayButton.svelte into a `<showfm-play>` element
 * and MiniPlayer.svelte into the page's `<showfm-mini-player>`
 * (play-element.ts registers both in v1.js and loads this on first connect).
 *
 * A play button's attributes are read live into reactive props, and the
 * `strings` property works as it does on the player, including a value set
 * before the chunk arrived.
 *
 * This is the list's mount (episodes.svelte.ts) again rather than a shared
 * module: code the two chunks shared would need a third file.
 */
import { mount, unmount } from 'svelte';
import PlayButton from './PlayButton.svelte';
import MiniPlayer from './MiniPlayer.svelte';
import buttonStyles from './play-button.css?inline';
import miniStyles from './mini-player.css?inline';

/**
 * Every attribute the play button reads. `lang` is read for its strings.
 * (`mini-player-position` is the mini-player's to read, when it opens.)
 */
const PLAY_ATTRIBUTES = [
	'episode',
	'podcast',
	'variant',
	'size',
	'mini-player',
	'credit',
	'platform',
	'load',
	'theme',
	'accent',
	'api',
	'lang'
] as const;

function readAttributes(host: HTMLElement): Record<string, string | null> {
	const attrs: Record<string, string | null> = {};
	for (const name of PLAY_ATTRIBUTES) attrs[name] = host.getAttribute(name);
	return attrs;
}

/**
 * Gives `host` a shadow root with `css` in it, mounts what `connect` mounts
 * there, and returns the function the element calls on disconnect (false)
 * and reconnect (true).
 */
function attach(
	host: HTMLElement,
	css: string,
	connect: (target: ShadowRoot) => Record<string, unknown>,
	disconnect?: () => void
): (connected: boolean) => void {
	const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = css;
	root.append(style);
	let app: Record<string, unknown> | null = connect(root);
	return (connected) => {
		if (connected && !app) app = connect(root);
		else if (!connected && app) {
			disconnect?.();
			void unmount(app);
			app = null;
		}
	};
}

/** Mounts the play button into `host`. */
export function mountPlay(host: HTMLElement): (connected: boolean) => void {
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
	const observer = new MutationObserver(() => (props.attrs = readAttributes(host)));
	return attach(
		host,
		buttonStyles,
		(target) => {
			props.attrs = readAttributes(host);
			observer.observe(host, { attributes: true, attributeFilter: [...PLAY_ATTRIBUTES] });
			// The page's language can change too (the button follows <html lang>).
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
			return mount(PlayButton, { target, props });
		},
		() => observer.disconnect()
	);
}

/**
 * Mounts the mini-player into the page's `<showfm-mini-player>`, open for
 * the element that added it (or, for a player, watching it). Later opens
 * come through `showfmOpen`.
 */
export function mountMiniPlayer(host: HTMLElement): (connected: boolean) => void {
	const mini = host as HTMLElement & {
		showfmOpener?: Element;
		showfmFollow?: HTMLAudioElement | null;
		showfmOpen?: (opener: Element, follow?: HTMLAudioElement | null) => void;
	};
	const request = $state({
		opener: mini.showfmOpener ?? null,
		follow: mini.showfmFollow ?? null,
		count: 1
	});
	delete mini.showfmOpener;
	delete mini.showfmFollow;
	mini.showfmOpen = (opener, follow) => {
		request.opener = opener;
		request.follow = follow ?? null;
		request.count += 1;
	};
	return attach(host, miniStyles, (target) =>
		mount(MiniPlayer, { target, props: { host, request } })
	);
}
