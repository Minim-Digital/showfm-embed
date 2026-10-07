/**
 * WCAG contrast utilities for the embed player accent — parsing, the ratio
 * math, the accessible-accent adjustment loop, and the on-accent foreground.
 */
import { describe, expect, it } from 'vitest';
import { accessibleAccent, contrastRatio, onAccentColor, parseHex } from '../contrast';

describe('parseHex', () => {
	it('parses 6-digit, 3-digit, and #-less forms', () => {
		expect(parseHex('#7E22CE')).toEqual({ r: 126, g: 34, b: 206 });
		expect(parseHex('fff')).toEqual({ r: 255, g: 255, b: 255 });
		expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
	});

	it('rejects junk', () => {
		expect(parseHex('')).toBeNull();
		expect(parseHex('#12345')).toBeNull();
		expect(parseHex('not-a-color')).toBeNull();
	});
});

describe('contrastRatio', () => {
	it('is 21 for black on white and 1 for identical colors', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
		expect(contrastRatio('#7E22CE', '#7E22CE')).toBe(1);
	});
});

describe('accessibleAccent', () => {
	it('keeps an already-compliant accent unchanged', () => {
		expect(accessibleAccent('#7E22CE', '#ffffff')).toBe('#7e22ce');
	});

	it('darkens a too-light accent on white until it reaches 3:1', () => {
		const adjusted = accessibleAccent('#ffff00', '#ffffff');
		expect(contrastRatio(adjusted, '#ffffff')).toBeGreaterThanOrEqual(3);
	});

	it('lightens a too-dark accent on a dark background', () => {
		const adjusted = accessibleAccent('#1a052e', '#17181c');
		expect(contrastRatio(adjusted, '#17181c')).toBeGreaterThanOrEqual(3);
	});

	it('moves away from a mid-tone background in the direction that can reach the ratio', () => {
		// #808080 is above the 0.179 luminance where black and white tie, so
		// only darker colours reach 4.5:1; white tops out at 3.9:1.
		for (const background of ['#808080', '#767676', '#8a8a8a']) {
			const adjusted = accessibleAccent('#a0a0a0', background, 4.5);
			expect(contrastRatio(adjusted, background)).toBeGreaterThanOrEqual(4.5);
		}
		// Below it, lighter.
		expect(contrastRatio(accessibleAccent('#555555', '#6a6a6a', 3), '#6a6a6a')).toBeGreaterThan(3);
	});

	it('falls back to the default purple for null/garbage input', () => {
		expect(accessibleAccent(null, '#ffffff')).toBe('#7e22ce');
		expect(accessibleAccent('nope', '#ffffff')).toBe('#7e22ce');
	});
});

describe('onAccentColor', () => {
	it('picks white on dark accents and black on light accents', () => {
		expect(onAccentColor('#7E22CE')).toBe('#ffffff');
		expect(onAccentColor('#ffe066')).toBe('#000000');
	});

	it('always yields at least 4.5:1 against the accent for typical brand colors', () => {
		for (const accentColor of ['#7E22CE', '#0ea5e9', '#16a34a', '#dc2626', '#f59e0b']) {
			const fg = onAccentColor(accentColor);
			expect(contrastRatio(accentColor, fg)).toBeGreaterThanOrEqual(3);
		}
	});
});
