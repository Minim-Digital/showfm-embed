/**
 * The player height contract.
 *
 * Copied from the show.fm app (src/lib/embed/snippets.ts) so the app's embed
 * builder and its public-api worker can import one source. These numbers are
 * baked into embed snippets already pasted into pages we cannot edit, so they
 * only ever change with a new major version of the player.
 */
import type { PlayerSize } from './types.js';

/**
 * Rendered player heights in px, measured from the live component (footer =
 * the "Powered by" row). Emitted as an inline min-height on the script-embed
 * element so the host page reserves the exact space BEFORE player/v1.js
 * loads — otherwise the element renders ~0 tall and causes CLS on upgrade.
 */
export const PLAYER_MIN_HEIGHTS: Record<PlayerSize, { branded: number; unbranded: number }> = {
	standard: { branded: 291, unbranded: 252 },
	compact: { branded: 101, unbranded: 83 }
};

/**
 * iframe heights per player size — measured from the redesigned player
 * (full renders 291px with branding, compact 101px) with small headroom;
 * the iframe page background is transparent so slack is invisible.
 * LOCKSTEP: the app's workers/public-api/src/lib/oembed.ts uses the same values.
 */
export const IFRAME_HEIGHTS: Record<PlayerSize, number> = {
	standard: 300,
	compact: 110
};
