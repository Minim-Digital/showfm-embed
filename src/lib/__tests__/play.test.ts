/**
 * The play button's and mini-player's pure rules (play.ts): attributes,
 * the labels in every variant, size, state and language (design pages 3.4
 * and 8), and the URL allow-list on the episode they keep.
 */
import { describe, expect, it } from 'vitest';
import {
	RATES,
	buttonLabel,
	clock,
	embedSource,
	episodeLabel,
	minutesLabel,
	minutesLeft,
	nextRate,
	parsePlaySize,
	parsePlayVariant,
	parsePosition,
	readPlayEpisode,
	switchOn
} from '../play';
import { resolvePlayStrings } from '../play-strings';
import { resolveStrings } from '../strings';
import { episodePayload } from '../../../tests/fixtures/episode';
import type { PlayerEpisodeData } from '../types';

const strings = (language: 'en' | 'de' | 'fr' = 'en') => ({
	...resolvePlayStrings(language),
	play: resolveStrings(language).play
});

describe('attributes', () => {
	it('reads variant, size and position, with their defaults', () => {
		expect(parsePlayVariant(null)).toBe('label');
		expect(parsePlayVariant(' ICON ')).toBe('icon');
		expect(parsePlayVariant('link')).toBe('link');
		expect(parsePlayVariant('pill')).toBe('label');
		expect(parsePlaySize(undefined)).toBe('sm');
		expect(parsePlaySize('LG')).toBe('lg');
		expect(parsePlaySize('large')).toBe('sm');
		expect(parsePosition(null)).toBe('right');
		expect(parsePosition('left')).toBe('left');
		expect(parsePosition('top')).toBe('right');
	});

	it('mini-player is on unless it says off', () => {
		expect(switchOn(null, true)).toBe(true);
		expect(switchOn('off', true)).toBe(false);
		expect(switchOn(' On ', false)).toBe(true);
		expect(switchOn('maybe', true)).toBe(true);
	});
});

describe('labels (design pages 3.4 and 8)', () => {
	const time = (language: 'en' | 'de' | 'fr') => minutesLabel(52 * 60, strings(language));

	it.each([
		['icon', 'sm', 'idle', ''],
		['label', 'sm', 'idle', 'Play'],
		['label', 'lg', 'idle', 'Play episode · 52 min'],
		['link', 'sm', 'idle', 'Listen · 52 min'],
		['label', 'sm', 'loading', 'Loading…'],
		['label', 'lg', 'playing', 'Pause · 38 min left'],
		['link', 'lg', 'paused', 'Resume · 38 min left'],
		['icon', 'lg', 'playing', '']
	] as const)('%s %s %s: "%s"', (variant, size, state, label) => {
		const s = strings();
		expect(buttonLabel(variant, size, state, time('en'), minutesLabel(38 * 60, s), s)).toBe(label);
	});

	it('falls back to the plain label when the length is unknown', () => {
		const s = strings();
		expect(buttonLabel('label', 'lg', 'idle', '', '', s)).toBe('Play episode');
		expect(buttonLabel('link', 'sm', 'idle', '', '', s)).toBe('Listen');
		// Playing with no length known yet: the resting label.
		expect(buttonLabel('label', 'sm', 'playing', '', '', s)).toBe('Play');
	});

	it.each([
		['de', 'Folge abspielen · 52 Min.', 'Pause · noch 38 Min.', 'Fortsetzen · noch 38 Min.'],
		['fr', 'Lire l’épisode · 52 min', 'Pause · 38 min restantes', 'Reprendre · 38 min restantes']
	] as const)('%s uses the approved copy', (language, play, pause, resume) => {
		const s = strings(language);
		const left = minutesLabel(38 * 60, s);
		expect(buttonLabel('label', 'lg', 'idle', time(language), left, s)).toBe(play);
		expect(buttonLabel('label', 'lg', 'playing', time(language), left, s)).toBe(pause);
		expect(buttonLabel('label', 'lg', 'paused', time(language), left, s)).toBe(resume);
		// Every large label fits its 28 characters with the time filled in.
		for (const label of [play, pause, resume]) expect(label.length).toBeLessThanOrEqual(28);
	});

	it('counts minutes, hours and what is left', () => {
		const s = strings();
		expect(minutesLabel(null, s)).toBe('');
		expect(minutesLabel(0, s)).toBe('');
		expect(minutesLabel(20, s)).toBe('1 min');
		expect(minutesLabel(6012, s)).toBe('1 hr 40 min');
		expect(minutesLeft(3138, 846, s)).toBe('38 min');
		// Never under a minute, and nothing without a length.
		expect(minutesLeft(3138, 3137, s)).toBe('1 min');
		expect(minutesLeft(0, 10, s)).toBe('');
	});

	it('shows the clock as the player does', () => {
		expect(clock(0)).toBe('0:00');
		expect(clock(65.9)).toBe('1:05');
		expect(clock(3729)).toBe('1:02:09');
		expect(clock(Number.NaN)).toBe('0:00');
	});

	it('labels the episode "S2 · E4", read as "Season 2, episode 4"', () => {
		const s = strings();
		expect(episodeLabel({ season_number: 2, episode_number: 4 }, s)).toEqual({
			short: 'S2 · E4',
			spoken: 'Season 2, episode 4'
		});
		expect(episodeLabel({ season_number: 2, episode_number: null }, s).short).toBe('S2');
		expect(episodeLabel({ episode_number: 7 }, s).spoken).toBe('Episode 7');
		expect(episodeLabel({ episode_type: 'trailer', episode_number: 1 }, s).short).toBe('Trailer');
		expect(episodeLabel({}, s)).toEqual({ short: '', spoken: '' });
		expect(episodeLabel({ season_number: 2, episode_number: 4 }, strings('de')).short).toBe(
			'St. 2 · Folge 4'
		);
	});
});

describe('the episode it keeps', () => {
	it('drops an audio or listen URL that is not http or https', () => {
		const payload = episodePayload() as unknown as PlayerEpisodeData;
		const hostile = {
			...payload,
			audio: { ...payload.audio, url: 'javascript:alert(1)' },
			artwork: { url: 'data:image/png;base64,AAAA' },
			links: { listen: ' javascript:alert(1)' }
		};
		const kept = readPlayEpisode(hostile);
		expect(kept.audio.url).toBeNull();
		expect(kept.links.listen).toBe('');
		expect(readPlayEpisode(payload).audio.url).toBe(payload.audio.url);
	});

	it('tags the audio as an embed play', () => {
		expect(embedSource('https://m.cdn.media/a.mp3')).toBe('https://m.cdn.media/a.mp3?src=embed');
		expect(embedSource('https://m.cdn.media/a.mp3?x=1')).toBe(
			'https://m.cdn.media/a.mp3?x=1&src=embed'
		);
		expect(embedSource(null)).toBeNull();
	});
});

describe('speed', () => {
	it('steps through the player rates and wraps', () => {
		expect(nextRate(1)).toBe(1.25);
		expect(nextRate(2)).toBe(0.75);
		expect(nextRate(0.75)).toBe(1);
		expect(nextRate(3)).toBe(1);
		expect(RATES).toEqual([1, 1.25, 1.5, 1.75, 2, 0.75]);
	});
});
