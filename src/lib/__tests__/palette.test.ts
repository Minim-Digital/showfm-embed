/**
 * Player palette — the redesign's light/dark color system with its two
 * accessibility upgrades over the design mock: contrast-adjusted accents per
 * theme and an accent-derived artwork tint.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgba, mixHex } from '../contrast';
import { paletteVars, resolvePalette } from '../palette';
import playerSource from '../PlayerCore.svelte?raw';

describe('Powered by credit contrast', () => {
	it.each(['light', 'dark'] as const)(
		'uses muted text with at least 4.5:1 contrast in %s',
		(theme) => {
			const creditStyle = playerSource.match(/\.powered-by\s*\{([^}]+)\}/)?.[1];
			expect(creditStyle).toMatch(/color:\s*var\(--pp-muted\)/);
			const palette = resolvePalette('#7E22CE', theme);
			expect(contrastRatio(palette.muted, palette.bg)).toBeGreaterThanOrEqual(4.5);
		}
	);

	it('uses the muted colour for the hover underline', () => {
		const hoverStyle = playerSource.match(/\.powered-by:hover\s*\{([^}]+)\}/)?.[1];
		expect(hoverStyle).toMatch(/text-decoration-color:\s*var\(--pp-muted\)/);
	});
});

describe('color helpers', () => {
	it('mixHex blends channels linearly and clamps t', () => {
		expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
		expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
		expect(mixHex('junk', '#ffffff', 0.5)).toBe('junk'); // falls back to input
	});

	it('hexToRgba emits rgba with clamped alpha', () => {
		expect(hexToRgba('#7E22CE', 0.3)).toBe('rgba(126,34,206,0.3)');
		expect(hexToRgba('nope', 0.3)).toBe('rgba(0,0,0,0)');
	});
});

describe('resolvePalette', () => {
	it('light palette matches the design tokens', () => {
		const p = resolvePalette('#7E22CE', 'light');
		expect(p.bg).toBe('#FFFFFF');
		expect(p.border).toBe('#E7E5EC');
		expect(p.fgStrong).toBe('#101014');
		expect(p.ctrlBg).toBe('#F4F3F7');
		expect(p.waveTrack).toBe('#DBD8E3');
		expect(p.accent.toLowerCase()).toBe('#7e22ce'); // already compliant → unchanged
	});

	it('dark palette matches the design tokens', () => {
		const p = resolvePalette('#7E22CE', 'dark');
		expect(p.bg).toBe('#17151f');
		expect(p.fgStrong).toBe('#f5f4f8');
		expect(p.waveTrack).toBe('rgba(255,255,255,0.17)');
	});

	it('guarantees ≥3:1 accent contrast against the card in BOTH themes for any host accent', () => {
		for (const hostAccent of ['#7E22CE', '#0E8F7E', '#1D4ED8', '#ffe066', '#1a052e']) {
			const light = resolvePalette(hostAccent, 'light');
			const dark = resolvePalette(hostAccent, 'dark');
			expect(contrastRatio(light.accent, '#ffffff')).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(dark.accent, '#17151f')).toBeGreaterThanOrEqual(3);
		}
	});

	it('derives the artwork tint from the accent (host-accent fix over the mock)', () => {
		const purple = resolvePalette('#7E22CE', 'light');
		const teal = resolvePalette('#0E8F7E', 'light');
		expect(purple.tint).not.toBe(teal.tint);
	});

	it('falls back to the default purple for null/garbage accents', () => {
		expect(resolvePalette(null, 'light').accent.toLowerCase()).toBe('#7e22ce');
		expect(resolvePalette('garbage', 'light').accent.toLowerCase()).toBe('#7e22ce');
	});

	it('logo token ignores the host accent: brand purple in light, white in dark', () => {
		for (const hostAccent of ['#7E22CE', '#0E8F7E', '#ffe066', null]) {
			expect(resolvePalette(hostAccent, 'light').logo).toBe('#7e22ce');
			expect(resolvePalette(hostAccent, 'dark').logo).toBe('#f5f4f8');
		}
	});
});

describe('paletteVars', () => {
	it('serializes every custom property the markup consumes', () => {
		const vars = paletteVars(resolvePalette('#7E22CE', 'light'));
		for (const name of [
			'--pp-bg',
			'--pp-border',
			'--pp-fg-strong',
			'--pp-fg',
			'--pp-muted',
			'--pp-subtle',
			'--pp-accent',
			'--pp-accent-fg',
			'--pp-logo',
			'--pp-tint',
			'--pp-ctrl-bg',
			'--pp-ctrl-hover',
			'--pp-ctrl-border',
			'--pp-shadow',
			'--pp-play-shadow',
			'--pp-accent-text',
			'--pp-focus',
			'--pp-wave',
			'--pp-wave-track'
		]) {
			expect(vars).toContain(`${name}:`);
		}
	});

	it('names each field in kebab case', () => {
		const vars = paletteVars(resolvePalette('#7E22CE', 'light'));
		expect(vars.split(';')).toHaveLength(Object.keys(resolvePalette('#7E22CE', 'light')).length);
		expect(vars).not.toMatch(/[A-Z]+:/);
	});
});

/** What a colour looks like on `bg`: hex as it is, a white veil mixed in. */
function solid(color: string, bg: string) {
	const veil = /^rgba\(255,255,255,([\d.]+)\)$/.exec(color);
	return veil ? mixHex(bg, '#ffffff', Number(veil[1])) : color;
}

