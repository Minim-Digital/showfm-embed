/**
 * A host page for <showfm-transcript> and the player's transcript option in
 * Chromium: v1.js, its lazy chunks and the fallback stylesheet from dist/, a
 * mock of the public API, a WebVTT and silent audio on show.fm's media host.
 * Run `pnpm build` first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';
import {
	TRANSCRIPT_AUDIO,
	TRANSCRIPT_VTT,
	conversationVtt,
	transcriptEpisode
} from '../fixtures/transcript';
import { fontFile } from './fonts';

export const PAGE_ORIGIN = 'https://host.example.test';
export const API_ORIGIN = 'https://api.example.test';

const dist = (path: string) => fileURLToPath(new URL(`../../dist/cdn/${path}`, import.meta.url));

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

export interface TranscriptPage {
	/** The host page's content width. */
	width?: number;
	/** v1.js is held until this settles. */
	gate?: Promise<unknown>;
	/** Repeat the conversation this many times (a long transcript). */
	repeat?: number;
	/** The script tag(s) after the body; v1.js by default. */
	script?: string;
	/** The page's language. */
	lang?: string;
	/** Extra markup for the head. */
	head?: string;
}

const json = (route: Route, status: number, body: unknown) =>
	route.fulfill({
		status,
		contentType: 'application/json',
		headers: { 'access-control-allow-origin': '*' },
		body: JSON.stringify(body)
	});

/** Serves the page with `body` (the elements). Returns the requests made. */
export async function serveTranscript(
	page: Page,
	body: string,
	{
		width = 720,
		gate,
		repeat = 1,
		lang = 'en',
		head = '',
		script = '<script src="/player/v1.js"></script>'
	}: TranscriptPage = {}
) {
	const requests: string[] = [];
	const { vtt, duration } = conversationVtt({ repeat });
	await page.route(`${PAGE_ORIGIN}/**`, async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.startsWith('/player/')) {
			const file = path.slice('/player/'.length);
			const known = [
				'v1.js',
				'v1-fallback.css',
				...readdirSync(dist('chunks')).map((name) => `chunks/${name}`),
				...readdirSync(dist('locales')).map((name) => `locales/${name}`)
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
			body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><link rel="stylesheet" href="/player/v1-fallback.css"><style>body{margin:0;padding:0 16px;width:${width}px;font:16px/1.5 system-ui,sans-serif}</style>${head}</head><body>${body}<p id="after">After the transcript</p>${script}</body></html>`
		});
	});
	await page.route(`${API_ORIGIN}/**`, (route) => {
		const url = new URL(route.request().url());
		requests.push(url.pathname);
		return json(route, 200, { data: transcriptEpisode({ duration }) });
	});
	await page.route('https://media.example.test/**', (route) =>
		route.fulfill({ status: 404, body: '' })
	);
	const audio = silence(Math.min(duration, 180));
	await page.route('https://m.cdn.media/**', (route) => {
		const url = route.request().url();
		requests.push(url);
		if (url === TRANSCRIPT_VTT) {
			return route.fulfill({
				body: vtt,
				contentType: 'text/vtt',
				headers: { 'access-control-allow-origin': '*' }
			});
		}
		if (url.startsWith(TRANSCRIPT_AUDIO)) {
			// Byte ranges, so the audio can be seeked as on the real media host.
			const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
			if (!range) {
				return route.fulfill({
					body: audio,
					contentType: 'audio/wav',
					headers: { 'accept-ranges': 'bytes' }
				});
			}
			const start = Number(range[1]);
			const end = range[2] ? Number(range[2]) : audio.length - 1;
			return route.fulfill({
				status: 206,
				body: audio.subarray(start, end + 1),
				contentType: 'audio/wav',
				headers: {
					'accept-ranges': 'bytes',
					'content-range': `bytes ${start}-${end}/${audio.length}`
				}
			});
		}
		return route.fulfill({ status: 404, body: '' });
	});
	await page.goto(`${PAGE_ORIGIN}/`, { waitUntil: gate ? 'commit' : 'load' });
	return requests;
}

/** Waits until the transcript in `selector` shows its lines. */
export async function transcriptReady(page: Page, selector = 'showfm-transcript') {
	await page.waitForFunction((sel) => {
		const host = document.querySelector(sel);
		const root = host?.shadowRoot ?? null;
		return !!root?.querySelector('.line');
	}, selector);
}

/** The transcript inside the player's shadow root, ready. */
export async function playerTranscriptReady(page: Page) {
	await page.waitForFunction(
		() =>
			!!document
				.querySelector('showfm-player')
				?.shadowRoot?.querySelector('.tr')
				?.shadowRoot?.querySelector('.line')
	);
}
