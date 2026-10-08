/**
 * A host page for <showfm-episodes> and <showfm-play> in Chromium: v1.js,
 * its lazy chunks, the click loader and the fallback stylesheet from dist/,
 * a mock of the public API, and silent audio for the show.fm media host.
 * Run `pnpm build` first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';
import { listPage, podcastPayload, sampleEpisodes, type EpisodeItem } from '../fixtures/episodes';
import { conversationVtt } from '../fixtures/transcript';
import { fontFile } from './fonts';

export const PAGE_ORIGIN = 'https://host.example.test';
export const API_ORIGIN = 'https://api.example.test';

const dist = (path: string) => fileURLToPath(new URL(`../../dist/cdn/${path}`, import.meta.url));
// A 1x1 terracotta PNG, so artwork shows in screenshots.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4EWoLAANDAVtkFVi4AAAAAElFTkSuQmCC',
	'base64'
);

/** `seconds` of silence as 8 kHz, 8-bit mono WAV, so playback really runs. */
function silence(seconds: number) {
	const samples = 8000 * seconds;
	const wav = Buffer.alloc(44 + samples, 128);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(36 + samples, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8000, 24);
	wav.writeUInt32LE(8000, 28);
	wav.writeUInt16LE(1, 32);
	wav.writeUInt16LE(8, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(samples, 40);
	return wav;
}
const AUDIO = silence(30);

/** The silent audio, with byte ranges so it can be seeked as on the real media host. */
function audio(route: Route) {
	const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
	if (!range) {
		return route.fulfill({
			body: AUDIO,
			contentType: 'audio/wav',
			headers: { 'accept-ranges': 'bytes' }
		});
	}
	const start = Number(range[1]);
	const end = range[2] ? Number(range[2]) : AUDIO.length - 1;
	return route.fulfill({
		status: 206,
		body: AUDIO.subarray(start, end + 1),
		contentType: 'audio/wav',
		headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${AUDIO.length}` }
	});
}

export const CLICK_LOADER = readFileSync(dist('click-loader.js'), 'utf-8');

export interface ListPage {
	/** The host page's content width. */
	width?: number;
	/** Extra markup for the head. */
	head?: string;
	/** The script tag(s) after the body; v1.js by default. */
	script?: string;
	/** A Content-Security-Policy header for the page. */
	csp?: string;
	/** v1.js is held until this settles. */
	gate?: Promise<unknown>;
}

export interface ListApi {
	/** The podcast and first page; `pending` never answers. */
	status?: 'ok' | 'pending' | 'fail' | 'not-found' | 'suspended';
	episodes?: EpisodeItem[];
	/** Episodes per page the mock serves (else the request's limit). */
	pageSize?: number;
	branded?: boolean;
}

const json = (route: Route, status: number, body: unknown) =>
	route.fulfill({
		status,
		contentType: 'application/json',
		headers: { 'access-control-allow-origin': '*' },
		body: JSON.stringify(body)
	});

/** Serves the page with `body` (the elements) and answers the API from `api`. */
export async function serveList(
	page: Page,
	body: string,
	api: ListApi = {},
	{
		width = 720,
		head = '',
		script = '<script src="/player/v1.js"></script>',
		csp,
		gate
	}: ListPage = {}
) {
	const episodes = api.episodes ?? sampleEpisodes();
	const requests: string[] = [];
	await page.route(`${PAGE_ORIGIN}/**`, async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.startsWith('/player/')) {
			const file = path.slice('/player/'.length);
			const known = [
				'v1.js',
				'v1-fallback.css',
				...readdirSync(dist('chunks')).map((name) => `chunks/${name}`)
			];
			if (!known.includes(file)) return route.fulfill({ status: 404, body: '' });
			requests.push(file);
			if (file === 'v1.js') await gate;
			return route.fulfill({
				body: readFileSync(dist(file)),
				contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript'
			});
		}
		const font = fontFile(path);
		if (font) return route.fulfill({ body: font, contentType: 'font/woff2' });
		return route.fulfill({
			contentType: 'text/html',
			headers: csp ? { 'content-security-policy': csp } : {},
			body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/player/v1-fallback.css"><style>body{margin:0;padding:0 16px;width:${width}px;font:16px/1.5 system-ui,sans-serif}</style>${head}</head><body>${body}<p id="after">After the list</p>${script}</body></html>`
		});
	});
	await page.route(`${API_ORIGIN}/**`, (route) => {
		const url = new URL(route.request().url());
		requests.push(url.pathname + url.search);
		const status = api.status ?? 'ok';
		if (status === 'pending') return;
		if (status === 'fail') return route.fulfill({ status: 500, body: '' });
		if (status === 'not-found') return json(route, 404, { error: { code: 'not_found' } });
		if (status === 'suspended') return json(route, 403, { error: { code: 'unavailable' } });
		// One episode (a play button or a player): by id, or the show's latest.
		const one = url.pathname.match(/^\/v1\/episodes\/([^/]+)$/)?.[1];
		if (one || url.pathname.endsWith('/episodes/latest')) {
			const episode = one ? episodes.find((item) => item.id === one) : episodes[0];
			if (!episode) return json(route, 404, { error: { code: 'not_found' } });
			return json(route, 200, {
				data: { ...episode, podcast: podcastPayload({ branded: api.branded ?? true }) }
			});
		}
		if (!url.pathname.endsWith('/episodes')) {
			return json(route, 200, { data: podcastPayload({ branded: api.branded ?? true }) });
		}
		const limit = api.pageSize ?? Number(url.searchParams.get('limit') ?? 10);
		const start = Number(url.searchParams.get('cursor')?.slice(1) ?? 0);
		const next = start + limit < episodes.length ? `c${start + limit}` : null;
		return json(route, 200, listPage(episodes.slice(start, start + limit), next));
	});
	// Artwork, and the external audio (EXTERNAL_AUDIO), which plays from there.
	await page.route('https://media.example.test/**', (route) =>
		new URL(route.request().url()).pathname.endsWith('.mp3')
			? audio(route)
			: route.fulfill({ body: PNG, contentType: 'image/png' })
	);
	// Audio, and a WebVTT for an episode that has one (the list's transcript).
	await page.route('https://m.cdn.media/**', (route) =>
		route.request().url().endsWith('.vtt')
			? route.fulfill({
					body: conversationVtt().vtt,
					contentType: 'text/vtt',
					headers: { 'access-control-allow-origin': '*' }
				})
			: audio(route)
	);
	// A held v1.js holds the load event too.
	await page.goto(`${PAGE_ORIGIN}/`, { waitUntil: gate ? 'commit' : 'load' });
	return requests;
}

/** Waits until the list in `selector` shows its rows. */
export async function listReady(page: Page, selector = 'showfm-episodes') {
	await page.waitForFunction(
		(sel) => !!document.querySelector(sel)?.shadowRoot?.querySelector('[data-row]'),
		selector
	);
}
