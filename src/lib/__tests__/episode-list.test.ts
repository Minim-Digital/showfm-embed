/**
 * The episode list's pure rules: attribute parsing, the API requests, the
 * Auto layout rule (width and artwork), the grid's fallback under 480px and
 * the row labels.
 */
import { describe, expect, it } from 'vitest';
import {
	AUTO_GRID_MIN_WIDTH,
	DEFAULT_COUNT,
	GRID_MIN_WIDTH,
	MAX_COUNT,
	dateLabel,
	durationLabel,
	episodeNumberLabel,
	episodeTypes,
	episodesEndpoint,
	ownArtworkShare,
	parseCount,
	parseHide,
	parseLayout,
	parseSeason,
	parseSwitch,
	parseVariant,
	podcastEndpoint,
	readFallbackList,
	resolveLayout,
	type ListEpisode
} from '../episode-list';
import { renderEpisodeListHTML } from '../fallback';
import { STRING_TABLES } from '../string-tables';
import { resolveListStrings } from '../list-strings';

const en = resolveListStrings('en');
const API = 'https://api.example.test';

describe('attributes', () => {
	it('variant: card unless exactly minimal', () => {
		expect(parseVariant(null)).toBe('card');
		expect(parseVariant('card')).toBe('card');
		expect(parseVariant(' Minimal ')).toBe('minimal');
		// The style alias carries inline CSS when it is not one of the two words.
		expect(parseVariant('--showfm-height: 640px')).toBe('card');
	});

	it('layout: auto, list, grid or compact; anything else is auto', () => {
		expect(parseLayout(null)).toBe('auto');
		expect(parseLayout('grid')).toBe('grid');
		expect(parseLayout('COMPACT')).toBe('compact');
		expect(parseLayout('tiles')).toBe('auto');
	});

	it('count: 10 by default, 1 to 50', () => {
		expect(parseCount(null)).toBe(DEFAULT_COUNT);
		expect(parseCount('5')).toBe(5);
		expect(parseCount('500')).toBe(MAX_COUNT);
		expect(parseCount('0')).toBe(DEFAULT_COUNT);
		expect(parseCount('2.5')).toBe(DEFAULT_COUNT);
		expect(parseCount('ten')).toBe(DEFAULT_COUNT);
	});

	it('season: a whole number the API accepts, else every season', () => {
		expect(parseSeason('2')).toBe(2);
		expect(parseSeason(' 12 ')).toBe(12);
		expect(parseSeason('')).toBeNull();
		expect(parseSeason('-1')).toBeNull();
		expect(parseSeason('12345')).toBeNull();
	});

	it('hide: trailer and bonus, in any order and spacing', () => {
		expect(parseHide(null)).toEqual({ trailer: false, bonus: false });
		expect(parseHide('trailer')).toEqual({ trailer: true, bonus: false });
		expect(parseHide('Bonus, trailer')).toEqual({ trailer: true, bonus: true });
		expect(parseHide('full')).toEqual({ trailer: false, bonus: false });
	});

	it('on and off switches keep their default for anything else', () => {
		expect(parseSwitch('on', false)).toBe(true);
		expect(parseSwitch('OFF', true)).toBe(false);
		expect(parseSwitch(null, true)).toBe(true);
		expect(parseSwitch('yes', false)).toBe(false);
	});
});

describe('API requests', () => {
	it('hide becomes the type filter for what is left', () => {
		expect(episodeTypes({ trailer: false, bonus: false })).toBeNull();
		expect(episodeTypes({ trailer: true, bonus: false })).toBe('bonus,full');
		expect(episodeTypes({ trailer: false, bonus: true })).toBe('full,trailer');
		expect(episodeTypes({ trailer: true, bonus: true })).toBe('full');
	});

	it('asks for the podcast by UUID or slug', () => {
		expect(podcastEndpoint(API, 'the-long-table')).toBe(`${API}/v1/podcasts/the-long-table`);
		expect(podcastEndpoint(API, 'a b')).toBe(`${API}/v1/podcasts/a%20b`);
	});

	it('pages with the limit, the filters and the keyset cursor', () => {
		expect(episodesEndpoint(API, 'show', { limit: 10 })).toBe(
			`${API}/v1/podcasts/show/episodes?limit=10`
		);
		expect(
			episodesEndpoint(API, 'show', { limit: 5, season: 2, types: 'full', cursor: 'abc-_1' })
		).toBe(`${API}/v1/podcasts/show/episodes?limit=5&season=2&type=full&cursor=abc-_1`);
	});
});

const withArt = (own: boolean) => ({ artwork: { url: 'x', own } }) as ListEpisode;

