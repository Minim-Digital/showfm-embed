/**
 * Player color system — the light/dark palettes from the AudioPlayerRedesign
 * design project, with two deliberate accessibility upgrades over the mock:
 *
 * 1. The accent is contrast-adjusted per theme via accessibleAccent() (the
 *    mock lightened dark-mode accents by a fixed 16%, which is not enough for
 *    every host-supplied brand colour).
 * 2. The artwork-tile tint derives from the accent (the mock hardcoded the
 *    brand-purple lavender, which clashed with host accents).
 *
 * The host's colour hooks (`--showfm-surface`, `--showfm-text` and the rest,
 * read by hooks.ts) are inputs, never outputs: every text colour is nudged
 * until it reaches 4.5:1 on each surface it sits on (the card, the tint, a
 * control), and the accent fill, the focus ring and the played waveform reach
 * 3:1 on the card (WCAG 1.4.3 and 1.4.11). Every element resolves its palette
 * here, so the derivations match across the player, the list, the play
 * button, the mini-player and the transcript.
 *
 * Pure + dependency-free: compiled into the public player bundle.
 */

import {
	accessibleAccent,
	contrastRatio,
	DEFAULT_ACCENT,
	hexToRgba,
	mixHex,
	onAccentColor
} from './contrast';

export type ResolvedTheme = 'light' | 'dark';

/**
 * The colour hooks, as `--showfm-{name}`. `accent` is resolved by the
 * element (a pinned `accent` attribute wins over it), the rest here.
 */
export const COLOUR_HOOKS = [
	'accent',
	'accent-text',
	'surface',
	'background',
	'text',
	'muted',
	'border',
	'wave',
	'wave-played',
	'focus'
] as const;
export type ColourHook = (typeof COLOUR_HOOKS)[number];
/** Colour hook values as opaque `#rrggbb` (hooks.ts normalises them). */
export type ColourHooks = Partial<Record<ColourHook, string>>;

export interface PlayerPalette {
	bg: string;
	border: string;
	fgStrong: string;
	fg: string;
	muted: string;
	/** The same as `muted` since 1.4: the design's lighter grey failed 4.5:1. */
	subtle: string;
	/** The fill: 3:1 on the card. */
	accent: string;
	/** Text and icons on the fill. */
	accentFg: string;
	/** Text in the accent: 4.5:1 on the card, the tint and a control. */
	accentText: string;
	/** The keyboard focus ring: 3:1 on the card. */
	focus: string;
	/**
	 * The "Plus" in the powered-by wordmark: brand purple in light, white in
	 * dark. NEVER the host accent — the show.fm logo does not recolor.
	 */
	logo: string;
	tint: string;
	ctrlBg: string;
	ctrlHover: string;
	ctrlBorder: string;
	shadow: string;
	/** The played part of the waveform: 3:1 on the card. */
	wave: string;
	waveTrack: string;
	playShadow: string;
}

const DARK_BG = '#17151f';
const WHITE = '#ffffff';
/** Light-theme ink: neutrals on a host's light surface mix towards it. */
const INK = '#101014';
const veil = (alpha: number) => `rgba(255,255,255,${alpha})`;

/**
 * @param accent The accent, already chosen by the element: its `accent`
 *   attribute, else `--showfm-accent`, else the show's colour.
 * @param theme Light or dark. A `surface` hook decides it instead: dark text
 *   on a light surface, light text on a dark one.
 * @param hooks The host's colour hooks.
 * @param onPage The element has no card of its own (the Minimal list, the
 *   play button), so `--showfm-background` is its surface when it is set.
 */
export function resolvePalette(
	accent: string | null | undefined,
	theme: ResolvedTheme,
	hooks: ColourHooks = {},
	onPage = false
): PlayerPalette {
	const surface = (onPage && hooks.background) || hooks.surface;
	const dark = surface
		? contrastRatio(surface, WHITE) > contrastRatio(surface, '#000000')
		: theme === 'dark';
	// A mid-tone surface moves away from its text until the text can reach
	// 7:1 on it, which leaves room for the tint and the controls.
	const bg = surface
		? accessibleAccent(surface, dark ? WHITE : '#000000', 7)
		: dark
			? DARK_BG
			: '#FFFFFF';
	// Neutrals: the design's on the default card, mixed from the card on a
	// host's light surface; white veils work on any dark one.
	const neutral = (light: string, mix: number, darkAlpha: number) =>
		dark ? veil(darkAlpha) : surface ? mixHex(bg, INK, mix) : light;
	const fill = accessibleAccent(accent, bg, 3);
	const tint = dark ? veil(0.07) : mixHex(fill, bg, 0.92);
	const ctrlBg = neutral('#F4F3F7', 0.045, 0.06);
	// What a veil looks like on the card, for the contrast checks.
	const tintSolid = dark ? mixHex(bg, WHITE, 0.07) : tint;
	const ctrlSolid = dark ? mixHex(bg, WHITE, 0.06) : ctrlBg;
	const legible = (color: string, min = 4.5) =>
		[tintSolid, ctrlSolid, bg].reduce((c, on) => accessibleAccent(c, on, min), color);
	const accentText = legible(hooks['accent-text'] ?? fill);
	const muted = legible(hooks.muted ?? (dark ? '#9A98A6' : '#6B6976'));
	const fgStrong = legible(hooks.text ?? (dark ? '#F5F4F8' : INK));
	return {
		bg,
		border: hooks.border ?? neutral('#E7E5EC', 0.1, 0.1),
		fgStrong,
		fg: legible(hooks.text ?? (dark ? '#CFCDD8' : '#404040')),
		muted,
		subtle: muted,
		accent: fill,
		accentFg: onAccentColor(fill),
		accentText,
		focus: legible(hooks.focus ?? accentText, 3),
		logo: dark ? fgStrong : accessibleAccent(DEFAULT_ACCENT, bg, 4.5),
		tint,
		ctrlBg,
		ctrlHover: neutral('#ECEAF2', 0.075, 0.13),
		ctrlBorder: neutral('#E2E0EA', 0.115, 0.14),
		shadow: dark
			? '0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.38)'
			: '0 1px 2px rgba(16,16,20,.05), 0 8px 26px rgba(16,16,20,.06)',
		wave: accessibleAccent(hooks['wave-played'] ?? fill, bg, 3),
		waveTrack: hooks.wave ?? neutral('#DBD8E3', 0.145, 0.17),
		playShadow: `0 5px 14px ${hexToRgba(fill, 0.3)}`
	};
}

/**
 * Serialize the palette to the --pp-* custom properties the markup consumes:
 * each field in kebab case, so `fgStrong` is `--pp-fg-strong`.
 */
export function paletteVars(p: PlayerPalette): string {
	return Object.entries(p)
		.map(([name, value]) => `--pp-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
		.join(';');
}
