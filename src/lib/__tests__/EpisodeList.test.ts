/**
 * <showfm-episodes>, mounted the way v1.js mounts it (episodes.svelte.ts)
 * into an element's shadow root, against a mock of the public API.
 *
 * Covers every whole-list and row state in the design (pages 2 and 5), the
 * Auto layout, paging with the keyset cursor and where focus goes, the
 * filters, the page audio controller (a row pauses a player and the
 * reverse), the credit, the strings and jest-axe on each state.
 */
import { within } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEpisodes } from '../episodes.svelte';
import { pageController } from '../controller';
import { renderEpisodeListHTML } from '../fallback';
import {
	EXTERNAL_AUDIO,
	HOSTED_AUDIO,
	episodeItem,
	listPage,
	podcastPayload,
	sampleEpisodes,
	type EpisodeItem
} from '../../../tests/fixtures/episodes';

const API = 'https://api.example.test';
const CONTROLLER = Symbol.for('showfm.page-audio-controller.v1');

// ── a mock public API ─────────────────────────────────────────────────
interface MockApi {
	podcast: number;
	episodes: EpisodeItem[];
	pageSize: number | null;
	/** Status of GET /v1/episodes/{id}, asked when a row's audio fails. */
	episodeStatus: number;
	/** Status of the next pages (after the first). */
	moreStatus: number;
	pending: boolean;
	branded: boolean;
}
let api: MockApi;
let requests: string[];

function respond(status: number, body: unknown) {
	return new Response(status === 200 ? JSON.stringify(body) : '{}', {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = new URL(String(input));
	requests.push(url.pathname + url.search);
	if (api.pending) return new Promise<Response>(() => {});
	if (url.pathname.startsWith('/v1/episodes/')) return respond(api.episodeStatus, { data: {} });
	if (!url.pathname.endsWith('/episodes')) {
		return respond(api.podcast, { data: podcastPayload({ branded: api.branded }) });
	}
	const cursor = url.searchParams.get('cursor');
	if (cursor && api.moreStatus !== 200) return respond(api.moreStatus, {});
	if (api.podcast !== 200) return respond(api.podcast, {});
	const limit = api.pageSize ?? Number(url.searchParams.get('limit'));
	const start = cursor ? Number(cursor.slice(1)) : 0;
	const next = start + limit < api.episodes.length ? `c${start + limit}` : null;
	return respond(200, listPage(api.episodes.slice(start, start + limit), next));
});

// ── media: jsdom has no playback ──────────────────────────────────────
type PlayOutcome = 'ok' | 'blocked' | 'error';
let playOutcome: PlayOutcome;
const paused = new WeakMap<HTMLMediaElement, boolean>();

function mediaEvent(audio: HTMLMediaElement, type: string) {
	audio.dispatchEvent(new Event(type));
}

beforeAll(() => {
	Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
		configurable: true,
		get(this: HTMLMediaElement) {
			return paused.get(this) ?? true;
		}
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			if (playOutcome === 'blocked') throw new DOMException('blocked', 'NotAllowedError');
			if (playOutcome === 'error') {
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
			paused.set(this, true);
			mediaEvent(this, 'pause');
		})
	});
	// jsdom has no canvas: the waveform paints nothing, quietly.
	HTMLCanvasElement.prototype.getContext = (() =>
		null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

let hosts: HTMLElement[] = [];

beforeEach(() => {
	api = {
		podcast: 200,
		episodes: sampleEpisodes(),
		pageSize: null,
		episodeStatus: 200,
		moreStatus: 200,
		pending: false,
		branded: true
	};
	requests = [];
	playOutcome = 'ok';
	vi.stubGlobal('fetch', fetchMock);
	delete (globalThis as unknown as Record<symbol, unknown>)[CONTROLLER];
});

afterEach(() => {
	for (const host of hosts) host.remove();
	hosts = [];
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('lang');
	delete (window as unknown as { showfmStrings?: unknown }).showfmStrings;
	vi.unstubAllGlobals();
});

/** Waits for the fetches and Svelte's effects to settle. */
async function settle() {
	for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Mounts a list the way v1.js does. */
async function mountList(attributes: Record<string, string> = {}, children = '') {
	const host = document.createElement('showfm-episodes');
	host.setAttribute('api', API);
	host.setAttribute('podcast', 'the-long-table');
	for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
	host.innerHTML = children;
	document.body.append(host);
	hosts.push(host);
	const connection = mountEpisodes(host);
	await settle();
	const root = host.shadowRoot!;
	const view = within(root as unknown as HTMLElement);
	const rows = () => [...root.querySelectorAll<HTMLElement>('[data-row]')];
	return { host, root, view, rows, connection };
}

const row = (root: ShadowRoot, index: number) =>
	root.querySelectorAll<HTMLElement>('[data-row]')[index];

/** Reports `width` for the element's box, as a ResizeObserver would. */
function boxWidth(width: number) {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(private callback: ResizeObserverCallback) {}
			observe() {
				queueMicrotask(() =>
					this.callback(
						[{ contentRect: { width } } as ResizeObserverEntry],
						this as unknown as ResizeObserver
					)
				);
			}
			disconnect() {}
		}
	);
}

