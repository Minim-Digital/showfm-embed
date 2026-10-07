/**
 * Strings for the elements that follow the player: the episode list
 * (EMB-3) and the play button (EMB-4), from design page 8. They are kept
 * apart from strings.ts so the player's bundle does not carry them before
 * those elements exist; each element merges its own table when it ships.
 * The same rules apply: English defaults, `{name}` placeholders, and
 * `window.showfmStrings` or `element.strings` to override.
 */
import type { Language } from './strings.js';

const EN = {
	/** The list's `load="click"` facade. */
	facadeListTitle: 'Load episodes',
	facadeListMeta: 'Episodes load from show.fm when you press the button.',
	episodesLoaded: 'Episodes loaded',
	/** Play button labels. The large label, time included, is 28 max. */
	playEpisode: 'Play episode · {duration}',
	pauseRemaining: 'Pause · {remaining} left',
	resumeRemaining: 'Resume · {remaining} left',
	listen: 'Listen · {duration}',
	minutes: '{n} min',
	/** An action's accessible name, such as "Play: Episode One". */
	actionName: '{verb}: {title}',
	seasonEpisode: 'S{season} · E{episode}',
	nowPlaying: 'Now playing · {remaining} left',
	loadMore: 'Load more episodes'
};

export type ElementStrings = typeof EN;
export type ElementStringKey = keyof ElementStrings;

const DE: ElementStrings = {
	facadeListTitle: 'Folgen laden',
	facadeListMeta: 'Die Folgen werden beim Klick von show.fm geladen.',
	episodesLoaded: 'Folgen geladen',
	playEpisode: 'Folge abspielen · {duration}',
	pauseRemaining: 'Pause · noch {remaining}',
	resumeRemaining: 'Fortsetzen · noch {remaining}',
	listen: 'Anhören · {duration}',
	minutes: '{n} Min.',
	actionName: '{verb}: {title}',
	seasonEpisode: 'St. {season} · Folge {episode}',
	nowPlaying: 'Läuft gerade · noch {remaining}',
	loadMore: 'Weitere Folgen laden'
};

const FR: ElementStrings = {
	facadeListTitle: 'Charger les épisodes',
	facadeListMeta: 'Les épisodes se chargent depuis show.fm au clic.',
	episodesLoaded: 'Épisodes chargés',
	playEpisode: 'Lire l’épisode · {duration}',
	pauseRemaining: 'Pause · {remaining} restantes',
	resumeRemaining: 'Reprendre · {remaining} restantes',
	listen: 'Écouter · {duration}',
	minutes: '{n} min',
	// A narrow no-break space before the colon, as French typography wants.
	actionName: '{verb} : {title}',
	seasonEpisode: 'S{season} · Ép. {episode}',
	nowPlaying: 'En cours de lecture · {remaining} restantes',
	loadMore: 'Charger plus d’épisodes'
};

export const ELEMENT_STRING_TABLES: Readonly<Record<Language, ElementStrings>> = {
	en: EN,
	de: DE,
	fr: FR
};

/** Maximum lengths, with the time filled in (design page 8). */
export const ELEMENT_STRING_MAX_LENGTHS: Readonly<Partial<Record<ElementStringKey, number>>> = {
	playEpisode: 28,
	pauseRemaining: 28,
	resumeRemaining: 28,
	listen: 28
};