describe('Auto (design page 1)', () => {
	it('counts the episodes with artwork of their own', () => {
		expect(ownArtworkShare([])).toBe(0);
		expect(ownArtworkShare([withArt(true), withArt(false)])).toBe(0.5);
		expect(ownArtworkShare([withArt(false), { artwork: { url: 'x' } } as ListEpisode])).toBe(0);
	});

	it('is a list under 900px and a grid from 900px', () => {
		expect(resolveLayout('auto', 'card', AUTO_GRID_MIN_WIDTH - 1, 1)).toBe('list');
		expect(resolveLayout('auto', 'card', AUTO_GRID_MIN_WIDTH, 1)).toBe('grid');
	});

	it('Card goes to the grid only when at least half have their own artwork', () => {
		expect(resolveLayout('auto', 'card', 1100, 0.5)).toBe('grid');
		expect(resolveLayout('auto', 'card', 1100, 0.49)).toBe('list');
	});

	it('Minimal goes to the grid on width alone', () => {
		expect(resolveLayout('auto', 'minimal', 1100, 0)).toBe('grid');
		expect(resolveLayout('auto', 'minimal', 899, 0)).toBe('list');
	});

	it('a grid under 480px falls back to the list; list and compact stay', () => {
		expect(resolveLayout('grid', 'card', GRID_MIN_WIDTH - 1, 1)).toBe('list');
		expect(resolveLayout('grid', 'minimal', GRID_MIN_WIDTH, 0)).toBe('grid');
		expect(resolveLayout('compact', 'card', 200, 1)).toBe('compact');
		expect(resolveLayout('list', 'card', 1100, 1)).toBe('list');
	});
});

describe('the fallback list', () => {
	it('reads renderEpisodeListHTML output back', () => {
		const host = document.createElement('div');
		host.innerHTML = renderEpisodeListHTML({ title: 'Show' }, [
			{ title: 'One', links: { listen: 'https://show.fm/s/e/one' } },
			{ title: 'Two & more', links: { listen: 'javascript:alert(1)' } }
		]);
		expect(readFallbackList(host)).toEqual([
			{ title: 'One', href: 'https://show.fm/s/e/one' },
			{ title: 'Two & more', href: null }
		]);
	});
});

describe('row labels', () => {
	it('shows "S2 · E4" and reads "Season 2, episode 4"', () => {
		expect(
			episodeNumberLabel({ season_number: 2, episode_number: 4, episode_type: 'full' }, en)
		).toEqual({ short: 'S2 · E4', spoken: 'Season 2, episode 4' });
		expect(episodeNumberLabel({ season_number: 2, episode_number: null }, en)).toEqual({
			short: 'S2',
			spoken: 'Season 2'
		});
		expect(episodeNumberLabel({ season_number: null, episode_number: 7 }, en)).toEqual({
			short: 'E7',
			spoken: 'Episode 7'
		});
		expect(episodeNumberLabel({ season_number: null, episode_number: null }, en)).toEqual({
			short: '',
			spoken: ''
		});
	});

	it('trailers and bonus episodes carry the season only', () => {
		expect(
			episodeNumberLabel({ season_number: 1, episode_number: 3, episode_type: 'bonus' }, en).short
		).toBe('S1');
	});

	it('uses the language’s own forms (design page 8)', () => {
		const de = resolveListStrings('de');
		const fr = resolveListStrings('fr');
		const episode = { season_number: 2, episode_number: 4 };
		expect(episodeNumberLabel(episode, de).short).toBe('St. 2 · Folge 4');
		expect(episodeNumberLabel(episode, fr).short).toBe('S2 · Ép. 4');
		expect(durationLabel(6012, de)).toBe('1 Std. 40 Min.');
		expect(durationLabel(6012, fr)).toBe('1 h 40 min');
		expect(STRING_TABLES.fr.loadMore).toBe('Charger plus d’épisodes');
	});

	it('rounds lengths to the minute and leaves unknown ones out', () => {
		expect(durationLabel(3138, en)).toBe('52 min');
		expect(durationLabel(6012, en)).toBe('1 hr 40 min');
		expect(durationLabel(20, en)).toBe('1 min');
		expect(durationLabel(null, en)).toBe('');
		expect(durationLabel(0, en)).toBe('');
	});

	it('formats dates in the element’s language, and survives a bad tag', () => {
		expect(dateLabel('2026-09-24T10:00:00Z', 'en-GB')).toBe('24 Sept 2026');
		expect(dateLabel('2026-09-24T10:00:00Z', 'de')).toBe('24. Sept. 2026');
		expect(dateLabel('2026-09-24T10:00:00Z', 'not a tag!')).not.toBe('');
		expect(dateLabel('soon', 'en')).toBe('');
	});
});
