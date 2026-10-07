/** The shared API client classifies every answer into one typed status. */
import { describe, expect, it, vi } from 'vitest';
import { apiGet, episodeEndpoint, latestEpisodeEndpoint, DEFAULT_RETRY_AFTER } from '../api';

const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
	vi.fn(() => Promise.resolve(new Response(body, init)));

describe('apiGet', () => {
	it('ok: returns the data and the ETag', async () => {
		const fetch = respond(JSON.stringify({ data: { id: 'x' } }), { headers: { ETag: '"abc"' } });
		expect(await apiGet('https://api.test/v1/episodes/x', { fetch })).toEqual({
			status: 'ok',
			data: { id: 'x' },
			etag: '"abc"',
			nextCursor: null
		});
		// Nothing to add: one argument, exactly as the v1 player always called it.
		expect(fetch).toHaveBeenCalledWith('https://api.test/v1/episodes/x');
	});

	it("ok: a list's keyset cursor comes back as nextCursor", async () => {
		const fetch = respond(
			JSON.stringify({ data: [{ id: 'x' }], pagination: { next_cursor: 'MjAyNi0wMQ' } })
		);
		const result = await apiGet('https://api.test/v1/podcasts/p/episodes', { fetch });
		expect(result).toMatchObject({ status: 'ok', data: [{ id: 'x' }], nextCursor: 'MjAyNi0wMQ' });
	});

	it('not-modified: sends If-None-Match only when given an ETag', async () => {
		const fetch = respond(null, { status: 304, headers: { ETag: '"abc"' } });
		expect(await apiGet('https://api.test/x', { fetch, etag: '"abc"' })).toEqual({
			status: 'not-modified',
			etag: '"abc"'
		});
		expect(fetch).toHaveBeenCalledWith('https://api.test/x', {
			headers: { 'If-None-Match': '"abc"' }
		});
	});

	it.each([
		[404, 'not-found'],
		[403, 'unavailable']
	])('%i is %s', async (status, expected) => {
		const fetch = respond(JSON.stringify({ error: { code: 'x' } }), { status });
		expect(await apiGet('https://api.test/x', { fetch })).toEqual({ status: expected });
	});

	it('rate-limited: reads Retry-After in seconds or as a date, with a default', async () => {
		const seconds = respond('', { status: 429, headers: { 'Retry-After': '12' } });
		expect(await apiGet('https://api.test/x', { fetch: seconds })).toEqual({
			status: 'rate-limited',
			retryAfter: 12
		});
		const date = new Date(Date.now() + 61_000).toUTCString();
		const dated = respond('', { status: 429, headers: { 'Retry-After': date } });
		const result = await apiGet('https://api.test/x', { fetch: dated });
		expect(result.status === 'rate-limited' && result.retryAfter).toBeGreaterThanOrEqual(59);
		const none = respond('', { status: 429 });
		expect(await apiGet('https://api.test/x', { fetch: none })).toEqual({
			status: 'rate-limited',
			retryAfter: DEFAULT_RETRY_AFTER
		});
	});

	it('error: 5xx, a network failure, and a body that is not the envelope', async () => {
		expect(await apiGet('https://api.test/x', { fetch: respond('', { status: 503 }) })).toEqual({
			status: 'error',
			httpStatus: 503
		});
		const offline = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
		expect(await apiGet('https://api.test/x', { fetch: offline })).toEqual({
			status: 'error',
			httpStatus: 0
		});
		expect(await apiGet('https://api.test/x', { fetch: respond('<html>') })).toEqual({
			status: 'error',
			httpStatus: 200
		});
		expect(await apiGet('https://api.test/x', { fetch: respond('{"nope":1}') })).toEqual({
			status: 'error',
			httpStatus: 200
		});
	});

	it('builds the episode and latest-episode endpoints', () => {
		expect(episodeEndpoint('https://api.show.fm', 'a b')).toBe(
			'https://api.show.fm/v1/episodes/a%20b'
		);
		expect(latestEpisodeEndpoint('https://api.show.fm', 'test-signal')).toBe(
			'https://api.show.fm/v1/podcasts/test-signal/episodes/latest'
		);
	});
});
