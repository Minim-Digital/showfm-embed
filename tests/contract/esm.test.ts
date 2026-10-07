/**
 * The ESM entry (`@showfm/embed`, dist/index.js): importing it registers the
 * same two elements as v1.js and exposes the pure modules and constants.
 */
import { beforeAll, describe, expect, it } from 'vitest';

// Typed from the source entry; loaded from the build. The specifier is a
// variable so type-checking does not need dist/ to exist.
let entry: typeof import('../../src/index');
const BUILT_ENTRY = '../../dist/index.js';

beforeAll(async () => {
	entry = await import(/* @vite-ignore */ BUILT_ENTRY);
});

describe('@showfm/embed ESM entry', () => {
	it('registers <showfm-player> and the <podcasterplus-player> alias on import', () => {
		expect(customElements.get('showfm-player')).toBeDefined();
		expect(Object.getPrototypeOf(customElements.get('podcasterplus-player'))).toBe(
			customElements.get('showfm-player')
		);
	});

	it('exports the height contract', () => {
		expect(entry.PLAYER_MIN_HEIGHTS).toEqual({
			standard: { branded: 291, unbranded: 252 },
			compact: { branded: 101, unbranded: 83 }
		});
		expect(entry.IFRAME_HEIGHTS).toEqual({ standard: 300, compact: 110 });
	});

	it('exports the pure modules', () => {
		expect(entry.PLAYER_DEFAULT_API_URL).toBe('https://api.show.fm');
		expect(entry.MARKETING_APEX_URL).toBe('https://show.fm');
		expect(entry.resolvePalette('#7E22CE', 'dark').bg).toBe('#17151f');
		expect(entry.downloadFilename('Episode One', 'audio/mpeg')).toBe('episode-one.mp3');
		expect(entry.genPeaks('seed')).toHaveLength(220);
	});
});
