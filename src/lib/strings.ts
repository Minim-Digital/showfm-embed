/**
 * Every string the elements show or announce (design page 8 of the embeds
 * design, 2026-10-07). English is here; German and French are in
 * locales/. The npm entries bundle them. The CDN script carries English
 * only and loads a locale chunk next to itself when an element's language
 * resolves to German or French (locales/lazy.ts), so a page in English
 * downloads nothing more and paints as it always has.
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
import { BUNDLED_LOCALES } from './locales/index.js';

export const EN = {
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

/**
 * Keeps only the keys `table` has (the player's by default) with string
 * values, so a stray object cannot break rendering.
 */
export function pickStrings<T extends object = Strings>(
	source: unknown,
	table: T = EN as unknown as T
): Partial<T> {
	const picked: Partial<T> = {};
	if (!source || typeof source !== 'object') return picked;
	for (const key of Object.keys(table) as (keyof T & string)[]) {
		const value = (source as Record<string, unknown>)[key];
		if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(source, key)) {
			picked[key] = value as T[keyof T & string];
		}
	}
	return picked;
}

/**
 * Locale tables a CDN script registered at run time, shared by every copy
 * of the package on the page (the locale chunks and the ESM root write here).
 */
export const LOCALE_REGISTRY_KEY = Symbol.for('showfm.locales.v1');

/** A locale's table, bundled or registered; null when it is not here (yet). */
export function localeTable(language: Language): Partial<Strings> | null {
	if (language === 'en') return EN;
	const registry = (globalThis as unknown as Record<symbol, Record<string, Partial<Strings>>>)[
		LOCALE_REGISTRY_KEY
	];
	return BUNDLED_LOCALES[language] ?? registry?.[language] ?? null;
}

/**
 * The strings for one element: English, then the language's table (when it
 * is here), then `window.showfmStrings`, then the element's own overrides.
 */
export function resolveStrings(language: Language = 'en', overrides?: unknown): Strings {
	const page =
		typeof window !== 'undefined'
			? (window as unknown as { showfmStrings?: unknown }).showfmStrings
			: undefined;
	return {
		...EN,
		...pickStrings(localeTable(language)),
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