const AXE = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};

// ── whole-list states ─────────────────────────────────────────────────
describe('whole-list states', () => {
	it('loading: a skeleton with one row per fallback item, at the real row height', async () => {
		api.pending = true;
		const fallback = renderEpisodeListHTML(
			{ title: 'The Long Table' },
			sampleEpisodes().slice(0, 4)
		);
		const { host, view, root } = await mountList({}, fallback);
		expect(view.getByRole('status', { name: 'Loading episodes' })).toBeInTheDocument();
		expect(root.querySelectorAll('.sk-row')).toHaveLength(4);
		// The fallback links stay in the light DOM for search engines.
		expect(host.querySelectorAll(':scope > ul > li a')).toHaveLength(4);
		expect(await axe(host)).toHaveNoViolations();
	});

	it('ready: a Card list of the episodes, with "Powered by show.fm"', async () => {
		const { host, view, rows } = await mountList();
		expect(rows()).toHaveLength(7);
		expect(view.getByRole('link', { name: /Sourdough, salt/ })).toHaveAttribute(
			'href',
			'https://show.fm/the-long-table/e/episode-1'
		);
		expect(view.getByRole('link', { name: /Powered by/ })).toBeInTheDocument();
		expect(requests).toContain('/v1/podcasts/the-long-table');
		expect(requests).toContain('/v1/podcasts/the-long-table/episodes?limit=10');
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('no episodes yet: the message names the show', async () => {
		api.episodes = [];
		const { host, view } = await mountList();
		expect(view.getByText('No episodes yet')).toBeInTheDocument();
		expect(
			view.getByText(
				'New episodes of The Long Table will appear here as soon as they’re published.'
			)
		).toBeInTheDocument();
		expect(await axe(host)).toHaveNoViolations();
	});

	it("couldn't load: the error card, and Try again asks again", async () => {
		api.podcast = 500;
		const { host, view, rows } = await mountList();
		expect(view.getByRole('alert')).toHaveTextContent('Episodes can’t be loaded right now.');
		expect(await axe(host)).toHaveNoViolations();
		api.podcast = 200;
		view.getByRole('button', { name: 'Try again' }).click();
		await settle();
		expect(rows()).toHaveLength(7);
	});

	it('suspended (403): the message only, no titles, artwork or actions', async () => {
		api.podcast = 403;
		const { host, root } = await mountList();
		expect(root.querySelector('.message-card')).toHaveAttribute('role', 'status');
		expect(root.querySelector('.message-card')).toHaveTextContent(
			'This show isn’t available right now.'
		);
		expect(root.querySelectorAll('[data-row], img, button, a')).toHaveLength(0);
		expect(await axe(host)).toHaveNoViolations();
	});

	it('404: collapses with nothing rendered and the reserved height released', async () => {
		api.podcast = 404;
		const { host, root } = await mountList({}, '<ul><li><a href="https://x.test">x</a></li></ul>');
		expect(host.hasAttribute('data-showfm-collapsed')).toBe(true);
		expect(root.querySelector('.list')?.textContent?.trim()).toBe('');
	});

	it('no podcast: the error card, with no request', async () => {
		const host = document.createElement('showfm-episodes');
		document.body.append(host);
		hosts.push(host);
		mountEpisodes(host);
		await settle();
		expect(within(host.shadowRoot as unknown as HTMLElement).getByRole('alert')).toBeTruthy();
		expect(requests).toEqual([]);
	});
});

// ── paging ────────────────────────────────────────────────────────────
describe('loading more', () => {
	it('pages with the cursor and moves focus to the first new episode', async () => {
		const { root, view, rows } = await mountList({ count: '3' });
		expect(rows()).toHaveLength(3);
		const more = view.getByRole('button', { name: 'Load more episodes' });
		more.focus();
		more.click();
		await settle();
		expect(requests).toContain('/v1/podcasts/the-long-table/episodes?limit=3&cursor=c3');
		expect(rows()).toHaveLength(6);
		expect(root.activeElement).toBe(row(root, 3).querySelector('[data-play]'));
	});

	it('shows "Loading episodes…" while the next page is on its way, keeping focus', async () => {
		const { root, view } = await mountList({ count: '3' });
		api.pending = true;
		const more = view.getByRole('button', { name: 'Load more episodes' });
		more.focus();
		more.click();
		await settle();
		const busy = view.getByRole('button', { name: 'Loading episodes…' });
		expect(busy).toHaveAttribute('aria-busy', 'true');
		expect(busy).toHaveAttribute('aria-disabled', 'true');
		expect(root.activeElement).toBe(busy);
	});

	it('ends with "That’s every episode of …" once the last page is in', async () => {
		const { view } = await mountList({ count: '4' });
		expect(view.queryByText(/every episode/)).toBeNull();
		view.getByRole('button', { name: 'Load more episodes' }).click();
		await settle();
		expect(view.queryByRole('button', { name: 'Load more episodes' })).toBeNull();
		expect(view.getByText('That’s every episode of The Long Table.')).toBeInTheDocument();
	});

	it('a failed page keeps the button and says why', async () => {
		const { view, rows } = await mountList({ count: '3' });
		api.moreStatus = 500;
		view.getByRole('button', { name: 'Load more episodes' }).click();
		await settle();
		expect(rows()).toHaveLength(3);
		expect(view.getByRole('button', { name: 'Load more episodes' })).toBeInTheDocument();
		expect(view.getAllByRole('status').some((el) => /can’t be loaded/.test(el.textContent!))).toBe(
			true
		);
	});

	it('a page that finds the show suspended turns the whole list to the message', async () => {
		const { root, view } = await mountList({ count: '3' });
		api.moreStatus = 403;
		view.getByRole('button', { name: 'Load more episodes' }).click();
		await settle();
		expect(root.querySelector('.message-card')).toHaveTextContent(
			'This show isn’t available right now.'
		);
		expect(root.querySelectorAll('[data-row]')).toHaveLength(0);
	});

	it.each([
		['a page of the old query', 200],
		['a 403 for the old query', 403]
	])('drops %s once the query has changed', async (_, oldStatus) => {
		const { root, view, rows, host } = await mountList({ count: '3' });
		// Hold the next page until the new query has loaded.
		let answer!: (response: Response) => void;
		vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
			new URL(String(input)).searchParams.has('cursor')
				? new Promise<Response>((resolve) => (answer = resolve))
				: fetchMock(input)
		);
		view.getByRole('button', { name: 'Load more episodes' }).click();
		await settle();
		api.episodes = [episodeItem({ index: 20 }), episodeItem({ index: 21 })];
		host.setAttribute('podcast', 'another-show');
		await settle();
		const fresh = rows().map((element) => element.dataset.row);
		expect(fresh).toEqual(api.episodes.map((episode) => episode.id));
		// The old answer arrives last.
		answer(respond(oldStatus, listPage(sampleEpisodes().slice(3, 6), 'c6')));
		await settle();
		expect(rows().map((element) => element.dataset.row)).toEqual(fresh);
		expect(view.queryByRole('button', { name: /more episodes|Loading episodes/ })).toBeNull();
		expect(root.querySelector('.message-card')).toBeNull();
	});
});

describe('URLs from the API', () => {
	it.each([
		'javascript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'/relative/path',
		'//evil.example/x'
	])('%s never reaches an href or src; the row stays usable', async (bad) => {
		api.episodes = [
			episodeItem({ index: 1, title: 'Bad links', audio: bad, artwork: bad }),
			episodeItem({ index: 2, title: 'Good links' })
		];
		api.episodes[0].links.listen = bad;
		const { root, view, rows } = await mountList();
		const urls = [...root.querySelectorAll('[href],[src]')].map(
			(element) => element.getAttribute('href') ?? element.getAttribute('src')
		);
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) expect(url).toMatch(/^https?:\/\//);
		// The bad row keeps its title, as text, and says it can't be played.
		const [first, second] = rows();
		expect(within(first).getByText('Bad links')).not.toHaveAttribute('href');
		expect(first.querySelector('img')).toBeNull();
		expect(within(first).getByText('This episode can’t be played right now.')).toBeInTheDocument();
		// The good row is untouched.
		expect(within(second).getByRole('link', { name: 'Good links' })).toHaveAttribute(
			'href',
			api.episodes[1].links.listen
		);
		expect(second.querySelector('img')).toHaveAttribute('src', api.episodes[1].artwork.url);
		expect(view.getAllByRole('button', { name: /^Play: Good links/ })).toHaveLength(1);
	});
});

describe('filters', () => {
	it('season and hide become the API filters, count the page size', async () => {
		await mountList({ season: '2', hide: 'trailer,bonus', count: '5' });
		expect(requests).toContain('/v1/podcasts/the-long-table/episodes?limit=5&season=2&type=full');
	});

	it('hiding trailers keeps bonus episodes', async () => {
		await mountList({ hide: 'trailer' });
		expect(requests).toContain('/v1/podcasts/the-long-table/episodes?limit=10&type=bonus%2Cfull');
	});

	it('asks again when an attribute changes', async () => {
		const { host } = await mountList();
		host.setAttribute('season', '1');
		await settle();
		expect(requests).toContain('/v1/podcasts/the-long-table/episodes?limit=10&season=1');
	});
});

// ── layout ────────────────────────────────────────────────────────────
describe('layout', () => {
	const listClass = (root: ShadowRoot) => root.querySelector('.list')!.className;

	it('Auto: a list under 900px', async () => {
		boxWidth(720);
		const { root } = await mountList();
		expect(listClass(root)).toContain('l-list');
	});

	it('Auto: Card goes to the grid from 900px when half have their own artwork', async () => {
		boxWidth(1100);
		const { root } = await mountList();
		expect(listClass(root)).toContain('l-grid');
	});

	it('Auto: Card stays a list when most episodes share the show’s artwork', async () => {
		boxWidth(1100);
		api.episodes = sampleEpisodes().map((episode) => ({
			...episode,
			artwork: { ...episode.artwork, own: false }
		}));
		const { root } = await mountList();
		expect(listClass(root)).toContain('l-list');
	});

	it('Auto: Minimal goes to the grid on width alone', async () => {
		boxWidth(1100);
		api.episodes = sampleEpisodes().map((episode) => ({
			...episode,
			artwork: { ...episode.artwork, own: false }
		}));
		const { root } = await mountList({ variant: 'minimal' });
		expect(listClass(root)).toContain('v-minimal l-grid');
	});

	it('a forced grid under 480px falls back to the list', async () => {
		boxWidth(340);
		const { root } = await mountList({ layout: 'grid' });
		expect(listClass(root)).toContain('l-list');
		expect(listClass(root)).toContain('narrow');
	});

	it('compact has no artwork and no descriptions', async () => {
		const { root, host } = await mountList({ layout: 'compact' });
		expect(root.querySelectorAll('img, .desc')).toHaveLength(0);
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('style="minimal" works as an alias of variant', async () => {
		const { root } = await mountList({ style: 'minimal' });
		expect(listClass(root)).toContain('v-minimal');
	});

	it('Minimal: a labelled play pill, with the number read out', async () => {
		const { root, view, host } = await mountList({ variant: 'minimal', layout: 'list' });
		expect(
			view.getByRole('button', {
				name: 'Play · 52 min: Sourdough, salt and the slow return of the village bakery'
			})
		).toHaveTextContent('Play · 52 min');
		expect(row(root, 0).querySelector('.idx')).toHaveAttribute('aria-hidden', 'true');
		expect(row(root, 0)).toHaveTextContent('Season 2, episode 4');
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('Minimal grid and compact are axe-clean too', async () => {
		boxWidth(1100);
		const grid = await mountList({ variant: 'minimal', layout: 'grid' });
		expect(await axe(grid.host, AXE)).toHaveNoViolations();
		const compact = await mountList({ variant: 'minimal', layout: 'compact' });
		expect(compact.root.querySelector('.list')!.className).toContain('l-compact');
		expect(await axe(compact.host, AXE)).toHaveNoViolations();
	});

	it('Card grid: play sits on the artwork and descriptions clamp with no "More"', async () => {
		boxWidth(1100);
		const { root, host } = await mountList({ layout: 'grid' });
		expect(root.querySelector('.more')).toBeNull();
		expect(await axe(host, AXE)).toHaveNoViolations();
	});
});

// ── rows ──────────────────────────────────────────────────────────────
describe('rows', () => {
	it('meta line: "S2 · E4" shows and "Season 2, episode 4" is read', async () => {
		const { root } = await mountList();
		const meta = row(root, 0).querySelector('.meta')!;
		expect(meta.querySelector('[aria-hidden="true"]')).toHaveTextContent('S2 · E4');
		expect(meta.querySelector('.vh')).toHaveTextContent('Season 2, episode 4');
	});

	it('trailer, bonus and explicit badges', async () => {
		const { root } = await mountList();
		expect(row(root, 2)).toHaveTextContent('Bonus');
		expect(row(root, 3)).toHaveTextContent('Explicit');
		expect(row(root, 6)).toHaveTextContent('Trailer');
	});

	it('no artwork: the mic tile, hidden from screen readers', async () => {
		const { root } = await mountList();
		const tile = row(root, 4).querySelector('.tile');
		expect(tile).not.toBeNull();
		expect(tile!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
		expect(row(root, 0).querySelector('img')).toHaveAttribute('alt', '');
	});

	it('titles are links, and headings only when heading-level is set', async () => {
		const plain = await mountList();
		expect(plain.root.querySelectorAll('h2, h3, h4, h5, h6')).toHaveLength(0);
		const headed = await mountList({ 'heading-level': '3' });
		expect(headed.view.getAllByRole('heading', { level: 3 })).toHaveLength(7);
		const wrong = await mountList({ 'heading-level': '1' });
		expect(wrong.root.querySelectorAll('h1')).toHaveLength(0);
	});

	it('long descriptions clamp, and More expands them', async () => {
		const { root, view } = await mountList();
		const more = view.getByRole('button', { name: 'More' });
		expect(more).toHaveAttribute('aria-expanded', 'false');
		more.click();
		await settle();
		expect(view.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
		expect(row(root, 0).querySelector('.desc')).toHaveClass('open');
	});

	it('descriptions="off" leaves them out', async () => {
		const { root } = await mountList({ descriptions: 'off' });
		expect(root.querySelectorAll('.desc')).toHaveLength(0);
	});

	it('an episode with no audio says it cannot be played, with no Try again', async () => {
		api.episodes = [episodeItem({ index: 1, audio: null })];
		const { root, view } = await mountList();
		expect(row(root, 0)).toHaveTextContent('This episode can’t be played right now.');
		expect(view.queryByRole('button', { name: 'Try again' })).toBeNull();
		expect(view.getByRole('link', { name: 'Listen on show.fm' })).toBeInTheDocument();
	});
});

// ── playback ──────────────────────────────────────────────────────────
describe('playing a row', () => {
	const sharedAudio = () => pageController().sharedAudio();

	it('plays on the shared audio: pause icon, "Now playing · time left", waveform', async () => {
		const { root, view, host } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		expect(sharedAudio().getAttribute('src')).toBe(`${HOSTED_AUDIO}?src=embed`);
		expect(view.getByRole('button', { name: /^Pause: Sourdough/ })).toBeInTheDocument();
		expect(row(root, 0)).toHaveClass('live');
		expect(row(root, 0)).toHaveTextContent('Now playing · 52 min left');
		expect(row(root, 0).querySelector('canvas.wave')).not.toBeNull();
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('paused: the play icon and "Paused · time left"', async () => {
		const { root, view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		view.getByRole('button', { name: /^Pause: Sourdough/ }).click();
		await settle();
		expect(view.getByRole('button', { name: /^Play: Sourdough/ })).toBeInTheDocument();
		expect(row(root, 0)).toHaveTextContent('Paused · 52 min left');
	});

	it('loading: the buffering arc while the audio waits', async () => {
		const { root, view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		mediaEvent(sharedAudio(), 'waiting');
		await settle();
		expect(row(root, 0).querySelector('[data-play]')).toHaveClass('busy');
		expect(row(root, 0)).toHaveTextContent('Loading…');
	});

	it('one row at a time: a second row takes the shared audio', async () => {
		const { root, view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		view.getByRole('button', { name: /^Play: Knives/ }).click();
		await settle();
		expect(row(root, 0)).not.toHaveClass('live');
		expect(row(root, 3)).toHaveClass('live');
	});

	it('external audio plays from its own host', async () => {
		const { view } = await mountList();
		view.getByRole('button', { name: /^Play: Leftovers/ }).click();
		await settle();
		expect(sharedAudio().getAttribute('src')).toBe(`${EXTERNAL_AUDIO}?src=embed`);
		expect(view.getByRole('button', { name: /^Pause: Leftovers/ })).toBeInTheDocument();
	});

	it('blocked by the browser: the message, focus on Try again, which resumes', async () => {
		playOutcome = 'blocked';
		const { root, view, host } = await mountList();
		const play = view.getByRole('button', { name: /^Play: Sourdough/ });
		play.focus();
		play.click();
		await settle();
		expect(row(root, 0)).toHaveTextContent('Your browser blocked audio playback.');
		const retry = view.getByRole('button', { name: 'Try again' });
		expect(root.activeElement).toBe(retry);
		expect(await axe(host, AXE)).toHaveNoViolations();
		playOutcome = 'ok';
		retry.click();
		await settle();
		expect(root.activeElement).toBe(row(root, 0).querySelector('[data-play]'));
		expect(view.getByRole('button', { name: /^Pause: Sourdough/ })).toBeInTheDocument();
	});

	it("can't be played: the message replaces the description, not the title", async () => {
		playOutcome = 'error';
		const { root, view } = await mountList();
		const play = view.getByRole('button', { name: /^Play: Sourdough/ });
		play.focus();
		play.click();
		await settle();
		expect(row(root, 0)).toHaveTextContent('This episode can’t be played right now.');
		expect(row(root, 0).querySelector('.desc')).toBeNull();
		expect(view.getByRole('link', { name: /Sourdough/ })).toBeInTheDocument();
		expect(root.activeElement).toBe(view.getByRole('button', { name: 'Try again' }));
		// The API was asked once whether the show was suspended.
		expect(requests.filter((path) => path.startsWith('/v1/episodes/'))).toHaveLength(1);
		// Try again reloads the audio.
		playOutcome = 'ok';
		view.getByRole('button', { name: 'Try again' }).click();
		await settle();
		expect(view.getByRole('button', { name: /^Pause: Sourdough/ })).toBeInTheDocument();
	});

	it('a failure mid-episode shows the message without moving focus', async () => {
		const { root, view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		const elsewhere = view.getByRole('link', { name: /Knives/ });
		elsewhere.focus();
		mediaEvent(sharedAudio(), 'error');
		await settle();
		expect(row(root, 0)).toHaveTextContent('This episode can’t be played right now.');
		expect(root.activeElement).toBe(elsewhere);
	});

	it('suspended row: only that row changes, with the message and no actions', async () => {
		playOutcome = 'error';
		api.episodeStatus = 403;
		const { root, view, host } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		expect(row(root, 0)).toHaveTextContent('This show isn’t available right now.');
		expect(row(root, 0).querySelectorAll('button, .msg a')).toHaveLength(0);
		expect(row(root, 1).querySelector('[data-play]')).not.toBeNull();
		// The row keeps its artwork, so a grid would not shift.
		expect(row(root, 0).querySelector('img')).not.toBeNull();
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('mini-player="on" asks for the shared mini-player; off by default', async () => {
		const plain = await mountList();
		const asked = vi.fn();
		document.addEventListener('showfm:mini-player', asked);
		plain.view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		expect(asked).not.toHaveBeenCalled();
		const withMini = await mountList({ 'mini-player': 'on' });
		withMini.view.getByRole('button', { name: /^Play: Knives/ }).click();
		await settle();
		expect(asked).toHaveBeenCalledTimes(1);
		document.removeEventListener('showfm:mini-player', asked);
	});
});

describe('the page audio controller', () => {
	/** A stand-in for a <showfm-player>'s own audio, attached as the player attaches it. */
	function playerAudio() {
		const audio = document.createElement('audio');
		pageController().attach(audio, audio, { id: 'player', title: 'Player episode' });
		return audio;
	}

	it('playing a row pauses a player on the page', async () => {
		const player = playerAudio();
		await player.play();
		expect(player.paused).toBe(false);
		const { view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		expect(player.paused).toBe(true);
	});

	it('playing a player pauses the row, which shows as paused', async () => {
		const player = playerAudio();
		const { root, view } = await mountList();
		view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		await player.play();
		await settle();
		expect(pageController().sharedAudio().paused).toBe(true);
		expect(view.getByRole('button', { name: /^Play: Sourdough/ })).toBeInTheDocument();
		expect(row(root, 0)).toHaveTextContent('Paused · 52 min left');
	});

	it('two lists: starting one pauses the other, whose row goes back to rest', async () => {
		const first = await mountList();
		const second = await mountList();
		first.view.getByRole('button', { name: /^Play: Sourdough/ }).click();
		await settle();
		second.view.getByRole('button', { name: /^Play: Knives/ }).click();
		await settle();
		expect(row(first.root, 0)).not.toHaveClass('live');
		expect(row(second.root, 3)).toHaveClass('live');
	});
});

// ── credit, strings, load="click", lifecycle ──────────────────────────
describe('"Powered by show.fm"', () => {
	const credited = (root: ShadowRoot) => !!root.querySelector('.powered-by');

	it('follows the plan, and credit overrides it', async () => {
		api.branded = false;
		expect(credited((await mountList()).root)).toBe(false);
		document.body.innerHTML = '';
		expect(credited((await mountList({ credit: 'on' })).root)).toBe(true);
	});

	it('credit="off" hides it', async () => {
		expect(credited((await mountList({ credit: 'off' })).root)).toBe(false);
	});

	it('shows once per page, on the first embed', async () => {
		const first = await mountList();
		const second = await mountList();
		expect(credited(first.root)).toBe(true);
		expect(credited(second.root)).toBe(false);
	});
});

describe('strings', () => {
	it('German from lang on the element', async () => {
		const { root, view } = await mountList({ lang: 'de', count: '3' });
		expect(view.getByRole('button', { name: 'Weitere Folgen laden' })).toBeInTheDocument();
		expect(row(root, 0).querySelector('.meta')).toHaveTextContent('St. 2 · Folge 4');
		expect(view.getByRole('button', { name: /^Abspielen: Sourdough/ })).toBeInTheDocument();
	});

	it('French from <html lang>, followed live', async () => {
		const { view } = await mountList({ count: '3' });
		document.documentElement.setAttribute('lang', 'fr');
		await settle();
		expect(view.getByRole('button', { name: 'Charger plus d’épisodes' })).toBeInTheDocument();
		expect(view.getByRole('button', { name: /^Lire\u202f: Sourdough/ })).toBeInTheDocument();
	});

	it('element.strings and window.showfmStrings override, before and after mounting', async () => {
		(window as unknown as { showfmStrings: unknown }).showfmStrings = { more: 'Read more' };
		const host = document.createElement('showfm-episodes') as HTMLElement & {
			strings?: Record<string, string>;
		};
		host.setAttribute('api', API);
		host.setAttribute('podcast', 'the-long-table');
		host.setAttribute('count', '3');
		host.strings = { loadMore: 'Show me more' };
		document.body.append(host);
		hosts.push(host);
		mountEpisodes(host);
		await settle();
		const view = within(host.shadowRoot as unknown as HTMLElement);
		expect(view.getByRole('button', { name: 'Show me more' })).toBeInTheDocument();
		expect(view.getByRole('button', { name: 'Read more' })).toBeInTheDocument();
		host.strings = { loadMore: 'Next' };
		await settle();
		expect(view.getByRole('button', { name: 'Next' })).toBeInTheDocument();
		expect(host.strings).toEqual({ loadMore: 'Next' });
	});
});

describe('load="click"', () => {
	it('a list loaded from its facade replaces it, says so and focuses the first episode', async () => {
		const { root, view, host } = await mountList(
			{ load: 'click', 'data-showfm-activated': 'load', 'data-showfm-focus': '' },
			'<div data-showfm-facade-ui><button>Load episodes</button></div>'
		);
		expect(host.querySelector('[data-showfm-facade-ui]')).toBeNull();
		expect(host.hasAttribute('data-showfm-activated')).toBe(false);
		expect(view.getByText('Episodes loaded')).toBeInTheDocument();
		expect(root.activeElement).toBe(row(root, 0).querySelector('[data-play]'));
		// Loading does not play.
		expect(pageController().snapshot().state).toBe('idle');
	});
});

describe('lifecycle', () => {
	it('unmounts on disconnect and mounts again on reconnect', async () => {
		const { root, connection, rows } = await mountList();
		connection(false);
		expect(root.querySelector('.list')).toBeNull();
		connection(true);
		await settle();
		expect(rows()).toHaveLength(7);
	});
});
