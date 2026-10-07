/**
 * The light-DOM fallback renderers and JSON-LD (`@showfm/embed/server`).
 * The shared fixtures are what the WordPress plugin's PHP port matches.
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as server from '../../server';

const FIXTURES = resolve(__dirname, '../../../fixtures/fallback');
const cases = readdirSync(FIXTURES)
	.filter((file) => file.endsWith('.json'))
	.map((file) => ({ file, ...JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf-8')) }));

const episode = {
	title: 'Episode One',
	published_at: '2026-07-01T10:00:00.000Z',
	audio: { url: 'https://m.cdn.media/one.mp3', content_type: 'audio/mpeg', duration_seconds: 3723 },
	links: { listen: 'https://show.fm/test-signal/e/episode-one' },
	podcast: { title: 'Test Signal', links: { listen: 'https://show.fm/test-signal' } }
};
const HOSTILE = `"><img src=x onerror=alert(1)> & 'it' </a><script>`;

describe('shared fixtures', () => {
	it('covers every renderer', () => {
		expect(new Set(cases.map((c) => c.function))).toEqual(
			new Set([
				'renderEpisodeHTML',
				'renderEpisodeListHTML',
				'renderTranscriptHTML',
				'episodeJsonLd'
			])
		);
	});

	it.each(cases.map((c) => [c.file, c] as const))('%s', (_file, testCase) => {
		const render = (server as unknown as Record<string, (...args: unknown[]) => unknown>)[
			testCase.function
		];
		expect(render(...testCase.args)).toEqual(testCase.expected);
	});
});

describe('renderEpisodeHTML', () => {
	it('is the title link and a plain audio control (design page 7)', () => {
		expect(server.renderEpisodeHTML(episode)).toMatchInlineSnapshot(
			`"<a href="https://show.fm/test-signal/e/episode-one">Episode One</a><audio controls preload="none" src="https://m.cdn.media/one.mp3"></audio>"`
		);
	});

	it('escapes a hostile title and drops a script URL', () => {
		const html = server.renderEpisodeHTML({
			...episode,
			title: HOSTILE,
			links: { listen: ' JavaScript:alert(1)' },
			audio: { url: 'javascript:alert(2)' }
		});
		expect(html).toBe(
			'&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &#39;it&#39; &lt;/a&gt;&lt;script&gt;'
		);
		expect(html).not.toMatch(/<(?!\/?a\b)|javascript/i);
	});

	it('escapes quotes in attribute values', () => {
		const html = server.renderEpisodeHTML({
			...episode,
			links: { listen: 'https://show.fm/a"onmouseover="x' },
			audio: { url: "https://m.cdn.media/a.mp3?q='1'" }
		});
		expect(html).toContain('href="https://show.fm/a&quot;onmouseover=&quot;x"');
		expect(html).toContain('src="https://m.cdn.media/a.mp3?q=&#39;1&#39;"');
	});
});

describe('renderTranscriptHTML', () => {
	it('takes the WebVTT text, voice spans and inline timestamps included', () => {
		const vtt = [
			'WEBVTT',
			'',
			'00:00:00.000 --> 00:00:02.000',
			'<v Maya>So <00:00:00.400>the <00:00:00.800>bakery</v>',
			'',
			'00:00:02.500 --> 00:00:04.000',
			'<v Tom>Twelve &amp; nearly.</v>',
			''
		].join('\n');
		expect(server.renderTranscriptHTML(vtt)).toBe(
			'<div><p><strong>Maya:</strong> So the bakery</p><p><strong>Tom:</strong> Twelve &amp; nearly.</p></div>'
		);
	});

	it('is the same markup for parsed cues', () => {
		const cues = server.parseVtt('WEBVTT\n\n00:00.000 --> 00:01.000\n<v Tom>Hello</v>\n');
		expect(server.renderTranscriptHTML(cues)).toBe('<div><p><strong>Tom:</strong> Hello</p></div>');
	});

	it('never lets markup through', () => {
		const html = server.renderTranscriptHTML([{ speaker: HOSTILE, text: HOSTILE }]);
		expect(html).not.toMatch(/<(?!\/?(div|p|strong)>)/);
	});
});

describe('renderEpisodeListHTML', () => {
	it('is a list of title links, escaped', () => {
		expect(
			server.renderEpisodeListHTML(episode.podcast, [episode, { ...episode, title: HOSTILE }])
		).toMatchInlineSnapshot(
			`"<ul><li><a href="https://show.fm/test-signal/e/episode-one">Episode One</a></li><li><a href="https://show.fm/test-signal/e/episode-one">&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &#39;it&#39; &lt;/a&gt;&lt;script&gt;</a></li></ul>"`
		);
	});

	it('links the show when there are no episodes, and honours limit', () => {
		expect(server.renderEpisodeListHTML({ title: 'A & B' }, [])).toBe('A &amp; B');
		expect(server.renderEpisodeListHTML(episode.podcast, [episode, episode], { limit: 1 })).toBe(
			'<ul><li><a href="https://show.fm/test-signal/e/episode-one">Episode One</a></li></ul>'
		);
		expect(server.renderEpisodeListHTML(episode.podcast, [episode], { limit: 0 })).toBe(
			'<a href="https://show.fm/test-signal">Test Signal</a>'
		);
	});
});

describe('episodeJsonLd', () => {
	it('is a schema.org PodcastEpisode', () => {
		expect(server.episodeJsonLd({ ...episode, episode_number: 3, season_number: 1 })).toEqual({
			'@context': 'https://schema.org',
			'@type': 'PodcastEpisode',
			name: 'Episode One',
			url: 'https://show.fm/test-signal/e/episode-one',
			datePublished: '2026-07-01T10:00:00.000Z',
			duration: 'PT1H2M3S',
			episodeNumber: 3,
			partOfSeason: { '@type': 'PodcastSeason', seasonNumber: 1 },
			partOfSeries: {
				'@type': 'PodcastSeries',
				name: 'Test Signal',
				url: 'https://show.fm/test-signal'
			},
			associatedMedia: {
				'@type': 'MediaObject',
				contentUrl: 'https://m.cdn.media/one.mp3',
				encodingFormat: 'audio/mpeg'
			}
		});
	});

	it('serialises safely for a script tag', () => {
		const json = server.serializeJsonLd(
			server.episodeJsonLd({ ...episode, title: '</script><script>alert(1)</script>\u2028' })
		);
		expect(json).not.toMatch(/<|>|\u2028/);
		expect(JSON.parse(json).name).toBe('</script><script>alert(1)</script>\u2028');
	});

	it('writes ISO 8601 durations', () => {
		expect(server.isoDuration(0)).toBe('PT0S');
		expect(server.isoDuration(59.6)).toBe('PT1M');
		expect(server.isoDuration(3600)).toBe('PT1H');
		expect(server.isoDuration(1843)).toBe('PT30M43S');
	});
});

describe('server entry', () => {
	it('uses no DOM globals', () => {
		expect(typeof document).toBe('undefined');
		expect(typeof window).toBe('undefined');
		expect(server.renderEpisodeHTML(episode)).toContain('<audio');
	});
});
