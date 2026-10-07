/**
 * The episode list's strings (design pages 2, 5, 6 and 8). English is here,
 * in the list's own chunk, so v1.js does not carry it; German and French are
 * in locales/de.ts and locales/fr.ts with the player's, so the CDN build
 * loads them with the same locale chunk.
 *
 * The rules are the player's (strings.ts): `{name}` placeholders, and
 * `window.showfmStrings` or `element.strings` override any key. The list
 * also uses the player's shared strings (error, blocked, suspended, retry,
 * listenOnShowfm, play, pause, paused, poweredBy).
 *
 * Pure: no DOM work at import time.
 */
import { resolveStrings, type Language } from './strings.js';

export const LIST_EN = {
	/** The skeleton's accessible name. */
	loadingEpisodes: 'Loading episodes',
	/** The load-more button while the next page is on its way. */
	loadingMore: 'Loading episodes…',
	loadMore: 'Load more episodes',
	/** Spoken once a load="click" list has loaded. */
	episodesLoaded: 'Episodes loaded',
	endOfList: 'That’s every episode of {show}.',
	noEpisodes: 'No episodes yet',
	noEpisodesNote: 'New episodes of {show} will appear here as soon as they’re published.',
	/** The whole list could not load (40 max, one line in the error card). */
	listError: 'Episodes can’t be loaded right now.',
	trailer: 'Trailer',
	bonus: 'Bonus',
	explicit: 'Explicit',
	/** The description's expand and collapse button. */
	more: 'More',
	less: 'Less',
	/** The meta line shows the short form; screen readers hear the spoken one. */
	seasonEpisode: 'S{season} · E{episode}',
	seasonEpisodeSpoken: 'Season {season}, episode {episode}',
	seasonOnly: 'S{season}',
	seasonOnlySpoken: 'Season {season}',
	episodeOnly: 'E{episode}',
	episodeOnlySpoken: 'Episode {episode}',
	nowPlaying: 'Now playing',
	/** "Now playing · 32 min left". */
	statusLine: '{status} · {remaining}',
	remaining: '{time} left',
	minutes: '{n} min',
	hoursMinutes: '{h} hr {m} min',
	/** The labelled play pill in the Minimal style. */
	pillPlay: 'Play · {duration}',
	pillPause: 'Pause · {remaining}',
	pillResume: 'Resume · {remaining}',
	/** A row whose audio is on its way. */
	loadingAudio: 'Loading…',
	/** A button's accessible name, such as "Play: Episode One". */
	actionName: '{verb}: {title}'
};

export type ListStrings = typeof LIST_EN;

/**
 * The list's load="click" facade. The inline loader draws it and carries
 * its own copy of these (click-loader.ts); they are here for the tables,
 * so translators and `window.showfmStrings` see every key.
 */
export const LIST_FACADE_EN = {
	facadeListTitle: 'Load episodes',
	facadeListMeta: 'Episodes load from show.fm when you press the button.'
};

export type ListFacadeStrings = typeof LIST_FACADE_EN;
export type ListStringKey = keyof ListStrings;

/** The longest each string may be, in characters (design page 8). */
export const LIST_STRING_MAX_LENGTHS: Readonly<Partial<Record<ListStringKey, number>>> = {
	listError: 40,
	loadMore: 26,
	loadingMore: 26,
	nowPlaying: 22,
	trailer: 14,
	bonus: 14,
	explicit: 14
};

/**
 * The list's strings: English, then the language's table (when it is here),
 * then `window.showfmStrings`, then the element's own overrides.
 */
export function resolveListStrings(language: Language = 'en', overrides?: unknown): ListStrings {
	return resolveStrings(language, overrides, LIST_EN);
}