const ACCENTS = [
	'#7E22CE',
	'#0E7C66',
	'#0ea5e9',
	'#facc15',
	'#ffe066',
	'#B8F400',
	'#C2410C',
	'#1a052e',
	'#000000',
	'#ffffff',
	'#808080'
];
const SURFACES = [
	undefined,
	'#ffffff',
	'#FBF7EF',
	'#FFF4E8',
	'#f0f0f0',
	'#999999',
	'#808080',
	'#777777',
	'#666666',
	'#555555',
	'#1b1b1f',
	'#111113',
	'#0b1d3a',
	'#000000'
];

describe('every derivation is WCAG AA', () => {
	// Text 4.5:1 on each surface it sits on: the card, the tint (current
	// transcript line, the expanded Transcript button, badges) and a control
	// (the speed button). The fill, the focus ring and the played waveform
	// are non-text: 3:1 on the card. Text on the fill: 4.5:1.
	const cases = ACCENTS.flatMap((accent) =>
		SURFACES.flatMap((surface) =>
			(['light', 'dark'] as const).map((theme) => ({ accent, surface, theme }))
		)
	);
	it.each(cases)('$accent on $surface ($theme)', ({ accent, surface, theme }) => {
		const hooks = surface ? { surface } : {};
		const p = resolvePalette(accent, theme, hooks);
		const surfaces = [p.bg, solid(p.tint, p.bg), solid(p.ctrlBg, p.bg)];
		for (const on of surfaces) {
			for (const text of [p.fgStrong, p.fg, p.muted, p.accentText]) {
				expect(contrastRatio(text, on)).toBeGreaterThanOrEqual(4.5);
			}
		}
		expect(contrastRatio(p.accentFg, p.accent)).toBeGreaterThanOrEqual(4.5);
		// The fill and the played waveform sit on the card and on a playing
		// row's tint; the focus ring on anything.
		for (const graphic of [p.accent, p.wave]) {
			for (const on of [p.bg, solid(p.tint, p.bg)]) {
				expect(contrastRatio(graphic, on)).toBeGreaterThanOrEqual(3);
			}
		}
		for (const on of surfaces) expect(contrastRatio(p.focus, on)).toBeGreaterThanOrEqual(3);
		if (contrastRatio(p.bg, '#ffffff') < contrastRatio(p.bg, '#000000')) {
			expect(contrastRatio(p.logo, p.bg)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('nudges text, muted, accent-text, focus and wave hooks that are too faint', () => {
		const hooks = {
			surface: '#FBF7EF',
			text: '#d0d0d0',
			muted: '#e0e0e0',
			'accent-text': '#ffe066',
			focus: '#fff0f0',
			'wave-played': '#fff8e0'
		};
		const p = resolvePalette('#0E7C66', 'light', hooks);
		expect(contrastRatio(p.fgStrong, p.bg)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(p.accentText, p.tint)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(p.focus, p.bg)).toBeGreaterThanOrEqual(3);
		expect(contrastRatio(p.wave, p.bg)).toBeGreaterThanOrEqual(3);
	});

	it('keeps text, focus and wave hooks that already pass, as written', () => {
		const p = resolvePalette('#7E22CE', 'light', {
			text: '#222222',
			muted: '#555555',
			'accent-text': '#5b21b6',
			focus: '#0000ff',
			'wave-played': '#be123c',
			wave: '#eeeeee',
			border: '#cccccc'
		});
		expect(p.fgStrong).toBe('#222222');
		expect(p.fg).toBe('#222222');
		expect(p.muted).toBe('#555555');
		expect(p.accentText).toBe('#5b21b6');
		expect(p.focus).toBe('#0000ff');
		expect(p.wave).toBe('#be123c');
		// Decorative: taken as written.
		expect(p.waveTrack).toBe('#eeeeee');
		expect(p.border).toBe('#cccccc');
	});
});

describe('the tint of a playing row', () => {
	it('brings an accent just over 3:1 on the card to 3:1 on its tint too (#0ea5e9)', () => {
		const p = resolvePalette('#0ea5e9', 'light');
		// Over 3:1 on white already, so before 1.5 it stayed #0d9ddd: 2.8:1 on its tint.
		expect(contrastRatio(p.accent, p.tint)).toBeGreaterThanOrEqual(3);
		expect(contrastRatio(p.wave, p.tint)).toBeGreaterThanOrEqual(3);
		// The tint is still the fill's, mixed with the card.
		expect(p.tint).toBe(mixHex(p.accent, p.bg, 0.92));
	});

	it('leaves an accent that already holds on the tint as it was', () => {
		expect(resolvePalette('#7E22CE', 'light').accent).toBe('#7e22ce');
		expect(resolvePalette('#0E7C66', 'light').accent).toBe('#0e7c66');
	});
});

describe('dark derivations (design page 4)', () => {
	it('fills at 3:1 on the card and the tint, and accent text at 4.5:1 on the tint', () => {
		const p = resolvePalette(null, 'dark');
		const tint = mixHex(p.bg, '#ffffff', 0.07);
		// The design's #8B38D3 is 3.1:1 on the card but 2.6:1 on the tint a
		// playing row puts it on, so the fill is one step lighter.
		expect(contrastRatio('#8B38D3', tint)).toBeLessThan(3);
		expect(p.accent).toBe('#974cd7');
		expect(contrastRatio(p.accent, tint)).toBeGreaterThanOrEqual(3);
		expect(contrastRatio(p.accentText, mixHex(p.bg, '#ffffff', 0.07))).toBeGreaterThanOrEqual(4.5);
		// The design's #B47FE3 and this are the same step towards white, within
		// rounding of the 5% steps.
		expect(contrastRatio(p.accentText, '#B47FE3')).toBeLessThan(1.15);
		expect(p.focus).toBe(p.accentText);
		expect(p.wave).toBe(p.accent);
	});

	it('derives the fill and its text from each accent, per theme', () => {
		for (const accent of ACCENTS) {
			const light = resolvePalette(accent, 'light');
			const dark = resolvePalette(accent, 'dark');
			expect(contrastRatio(dark.accent, '#17151f')).toBeGreaterThanOrEqual(3);
			expect(contrastRatio(light.accent, '#ffffff')).toBeGreaterThanOrEqual(3);
			expect(dark.playShadow).toContain(hexToRgba(dark.accent, 0.3));
		}
	});
});

describe('surface hooks', () => {
	it('a surface decides the theme: light text on a dark one, whatever the theme', () => {
		const p = resolvePalette('#7E22CE', 'light', { surface: '#111113' });
		expect(p.bg).toBe('#111113');
		expect(p.fgStrong).toBe('#f5f4f8');
		expect(p.tint).toBe('rgba(255,255,255,0.07)');
		const q = resolvePalette('#7E22CE', 'dark', { surface: '#FBF7EF' });
		expect(q.bg).toBe('#fbf7ef');
		expect(q.fgStrong).toBe('#101014');
	});

	it('mixes the neutrals from a light surface, not the default purple-greys', () => {
		const p = resolvePalette('#7E22CE', 'light', { surface: '#FBF7EF' });
		expect(p.border).toBe(mixHex('#FBF7EF', '#101014', 0.1));
		expect(p.ctrlBg).toBe(mixHex('#FBF7EF', '#101014', 0.045));
		expect(p.waveTrack).toBe(mixHex('#FBF7EF', '#101014', 0.145));
	});

	it('moves a mid-tone surface until text can reach 7:1 on it', () => {
		for (const surface of ['#808080', '#777777', '#666666']) {
			const p = resolvePalette('#7E22CE', 'light', { surface });
			const best = Math.max(contrastRatio(p.bg, '#ffffff'), contrastRatio(p.bg, '#000000'));
			expect(best).toBeGreaterThanOrEqual(7);
		}
		// A surface that already allows it is used as it is.
		expect(resolvePalette('#7E22CE', 'light', { surface: '#FBF7EF' }).bg).toBe('#fbf7ef');
	});

	it('--showfm-background is the surface only of elements with no card', () => {
		const hooks = { surface: '#FBF7EF', background: '#0b1d3a' };
		expect(resolvePalette('#7E22CE', 'light', hooks).bg).toBe('#fbf7ef');
		expect(resolvePalette('#7E22CE', 'light', hooks, true).bg).toBe('#0b1d3a');
		expect(resolvePalette('#7E22CE', 'light', { surface: '#FBF7EF' }, true).bg).toBe('#fbf7ef');
	});

	it('leaves the accent to the element: the accent hook is ranked there', () => {
		expect(resolvePalette('#0E7C66', 'light', { accent: '#C2410C' }).accent).toBe('#0e7c66');
	});
});
