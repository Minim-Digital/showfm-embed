/**
 * Every string the elements show or announce, with English, German and
 * French tables (design page 8 of the embeds design, 2026-10-07).
 *
 * The language comes from the element's own `lang` attribute, else the
 * page's `<html lang>`, else English. Episode titles and descriptions are
 * never translated. A page can override any key, for every element at once
 * with `window.showfmStrings = { key: '...' }` or for one element with
 * `element.strings = { key: '...' }`. The element's own overrides win.
 *
 * Placeholders are written `{name}` and filled by `formatString`.
 *
 * Pure: no DOM work at import time, so the server entry can export it.
 */

const EN = {
	/** The one error string, for every element and every failure (40 max). */
	error: 'This episode can’t be played right now.',
	/** The browser refused to start playback (40 max). */
	blocked: 'Your browser blocked audio playback.',
	/** The show is suspended (API 403 `unavailable`). No actions follow it (40 max). */
	suspended: 'This show isn’t available right now.',
	/** With `listenOnShowfm`, 36 characters at most in total. */
	retry: 'Try again',
	listenOnShowfm: 'Listen on show.fm',
	loading: 'Loading audio player',
	playerLabel: 'Audio player: {title}',
	play: 'Play',
	pause: 'Pause',
	back15: 'Back 15 seconds',
	forward30: 'Forward 30 seconds',
	seek: 'Seek',
	seekValue: '{current} of {total}',
	speed: 'Playback speed, currently {rate}×',
	speedChanged: 'Playback speed {rate}×',
	mute: 'Mute',
	unmute: 'Unmute',
	muted: 'Muted',
	unmuted: 'Unmuted',
	playing: 'Playing',
	paused: 'Paused',
	finished: 'Finished',
	download: 'Download episode',
	share: 'Share episode',
	shared: 'Shared',
	linkCopied: 'Link copied',
	shareFailed: 'Unable to share',
	poweredBy: 'Powered by',
	/** The `load="click"` facade, which knows nothing about the episode (26 max). */
	facadeTitle: 'Play podcast episode',
	facadeMeta: 'Loads from show.fm when you press play'
};

export type Strings = typeof EN;
export type StringKey = keyof Strings;
export type StringOverrides = Partial<Record<StringKey, string>>;
export type Language = 'en' | 'de' | 'fr';

const DE: Strings = {
	error: 'Diese Folge ist gerade nicht abspielbar.',
	blocked: 'Ihr Browser blockiert die Wiedergabe.',
	suspended: 'Diese Show ist gerade nicht verfügbar.',
	retry: 'Erneut versuchen',
	listenOnShowfm: 'Auf show.fm anhören',
	loading: 'Audioplayer wird geladen',
	playerLabel: 'Audioplayer: {title}',
	play: 'Abspielen',
	pause: 'Pause',
	back15: '15 Sekunden zurück',
	forward30: '30 Sekunden vor',
	seek: 'Position',
	seekValue: '{current} von {total}',
	speed: 'Wiedergabegeschwindigkeit, aktuell {rate}×',
	speedChanged: 'Wiedergabegeschwindigkeit {rate}×',
	mute: 'Stummschalten',
	unmute: 'Ton an',
	muted: 'Stumm',
	unmuted: 'Ton an',
	playing: 'Wiedergabe läuft',
	paused: 'Pausiert',
	finished: 'Beendet',
	download: 'Folge herunterladen',
	share: 'Folge teilen',
	shared: 'Geteilt',
	linkCopied: 'Link kopiert',
	shareFailed: 'Teilen nicht möglich',
	poweredBy: 'Bereitgestellt von',
	facadeTitle: 'Podcastfolge abspielen',
	facadeMeta: 'Wird beim Abspielen von show.fm geladen'
};

const FR: Strings = {
	error: 'Lecture impossible pour le moment.',
	blocked: 'Votre navigateur a bloqué la lecture.',
	suspended: 'Émission indisponible pour le moment.',
	retry: 'Réessayer',
	listenOnShowfm: 'Écouter sur show.fm',
	loading: 'Chargement du lecteur audio',
	playerLabel: 'Lecteur audio\u202f: {title}',
	play: 'Lire',
	pause: 'Pause',
	back15: 'Reculer de 15 secondes',
	forward30: 'Avancer de 30 secondes',
	seek: 'Position',
	seekValue: '{current} sur {total}',
	speed: 'Vitesse de lecture, actuellement {rate}×',
	speedChanged: 'Vitesse de lecture {rate}×',
	mute: 'Couper le son',
	unmute: 'Rétablir le son',
	muted: 'Son coupé',
	unmuted: 'Son rétabli',
	playing: 'Lecture en cours',
	paused: 'En pause',
	finished: 'Terminé',
	download: 'Télécharger l’épisode',
	share: 'Partager l’épisode',
	shared: 'Partagé',
	linkCopied: 'Lien copié',
	shareFailed: 'Partage impossible',
	poweredBy: 'Propulsé par',
	facadeTitle: 'Lire l’épisode du podcast',
	facadeMeta: 'Chargé depuis show.fm à la lecture'
};

export const STRING_TABLES: Readonly<Record<Language, Strings>> = { en: EN, de: DE, fr: FR };

/**
 * The longest each string may be, in characters (design page 8). The real
 * limit is width: the compact player has 1px of height headroom, so error,
 * blocked and suspended copy must stay on one line. `retry` and
 * `listenOnShowfm` share one line, so together they may be 36. The play
 * button limit applies with the time filled in.
 */
export const STRING_MAX_LENGTHS: Readonly<Partial<Record<StringKey, number>>> = {
	error: 40,
	blocked: 40,
	suspended: 40,
	facadeTitle: 26
};

/** The combined limit for the two actions that share the error card's line. */
export const ACTIONS_MAX_LENGTH = 36;

/** `de-DE` → `de`. Anything without a table is English. */
export function languageFromTag(tag: string | null | undefined): Language {
	const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
	return primary === 'de' || primary === 'fr' ? primary : 'en';
}

/**
 * The language tag that applies to an element: its own `lang`, else the
 * page's `<html lang>`. Null when neither is set.
 */
export function languageTagFor(element: Element | null | undefined): string | null {
	const own = element?.getAttribute('lang');
	if (own) return own;
	if (typeof document === 'undefined') return null;
	return document.documentElement.getAttribute('lang') || null;
}

/** Keeps only known keys with string values, so a stray object cannot break rendering. */
function pickStrings(source: unknown): StringOverrides {
	const picked: StringOverrides = {};
	if (!source || typeof source !== 'object') return picked;
	for (const key of Object.keys(EN) as StringKey[]) {
		const value = (source as Record<string, unknown>)[key];
		if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, key)) {
			picked[key] = value;
		}
	}
	return picked;
}

/**
 * The strings for one element: English, then the language's table, then
 * `window.showfmStrings`, then the element's own overrides.
 */
export function resolveStrings(language: Language = 'en', overrides?: unknown): Strings {
	const page =
		typeof window !== 'undefined'
			? (window as unknown as { showfmStrings?: unknown }).showfmStrings
			: undefined;
	return {
		...EN,
		...STRING_TABLES[language],
		...pickStrings(page),
		...pickStrings(overrides)
	};
}

/** Fills `{name}` placeholders. An unknown placeholder is left as written. */
export function formatString(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
	);
}
