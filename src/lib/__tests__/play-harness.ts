/**
 * Shared set-up for the play button and mini-player tests: a mock of the
 * public API, media that "plays" in jsdom, and a fresh page audio
 * controller for every test.
 */
import { vi } from 'vitest';
import { episodePayload } from '../../../tests/fixtures/episode';
import { listPage, podcastPayload, sampleEpisodes } from '../../../tests/fixtures/episodes';

export const API = 'https://api.example.test';
export const EPISODE_ID = '11111111-2222-4333-8444-555555555555';
export const HOSTED_AUDIO = 'https://m.cdn.media/test-signal/audio.mp3';
const CONTROLLER = Symbol.for('showfm.page-audio-controller.v1');

export interface MockApi {
	/** Status of GET /v1/episodes/{id} and /episodes/latest; `pending` never answers. */
	episode: number | 'pending';
	/** Status of the same request asked again after the audio fails. */
	recheck: number;
	/** Fields over the fixture payload. */
	payload: Record<string, unknown>;
	branded: boolean;
}

export const api: MockApi = { episode: 200, recheck: 200, payload: {}, branded: true };
export const requests: string[] = [];

function respond(status: number, body: unknown) {
	return new Response(status === 200 ? JSON.stringify(body) : '{}', {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export function payload() {
	const base = episodePayload({ branded: api.branded });
	return {
		...base,
		episode_type: 'full',
		season_number: 2,
		episode_number: 4,
		audio: { ...base.audio, url: HOSTED_AUDIO, duration_seconds: 3138 },
		...api.payload
	};
}

export const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = new URL(String(input));
	requests.push(url.pathname);
	// The episode list's two requests, for the tests that put one on the page.
	if (url.pathname.endsWith('/episodes')) return respond(200, listPage(sampleEpisodes()));
	if (/^\/v1\/podcasts\/[^/]+$/.test(url.pathname)) {
		return respond(200, { data: podcastPayload({ branded: api.branded }) });
	}
	const asked = requests.filter((path) => path === url.pathname).length;
	const status = asked > 1 ? api.recheck : api.episode;
	if (status === 'pending') return new Promise<Response>(() => {});
	return respond(status, { data: payload() });
});

// ── media: jsdom has no playback ──────────────────────────────────────
export type PlayOutcome = 'ok' | 'blocked' | 'error';
/** What media does: how play() ends, and the length it reports (NaN: not known). */
export const media = { outcome: 'ok' as PlayOutcome, duration: 3138 };
const paused = new WeakMap<HTMLMediaElement, boolean>();
const times = new WeakMap<HTMLMediaElement, number>();

export function mediaEvent(audio: HTMLMediaElement, type: string) {
	audio.dispatchEvent(new Event(type));
}

/** Call once per file, in beforeAll. */
export function installMedia() {
	Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
		configurable: true,
		get(this: HTMLMediaElement) {
			return paused.get(this) ?? true;
		}
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
		configurable: true,
		get(this: HTMLMediaElement) {
			return times.get(this) ?? 0;
		},
		set(this: HTMLMediaElement, value: number) {
			times.set(this, value);
			mediaEvent(this, 'timeupdate');
		}
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
		configurable: true,
		get: () => media.duration
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			if (media.outcome === 'blocked') throw new DOMException('blocked', 'NotAllowedError');
			if (media.outcome === 'error') {
				mediaEvent(this, 'error');
				throw new DOMException('no source', 'NotSupportedError');
			}
			paused.set(this, false);
			mediaEvent(this, 'play');
			mediaEvent(this, 'playing');
		})
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value: vi.fn(function (this: HTMLMediaElement) {
			if (paused.get(this) === false) {
				paused.set(this, true);
				mediaEvent(this, 'pause');
			}
		})
	});
	// jsdom has no canvas: the waveform paints nothing, quietly.
	HTMLCanvasElement.prototype.getContext = (() =>
		null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

/** Call in beforeEach. */
export function resetPage() {
	Object.assign(api, { episode: 200, recheck: 200, payload: {}, branded: true });
	requests.length = 0;
	media.outcome = 'ok';
	media.duration = 3138;
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	delete (globalThis as unknown as Record<symbol, unknown>)[CONTROLLER];
}

const originalMatchMedia = typeof window !== 'undefined' ? window.matchMedia : undefined;

/** Call in afterEach. */
export function clearPage() {
	document.body.innerHTML = '';
	window.matchMedia = originalMatchMedia!;
	document.documentElement.removeAttribute('lang');
	delete (window as unknown as { showfmStrings?: unknown }).showfmStrings;
	vi.unstubAllGlobals();
}

/** Waits for the fetches and Svelte's effects to settle. */
export async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The shared audio element, once something has played. */
export function sharedAudio(): HTMLAudioElement {
	const controller = (globalThis as unknown as Record<symbol, { sharedAudio(): HTMLAudioElement }>)[
		CONTROLLER
	];
	return controller.sharedAudio();
}

/** The focused element, looking inside shadow roots. */
export function deepActive(): Element | null {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
	return active;
}

/** Answers a matchMedia query: phones for `(max-width: 640px)`, dark for the colour scheme. */
export function viewport({ phone = false, dark = false } = {}) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query.includes('max-width') ? phone : query.includes('dark') ? dark : false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
	window.matchMedia = globalThis.matchMedia;
}

export const AXE = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};
