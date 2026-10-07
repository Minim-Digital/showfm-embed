/**
 * Strings for the play button (EMB-4), from design page 8. They are kept
 * apart from strings.ts so the player's bundle does not carry them before
 * the element exists; it merges its own table when it ships, as the episode
 * list did (list-strings.ts). The same rules apply: English defaults,
 * `{name}` placeholders, and `window.showfmStrings` or `element.strings` to
 * override.
 */
import type { Language } from './strings.js';

const EN = {
	/** Play button labels. The large label, time included, is 28 max. */
	playEpisode: 'Play episode · {duration}',
	pauseRemaining: 'Pause · {remaining} left',
	resumeRemaining: 'Resume · {remaining} left',
	listen: 'Listen · {duration}',
	minutes: '{n} min',
	/** An action's accessible name, such as "Play: Episode One". */
	actionName: '{verb}: {title}'
};

export type ElementStrings = typeof EN;
export type ElementStringKey = keyof ElementStrings;

const DE: ElementStrings = {
	playEpisode: 'Folge abspielen · {duration}',
	pauseRemaining: 'Pause · noch {remaining}',
	resumeRemaining: 'Fortsetzen · noch {remaining}',
	listen: 'Anhören · {duration}',
	minutes: '{n} Min.',
	actionName: '{verb}: {title}'
};

const FR: ElementStrings = {
	playEpisode: 'Lire l’épisode · {duration}',
	pauseRemaining: 'Pause · {remaining} restantes',
	resumeRemaining: 'Reprendre · {remaining} restantes',
	listen: 'Écouter · {duration}',
	minutes: '{n} min',
	// A narrow no-break space before the colon, as French typography wants.
	actionName: '{verb} : {title}'
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
