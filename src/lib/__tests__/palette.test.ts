/**
 * Player palette — the redesign's light/dark color system with its two
 * accessibility upgrades over the design mock: contrast-adjusted accents per
 * theme and an accent-derived artwork tint.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgba, mixHex } from '../contrast';
import { paletteVars, resolvePalette } from '../palette';

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
		expect(p.fgStrong).toBe('#F5F4F8');
		expect(p.waveTrack).toBe('rgba(255,255,255,.17)');
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
			expect(resolvePalette(hostAccent, 'light').logo).toBe('#7E22CE');
			expect(resolvePalette(hostAccent, 'dark').logo).toBe('#F5F4F8');
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
			'--pp-play-shadow'
		]) {
			expect(vars).toContain(`${name}:`);
		}
	});
});
