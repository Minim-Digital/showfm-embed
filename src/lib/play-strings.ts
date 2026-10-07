/**
 * The play button's and mini-player's strings (design pages 3, 5 and 8).
 * English is here, in their lazy chunk, so v1.js does not carry it; German
 * and French are in locales/de.ts and locales/fr.ts with the player's, so
 * the CDN build loads them with the same locale chunk.
 *
 * The rules are the player's (strings.ts): `{name}` placeholders, and
 * `window.showfmStrings` or `element.strings` override any key. Both also
 * use the player's shared strings (error, blocked, suspended, retry, play,
 * pause, back15, forward30, seek, speed, share, poweredBy and others).
 * Some keys are the episode list's too, with the same text.
 *
 * Pure: no DOM work at import time.
 */
import { ELEMENT_EN } from './element-strings.js';
import { resolveStrings, type Language } from './strings.js';

export const PLAY_EN = {
	...ELEMENT_EN,
	/** The large label and the link with no length known. */
	playEpisodePlain: 'Play episode',
	listenPlain: 'Listen',
	hoursMinutes: '{h} hr {m} min',
	remaining: '{time} left',
	/** A button whose audio is on its way. */
	loadingAudio: 'Loading…',
	/** The mini-player's region, and spoken as "Now playing: {title}" when it starts one. */
	nowPlaying: 'Now playing',
	seasonEpisode: 'S{season} · E{episode}',
	seasonEpisodeSpoken: 'Season {season}, episode {episode}',
	seasonOnly: 'S{season}',
	seasonOnlySpoken: 'Season {season}',
	episodeOnly: 'E{episode}',
	episodeOnlySpoken: 'Episode {episode}',
	trailer: 'Trailer',
	bonus: 'Bonus',
	/** Collapse keeps playing; Close stops. The labels say so. */
	collapsePlayer: 'Collapse player',
	expandPlayer: 'Expand player',
	closePlayer: 'Close player and stop playback'
};

/**
 * Not shown to visitors, so not in the chunk: the warning a builder (the
 * app's, the WordPress block's) shows when a play button's mini-player is
 * turned off (design page 3.4). In STRING_TABLES with the rest.
 */
export const PLAY_BUILDER_EN = {
	miniPlayerOff: 'Visitors can only play and pause.'
};

export type PlayStrings = typeof PLAY_EN;
export type PlayBuilderStrings = typeof PLAY_BUILDER_EN;
export type PlayStringKey = keyof PlayStrings;

/**
 * The strings for a play button or the mini-player: English, then the
 * language's table (when it is here), then `window.showfmStrings`, then the
 * element's own overrides.
 */
export function resolvePlayStrings(language: Language = 'en', overrides?: unknown): PlayStrings {
	return resolveStrings(language, overrides, PLAY_EN);
}
