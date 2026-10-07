/**
 * WCAG contrast utilities for the embed player's accent colour.
 *
 * Deliberately dependency-free (no $lib/utils/colorUtils import): the player
 * compiles to a standalone custom element and must not pull app code into
 * the bundle. The podcast's brand colour is adjusted in lightness until it
 * meets WCAG contrast against the player background — 3:1 for non-text UI
 * (WCAG 1.4.11); the on-accent foreground targets 4.5:1 (WCAG 1.4.3).
 */

/** The show.fm brand purple — the player accent when no color is set. */
export const DEFAULT_ACCENT = '#7E22CE';

interface Rgb {
	r: number;
	g: number;
	b: number;
}

export function parseHex(hex: string): Rgb | null {
	const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
	if (!match) return null;
	let value = match[1];
	if (value.length === 3) {
		value = value
			.split('')
			.map((c) => c + c)
			.join('');
	}
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16)
	};
}

function toHex({ r, g, b }: Rgb): string {
	const channel = (n: number) =>
		Math.round(Math.min(255, Math.max(0, n)))
			.toString(16)
			.padStart(2, '0');
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function relativeLuminance({ r, g, b }: Rgb): number {
	const linear = (channel: number) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
	const rgbA = parseHex(a);
	const rgbB = parseHex(b);
	if (!rgbA || !rgbB) return 1;
	const lumA = relativeLuminance(rgbA);
	const lumB = relativeLuminance(rgbB);
	const [light, dark] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
	return (light + 0.05) / (dark + 0.05);
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
	return {
		r: color.r + (target.r - color.r) * amount,
		g: color.g + (target.g - color.g) * amount,
		b: color.b + (target.b - color.b) * amount
	};
}

/**
 * Nudge `accent` toward black or white (away from the background) until it
 * reaches `minRatio` against `background`. Falls back to the default purple
 * for unparseable input. With no step that reaches it, the pole itself: the
 * most any colour can reach on that background.
 */
export function accessibleAccent(
	accent: string | null | undefined,
	background: string,
	minRatio = 3
): string {
	const parsed = parseHex(accent ?? '') ?? parseHex(DEFAULT_ACCENT)!;
	const bg = parseHex(background);
	if (!bg) return toHex(parsed);
	// Towards whichever of black and white contrasts more with the background
	// (they tie at a luminance of 0.179), so a mid-tone background, such as a
	// host's --showfm-surface, can still reach the ratio.
	const towards: Rgb =
		relativeLuminance(bg) > 0.179 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

	// step 0 tests the unmodified accent (mix at t=0 is `parsed`); each later
	// step nudges further toward the pole, which is itself the t=1 fallback.
	for (let step = 0; step <= 20; step++) {
		const candidate = toHex(mix(parsed, towards, step / 20));
		if (contrastRatio(candidate, background) >= minRatio) return candidate;
	}
	return toHex(towards);
}

/** Black or white — whichever reads better on the accent (play-button icon, etc.). */
export function onAccentColor(accent: string): string {
	return contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#000000')
		? '#ffffff'
		: '#000000';
}

/** Blend two hex colors: t=0 → a, t=1 → b. Falls back to `a` on junk input. */
export function mixHex(a: string, b: string, t: number): string {
	const from = parseHex(a);
	const to = parseHex(b);
	if (!from || !to) return a;
	const clamp = Math.min(1, Math.max(0, t));
	const channel = (x: number, y: number) =>
		Math.round(x + (y - x) * clamp)
			.toString(16)
			.padStart(2, '0');
	return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

/** hex → rgba() string (accent glows/shadows). Falls back to transparent on junk. */
export function hexToRgba(hex: string, alpha: number): string {
	const rgb = parseHex(hex);
	if (!rgb) return 'rgba(0,0,0,0)';
	const a = Math.min(1, Math.max(0, alpha));
	return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}
