/**
 * The height contract constants, split out of the app's snippets tests. The
 * numbers are pasted into host pages inside embed snippets, so a change here
 * is a breaking change to every existing embed.
 */
import { describe, expect, it } from 'vitest';
import { IFRAME_HEIGHTS, PLAYER_MIN_HEIGHTS } from '../heights';

describe('height contract', () => {
	it('keeps the measured player heights', () => {
		expect(PLAYER_MIN_HEIGHTS).toEqual({
			standard: { branded: 291, unbranded: 252 },
			compact: { branded: 101, unbranded: 83 }
		});
	});

	it('keeps the iframe heights, each with headroom over the branded player', () => {
		expect(IFRAME_HEIGHTS).toEqual({ standard: 300, compact: 110 });
		expect(IFRAME_HEIGHTS.standard).toBeGreaterThan(PLAYER_MIN_HEIGHTS.standard.branded);
		expect(IFRAME_HEIGHTS.compact).toBeGreaterThan(PLAYER_MIN_HEIGHTS.compact.branded);
	});
});
