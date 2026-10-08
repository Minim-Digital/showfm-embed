/**
 * The shared client for the show.fm public API, used by every element.
 *
 * Callers branch on a typed result, never on raw status codes, so the rules
 * for each status live here. The statuses match the app's API and the
 * WordPress plugin's client:
 *
 *   ok            2xx with a `{ data }` body; a list's keyset cursor for the
 *                 next page is `nextCursor` (null on the last page)
 *   not-modified  304: the copy the caller holds (by ETag) is current
 *   not-found     404: scheduled, unpublished, deleted and unknown all look
 *                 the same, which is what stops schedules leaking
 *   unavailable   403: the show is suspended (code `unavailable`)
 *   rate-limited  429, with the seconds to wait from Retry-After
 *   error         anything else: 5xx, a network failure, a body that is not JSON
 *
 * In a browser the HTTP cache already revalidates with the ETag, so the
 * elements send no conditional header (it would also cost a CORS preflight).
 * Pass `etag` from a server, where there is no HTTP cache.
 */

export type ApiResult<T> =
	| { status: 'ok'; data: T; etag: string | null; nextCursor: string | null }
	| { status: 'not-modified'; etag: string | null }
	| { status: 'not-found' }
	| { status: 'unavailable' }
	| { status: 'rate-limited'; retryAfter: number }
	| { status: 'error'; httpStatus: number };

export type ApiStatus = ApiResult<unknown>['status'];

export interface ApiRequestOptions {
	/** Sends If-None-Match. A 304 then returns `not-modified`. */
	etag?: string | null;
	signal?: AbortSignal;
	/** A fetch implementation, for servers and tests. Defaults to the global one. */
	fetch?: typeof fetch;
}

/** Seconds to wait when a 429 has no usable Retry-After header. */
export const DEFAULT_RETRY_AFTER = 30;

function retryAfterSeconds(header: string | null, now = Date.now()): number {
	if (!header) return DEFAULT_RETRY_AFTER;
	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
	const date = Date.parse(header);
	if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
	return DEFAULT_RETRY_AFTER;
}

/** GET one public API resource and classify the answer. Never throws. */
export function apiGet<T>(url: string, options: ApiRequestOptions = {}): Promise<ApiResult<T>> {
	return classify<T>(url, options, retryAfterSeconds);
}

/**
 * apiGet for the elements: no options, and a 429's Retry-After is not read
 * (`retryAfter` is the default), since no element waits on it. Parsing it
 * would cost v1.js the HTTP-date handling for nothing.
 */
export function elementGet<T>(url: string): Promise<ApiResult<T>> {
	return classify<T>(url, {}, () => DEFAULT_RETRY_AFTER);
}

async function classify<T>(
	url: string,
	options: ApiRequestOptions,
	retryAfter: (header: string | null) => number
): Promise<ApiResult<T>> {
	const request = options.fetch ?? fetch;
	const init: RequestInit = {};
	if (options.etag) init.headers = { 'If-None-Match': options.etag };
	if (options.signal) init.signal = options.signal;

	let response: Response;
	try {
		// One argument when there is nothing to add, exactly as the v1 player
		// has always called it.
		response = await (Object.keys(init).length ? request(url, init) : request(url));
	} catch {
		return { status: 'error', httpStatus: 0 };
	}

	const etag = response.headers.get('ETag');
	if (response.status === 304) return { status: 'not-modified', etag };
	if (response.status === 404) return { status: 'not-found' };
	if (response.status === 403) return { status: 'unavailable' };
	if (response.status === 429) {
		return {
			status: 'rate-limited',
			retryAfter: retryAfter(response.headers.get('Retry-After'))
		};
	}
	if (!response.ok) return { status: 'error', httpStatus: response.status };
	try {
		const body = (await response.json()) as {
			data?: T;
			pagination?: { next_cursor?: string | null };
		};
		if (!body || typeof body !== 'object' || !('data' in body)) {
			return { status: 'error', httpStatus: response.status };
		}
		return {
			status: 'ok',
			data: body.data as T,
			etag,
			nextCursor: body.pagination?.next_cursor ?? null
		};
	} catch {
		return { status: 'error', httpStatus: response.status };
	}
}

/** GET /v1/episodes/{id} */
export function episodeEndpoint(api: string, episode: string): string {
	return `${api}/v1/episodes/${encodeURIComponent(episode)}`;
}

/** GET /v1/podcasts/{slug or id}/episodes/latest */
export function latestEpisodeEndpoint(api: string, podcast: string): string {
	return `${api}/v1/podcasts/${encodeURIComponent(podcast)}/episodes/latest`;
}
