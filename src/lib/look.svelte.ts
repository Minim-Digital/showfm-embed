/**
 * An element's colours: its theme and accent, the visitor's colour scheme
 * and the host's colour hooks, resolved into one palette (palette.ts). Every
 * element calls it while it initialises, so they all follow the same rules.
 *
 * The hooks are read again when the visitor's colour scheme changes, and
 * when an attribute changes on the element's host, `<html>` or `<body>`,
 * which is how sites switch their own dark mode (a class, a `data-theme`, an
 * inline style). A hook changed anywhere else shows on the next render.
 */
import { parseHex } from './contrast';
import { readHooks } from './hooks';
import { paletteVars, resolvePalette, type ColourHooks } from './palette';

export function createLook(
	/** Where the hooks are read: the element's root node. */
	node: () => Element | null | undefined,
	/** `light` or `dark`; anything else follows the visitor's colour scheme. */
	theme: () => string | null | undefined,
	/** An accent pinned with the `accent` attribute: wins over the hook when it is a colour. */
	pinned: () => string | null | undefined,
	/** The show's accent: the hook wins over it. */
	shown: () => string | null | undefined,
	/** No card of its own: `--showfm-background` is its surface. */
	onPage?: () => boolean
) {
	let systemDark = $state(false);
	let hooks = $state.raw<ColourHooks>({});
	$effect(() => {
		const element = node();
		if (!element) return;
		let key = '';
		const read = () => {
			const next = readHooks(element);
			const nextKey = JSON.stringify(next);
			if (nextKey !== key) {
				key = nextKey;
				hooks = next;
			}
		};
		const query = matchMedia('(prefers-color-scheme: dark)');
		const onScheme = () => {
			systemDark = query.matches;
			read();
		};
		onScheme();
		query.addEventListener('change', onScheme);
		const observer = new MutationObserver(read);
		// The element itself, or the element its shadow root belongs to.
		for (const target of [
			(element.getRootNode() as ShadowRoot).host ?? element,
			document.documentElement,
			document.body
		]) {
			observer.observe(target, { attributes: true });
		}
		return () => {
			query.removeEventListener('change', onScheme);
			observer.disconnect();
		};
	});
	// What the element hands on (the mini-player, a transcript that follows
	// it) is this choice, so they rank it the same way.
	const accent = $derived((parseHex(pinned() ?? '') ? pinned() : null) ?? hooks.accent ?? shown());
	const palette = $derived(
		resolvePalette(
			accent,
			theme() === 'dark' || (theme() !== 'light' && systemDark) ? 'dark' : 'light',
			hooks,
			onPage?.()
		)
	);
	const vars = $derived(paletteVars(palette));
	return {
		get accent() {
			return accent;
		},
		get palette() {
			return palette;
		},
		get vars() {
			return vars;
		}
	};
}
