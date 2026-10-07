/**
 * The built loader with the built v1.js on a page whose only show.fm
 * element is a load="click" transcript (consent mode): showfm.load() adds
 * v1.js, which finds the transcript marked when it arrives, however late,
 * and the transcript mounts from its chunk.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	TRANSCRIPT_EPISODE_ID,
	TRANSCRIPT_VTT,
	conversationVtt,
	transcriptEpisode
} from '../fixtures/transcript';

const DIST = resolve(__dirname, '../../dist');
const LOADER = readFileSync(resolve(DIST, 'cdn/click-loader.js'), 'utf-8');
const V1 = readFileSync(resolve(DIST, 'cdn/v1.js'), 'utf-8');
const CHUNK = readdirSync(resolve(DIST, 'cdn/chunks')).find((f) => f.startsWith('transcript-'))!;
const CHUNK_SOURCE = readFileSync(resolve(DIST, 'cdn/chunks', CHUNK), 'utf-8');

const settle = async () => {
	for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const fetchSpy = vi.fn(async (input: RequestInfo | URL) =>
	String(input) === TRANSCRIPT_VTT
		? new Response(conversationVtt().vtt)
		: new Response(JSON.stringify({ data: transcriptEpisode() }))
);

beforeAll(() => vi.stubGlobal('fetch', fetchSpy));
afterAll(async () => {
	document.body.innerHTML = '';
	await settle();
	vi.unstubAllGlobals();
});

describe('a transcript-only page in consent mode', () => {
	it('loads nothing until showfm.load(), then mounts the transcript', async () => {
		document.body.innerHTML = `<showfm-transcript episode="${TRANSCRIPT_EPISODE_ID}" load="click"><div><p>Maya: So the bakery…</p></div></showfm-transcript>`;
		(0, eval)(LOADER);
		const element = document.querySelector('showfm-transcript')!;
		expect(element.querySelector('[data-showfm-facade-ui] button')).not.toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();

		(window as unknown as { showfm: { load: () => void } }).showfm.load();
		const added = [...document.querySelectorAll<HTMLScriptElement>('script[src]')];
		expect(added.map((s) => s.src)).toEqual(['https://embed.cdn.media/player/v1.js']);
		expect(fetchSpy).not.toHaveBeenCalled();

		// v1.js arrives after the press: the mark is waiting for it.
		const self = Object.assign(document.createElement('script'), { src: added[0].src });
		Object.defineProperty(document, 'currentScript', { configurable: true, get: () => self });
		(0, eval)(V1);
		Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
		await settle();
		const chunk = document.querySelector<HTMLScriptElement>('script[src*="/chunks/transcript-"]')!;
		expect(chunk).not.toBeNull();
		(0, eval)(CHUNK_SOURCE);
		chunk.dispatchEvent(new Event('load'));
		await settle();
		expect(element.shadowRoot?.querySelectorAll('.line').length).toBeGreaterThan(5);
	});
});
