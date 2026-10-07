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
 * Pure + dependency-free: compiled into the public player bundle.
 */

import { accessibleAccent, DEFAULT_ACCENT, hexToRgba, mixHex, onAccentColor } from './contrast';

export type ResolvedTheme = 'light' | 'dark';

export interface PlayerPalette {
	bg: string;
	border: string;
	fgStrong: string;
	fg: string;
	muted: string;
	subtle: string;
	accent: string;
	accentFg: string;
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
	waveTrack: string;
	playShadow: string;
}

const LIGHT_BG = '#ffffff';
const DARK_BG = '#17151f';

export function resolvePalette(
	accent: string | null | undefined,
	theme: ResolvedTheme
): PlayerPalette {
	if (theme === 'dark') {
		const safeAccent = accessibleAccent(accent, DARK_BG);
		return {
			bg: DARK_BG,
			border: 'rgba(255,255,255,.10)',
			fgStrong: '#F5F4F8',
			fg: '#CFCDD8',
			muted: '#9A98A6',
			subtle: '#726F7D',
			accent: safeAccent,
			accentFg: onAccentColor(safeAccent),
			logo: '#F5F4F8',
			tint: 'rgba(255,255,255,.07)',
			ctrlBg: 'rgba(255,255,255,.06)',
			ctrlHover: 'rgba(255,255,255,.13)',
			ctrlBorder: 'rgba(255,255,255,.14)',
			shadow: '0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.38)',
			waveTrack: 'rgba(255,255,255,.17)',
			playShadow: `0 5px 14px ${hexToRgba(safeAccent, 0.3)}`
		};
	}
	const safeAccent = accessibleAccent(accent, LIGHT_BG);
	return {
		bg: '#FFFFFF',
		border: '#E7E5EC',
		fgStrong: '#101014',
		fg: '#404040',
		muted: '#6B6976',
		subtle: '#9A98A6',
		accent: safeAccent,
		accentFg: onAccentColor(safeAccent),
		logo: DEFAULT_ACCENT,
		tint: mixHex(safeAccent, LIGHT_BG, 0.92),
		ctrlBg: '#F4F3F7',
		ctrlHover: '#ECEAF2',
		ctrlBorder: '#E2E0EA',
		shadow: '0 1px 2px rgba(16,16,20,.05), 0 8px 26px rgba(16,16,20,.06)',
		waveTrack: '#DBD8E3',
		playShadow: `0 5px 14px ${hexToRgba(safeAccent, 0.3)}`
	};
}

/** Serialize the palette to the --pp-* custom properties the markup consumes. */
export function paletteVars(p: PlayerPalette): string {
	return (
		`--pp-bg:${p.bg};--pp-border:${p.border};--pp-fg-strong:${p.fgStrong};--pp-fg:${p.fg};` +
		`--pp-muted:${p.muted};--pp-subtle:${p.subtle};--pp-accent:${p.accent};--pp-accent-fg:${p.accentFg};` +
		`--pp-logo:${p.logo};` +
		`--pp-tint:${p.tint};--pp-ctrl-bg:${p.ctrlBg};--pp-ctrl-hover:${p.ctrlHover};--pp-ctrl-border:${p.ctrlBorder};` +
		`--pp-shadow:${p.shadow};--pp-play-shadow:${p.playShadow}`
	);
}
