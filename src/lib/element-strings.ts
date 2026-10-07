/**
 * The play button's labels, from design page 8, kept apart from strings.ts
 * so v1.js does not carry them. play-strings.ts builds the play button's and
 * mini-player's table on the English ones; the German and French ones are
 * in the locale tables (locales/), so the CDN loads them with the rest. The
 * same rules apply: English defaults, `{name}` placeholders, and
 * `window.showfmStrings` or `element.strings` to override.
 */
import type { Language } from './strings.js';

export const ELEMENT_EN = {
	/** Play button labels. The large label, time included, is 28 max. */
	playEpisode: 'Play episode · {duration}',
	pauseRemaining: 'Pause · {remaining} left',
	resumeRemaining: 'Resume · {remaining} left',
	listen: 'Listen · {duration}',
	minutes: '{n} min',
	/** An action's accessible name, such as "Play: Episode One". */
	actionName: '{verb}: {title}'
};

export type ElementStrings = typeof ELEMENT_EN;
export type ElementStringKey = keyof ElementStrings;

export const ELEMENT_DE: ElementStrings = {
	playEpisode: 'Folge abspielen · {duration}',
	pauseRemaining: 'Pause · noch {remaining}',
	resumeRemaining: 'Fortsetzen · noch {remaining}',
	listen: 'Anhören · {duration}',
	minutes: '{n} Min.',
	actionName: '{verb}: {title}'
};

export const ELEMENT_FR: ElementStrings = {
	playEpisode: 'Lire l’épisode · {duration}',
	pauseRemaining: 'Pause · {remaining} restantes',
	resumeRemaining: 'Reprendre · {remaining} restantes',
	listen: 'Écouter · {duration}',
	minutes: '{n} min',
	// A narrow no-break space before the colon, as French typography wants.
	actionName: '{verb} : {title}'
};

export const ELEMENT_STRING_TABLES: Readonly<Record<Language, ElementStrings>> = {
	en: ELEMENT_EN,
	de: ELEMENT_DE,
	fr: ELEMENT_FR
};

/** Maximum lengths, with the time filled in (design page 8). */
export const ELEMENT_STRING_MAX_LENGTHS: Readonly<Partial<Record<ElementStringKey, number>>> = {
	playEpisode: 28,
	pauseRemaining: 28,
	resumeRemaining: 28,
	listen: 28
};
