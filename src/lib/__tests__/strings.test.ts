/**
 * Strings: every table has every key, the design's maximum lengths hold in
 * every language, and the fallbacks and overrides apply in order.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
	ACTIONS_MAX_LENGTH,
	STRING_MAX_LENGTHS,
	formatString,
	languageFromTag,
	languageTagFor,
	resolveStrings,
	type StringKey
} from '../strings';
import { STRING_TABLES } from '../string-tables';
import { ELEMENT_STRING_MAX_LENGTHS, ELEMENT_STRING_TABLES } from '../element-strings';
import { LIST_EN, LIST_STRING_MAX_LENGTHS, resolveListStrings } from '../list-strings';

const LANGUAGES = ['en', 'de', 'fr'] as const;

afterEach(() => {
	delete (window as unknown as { showfmStrings?: unknown }).showfmStrings;
	document.documentElement.removeAttribute('lang');
});

describe('tables', () => {
	it.each(LANGUAGES)('%s has every key, each a non-empty string', (language) => {
		for (const tables of [STRING_TABLES, ELEMENT_STRING_TABLES]) {
			const table = tables[language] as Record<string, string>;
			expect(Object.keys(table).sort()).toEqual(Object.keys(tables.en).sort());
			for (const value of Object.values(table)) expect(value.trim()).not.toBe('');
		}
	});

	it.each(LANGUAGES)('%s keeps the same placeholders as English', (language) => {
		const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();
		for (const tables of [STRING_TABLES, ELEMENT_STRING_TABLES]) {
			const table = tables[language] as Record<string, string>;
			const english = tables.en as Record<string, string>;
			for (const key of Object.keys(english)) {
				expect(placeholders(table[key]), `${language}.${key}`).toEqual(placeholders(english[key]));
			}
		}
	});

	it('uses the one error string everywhere, and the approved copy (design page 8)', () => {
		expect(STRING_TABLES.en.error).toBe('This episode can’t be played right now.');
		expect(STRING_TABLES.de.error).toBe('Diese Folge ist gerade nicht abspielbar.');
		expect(STRING_TABLES.fr.error).toBe('Lecture impossible pour le moment.');
		expect(STRING_TABLES.en.suspended).toBe('This show isn’t available right now.');
		expect(STRING_TABLES.de.suspended).toBe('Diese Show ist gerade nicht verfügbar.');
		expect(STRING_TABLES.fr.suspended).toBe('Émission indisponible pour le moment.');
		expect(STRING_TABLES.en.blocked).toBe('Your browser blocked audio playback.');
		expect(STRING_TABLES.de.facadeTitle).toBe('Podcastfolge abspielen');
		expect(STRING_TABLES.fr.facadeTitle).toBe('Lire l’épisode du podcast');
		expect(ELEMENT_STRING_TABLES.fr.actionName).toBe('{verb} : {title}');
	});
});

describe('maximum lengths (design page 8)', () => {
	it.each(LANGUAGES)('%s: error, blocked, suspended and the facade title fit', (language) => {
		for (const [key, max] of Object.entries(STRING_MAX_LENGTHS)) {
			const value = STRING_TABLES[language][key as StringKey];
			expect(value.length, `${language}.${key}: ${value}`).toBeLessThanOrEqual(max!);
		}
	});

	it.each(LANGUAGES)('%s: "Try again" and "Listen on show.fm" share 36 characters', (language) => {
		const { retry, listenOnShowfm } = STRING_TABLES[language];
		expect(retry.length + listenOnShowfm.length).toBeLessThanOrEqual(ACTIONS_MAX_LENGTH);
	});

	it.each(LANGUAGES)('%s: the large play button labels fit with the time filled in', (language) => {
		const table = ELEMENT_STRING_TABLES[language];
		const time = formatString(table.minutes, { n: 52 });
		for (const [key, max] of Object.entries(ELEMENT_STRING_MAX_LENGTHS)) {
			const value = formatString(table[key as keyof typeof table], {
				duration: time,
				remaining: time
			});
			expect(value.length, `${language}.${key}: ${value}`).toBeLessThanOrEqual(max!);
		}
	});
});

describe('the episode list (design pages 2, 5, 6 and 8)', () => {
	it.each(LANGUAGES)('%s: every list key is in the table', (language) => {
		for (const key of Object.keys(LIST_EN)) {
			expect(STRING_TABLES[language], `${language}.${key}`).toHaveProperty(key);
		}
	});

	it.each(LANGUAGES)('%s: the list strings fit their maximum lengths', (language) => {
		for (const [key, max] of Object.entries(LIST_STRING_MAX_LENGTHS)) {
			const value = STRING_TABLES[language][key as keyof typeof LIST_EN];
			expect(value.length, `${language}.${key}: ${value}`).toBeLessThanOrEqual(max!);
		}
	});

	it('uses the approved copy where the design gives it', () => {
		expect(STRING_TABLES.de.seasonEpisode).toBe('St. {season} · Folge {episode}');
		expect(STRING_TABLES.fr.seasonEpisode).toBe('S{season} · Ép. {episode}');
		expect(STRING_TABLES.de.nowPlaying).toBe('Läuft gerade');
		expect(STRING_TABLES.fr.nowPlaying).toBe('En cours de lecture');
		expect(STRING_TABLES.fr.loadMore).toBe('Charger plus d’épisodes');
		expect(STRING_TABLES.fr.actionName).toBe('{verb}\u202f: {title}');
	});

	it('resolves English, the language, the page, then the element', () => {
		expect(resolveListStrings().loadMore).toBe('Load more episodes');
		expect(resolveListStrings('de').loadMore).toBe('Weitere Folgen laden');
		(window as unknown as { showfmStrings: unknown }).showfmStrings = { more: 'Read more' };
		expect(resolveListStrings('de').more).toBe('Read more');
		expect(resolveListStrings('de', { more: 'Mehr lesen' }).more).toBe('Mehr lesen');
		// The player's keys are not the list's.
		expect(resolveListStrings('en', { play: 'x' })).not.toHaveProperty('play');
	});
});

describe('language', () => {
	it('takes the primary subtag and falls back to English', () => {
		expect(languageFromTag('de-DE')).toBe('de');
		expect(languageFromTag('FR_ca')).toBe('fr');
		expect(languageFromTag('es')).toBe('en');
		expect(languageFromTag('')).toBe('en');
		expect(languageFromTag(null)).toBe('en');
	});

	it("prefers the element's lang, then <html lang>", () => {
		const element = document.createElement('div');
		expect(languageTagFor(element)).toBeNull();
		document.documentElement.setAttribute('lang', 'fr');
		expect(languageTagFor(element)).toBe('fr');
		element.setAttribute('lang', 'de');
		expect(languageTagFor(element)).toBe('de');
		// A language without a table is still the element's choice: English.
		element.setAttribute('lang', 'es');
		expect(languageFromTag(languageTagFor(element))).toBe('en');
	});
});

describe('overrides', () => {
	it('defaults to English', () => {
		expect(resolveStrings().play).toBe('Play');
	});

	it('window.showfmStrings overrides the table, and the element overrides that', () => {
		(window as unknown as { showfmStrings: unknown }).showfmStrings = {
			play: 'Page play',
			pause: 'Page pause'
		};
		expect(resolveStrings('de').play).toBe('Page play');
		expect(resolveStrings('de').mute).toBe('Stummschalten');
		const strings = resolveStrings('de', { play: 'Element play' });
		expect(strings.play).toBe('Element play');
		expect(strings.pause).toBe('Page pause');
	});

	it('ignores unknown keys, non-string values and inherited properties', () => {
		const overrides = Object.create({ play: 'inherited' });
		Object.assign(overrides, { pause: 42, nonsense: 'x', mute: 'Silence' });
		const strings = resolveStrings('en', overrides) as Record<string, unknown>;
		expect(strings.play).toBe('Play');
		expect(strings.pause).toBe('Pause');
		expect(strings.mute).toBe('Silence');
		expect(strings.nonsense).toBeUndefined();
		expect(resolveStrings('en', 'not an object').play).toBe('Play');
	});

	it('formatString fills placeholders and leaves unknown ones', () => {
		expect(formatString('{verb}: {title}', { verb: 'Play', title: 'One' })).toBe('Play: One');
		expect(formatString('{a} {b}', { a: 1 })).toBe('1 {b}');
	});
});
