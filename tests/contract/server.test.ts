/**
 * The server entry (`@showfm/embed/server`, dist/server.js) has no side
 * effects: importing it in a browser-like environment registers nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest';

// Typed from the source entry; loaded from the build (see esm.test.ts).
let entry: typeof import('../../src/server');
const BUILT_ENTRY = '../../dist/server.js';

beforeAll(async () => {
	entry = await import(/* @vite-ignore */ BUILT_ENTRY);
});

describe('@showfm/embed/server', () => {
	it('registers no custom element', () => {
		expect(customElements.get('showfm-player')).toBeUndefined();
		expect(customElements.get('podcasterplus-player')).toBeUndefined();
	});

	it('exports the height contract and the pure modules', () => {
		expect(entry.PLAYER_MIN_HEIGHTS.compact.unbranded).toBe(83);
		expect(entry.IFRAME_HEIGHTS.standard).toBe(300);
		expect(entry.MARKETING_APEX_URL).toBe('https://show.fm');
		expect(entry.onAccentColor('#ffe066')).toBe('#000000');
	});
});
