/**
 * The player's pure modules: no DOM work at import time and no Svelte. Both
 * package entries re-export this file, so `@showfm/embed` and
 * `@showfm/embed/svelte` expose the same helpers and constants.
 */
export type { PlayerEpisodeData, PlayerSize, PlayerTheme } from './types.js';
export { PLAYER_MIN_HEIGHTS, IFRAME_HEIGHTS } from './heights.js';
export { MARKETING_APEX_URL, PLAYER_DEFAULT_API_URL } from './hosts.js';
export {
	DEFAULT_ACCENT,
	accessibleAccent,
	contrastRatio,
	hexToRgba,
	mixHex,
	onAccentColor,
	parseHex
} from './contrast.js';
export { paletteVars, resolvePalette } from './palette.js';
export type { PlayerPalette, ResolvedTheme } from './palette.js';
export { drawWave, genPeaks } from './waveform.js';
export type { WaveDrawOptions } from './waveform.js';
export { downloadFilename, downloadHref } from './download.js';
