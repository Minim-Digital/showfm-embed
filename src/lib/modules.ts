/**
 * The player's pure modules: no DOM work at import time and no Svelte. Both
 * package entries re-export this file, so `@showfm/embed` and
 * `@showfm/embed/svelte` expose the same helpers and constants.
 */
export type { PlayerEpisodeData, PlayerSize, PlayerTheme } from './types.js';
export { PLAYER_MIN_HEIGHTS, IFRAME_HEIGHTS } from './heights.js';
export {
	MARKETING_APEX_URL,
	PLAYER_DEFAULT_API_URL,
	SHOWFM_MEDIA_HOSTS,
	canOfferTranscript,
	isShowfmMediaUrl
} from './hosts.js';
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
export {
	ACTIONS_MAX_LENGTH,
	STRING_MAX_LENGTHS,
	formatString,
	languageFromTag,
	resolveStrings
} from './strings.js';
export { STRING_TABLES } from './string-tables.js';
export type { Language, StringKey, StringOverrides, Strings } from './strings.js';
export { DEFAULT_RETRY_AFTER, apiGet, episodeEndpoint, latestEpisodeEndpoint } from './api.js';
export type { ApiRequestOptions, ApiResult, ApiStatus } from './api.js';
export {
	activeCueIndex,
	activeWordIndex,
	countWords,
	distinctSpeakers,
	formatCueTime,
	matchingCueIndexes,
	parseTimestamp,
	parseVtt
} from './vtt.js';
export type { ParseVttOptions, VttCue, VttWord } from './vtt.js';
export {
	episodeJsonLd,
	escapeHtml,
	isoDuration,
	renderEpisodeHTML,
	renderEpisodeListHTML,
	renderTranscriptHTML,
	safeUrl,
	serializeJsonLd
} from './fallback.js';
export type {
	FallbackCue,
	FallbackEpisode,
	FallbackPodcast,
	RenderEpisodeListOptions,
	RenderEpisodeOptions,
	RenderTranscriptOptions
} from './fallback.js';
export { ELEMENT_STRING_MAX_LENGTHS, ELEMENT_STRING_TABLES } from './element-strings.js';
export { TRANSCRIPT_STRING_MAX_LENGTHS } from './transcript-strings.js';
export type { TranscriptStringKey, TranscriptStrings } from './transcript-strings.js';
export type { ElementStringKey, ElementStrings } from './element-strings.js';
