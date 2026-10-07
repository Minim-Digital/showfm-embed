/**
 * <showfm-transcript> in the built files.
 *
 * - v1.js registers it, but the transcript itself is a lazy chunk in
 *   dist/cdn/chunks/: v1.js carries none of its code or strings, so a page
 *   with only a player loads none of it.
 * - The first transcript on a page adds the chunk as a script next to v1.js,
 *   once, with the page's nonce, and it mounts when the chunk has run.
 * - load="click" fetches nothing, not even the chunk, until showfm.load().
 * - The npm root carries the chunk, so a transcript mounts there with no request.
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
const V1 = readFileSync(resolve(DIST, 'cdn/v1.js'), 'utf-8');
const CHUNKS = readdirSync(resolve(DIST, 'cdn/chunks')).filter((file) => file.endsWith('.js'));
const CHUNK = CHUNKS.find((file) => file.startsWith('transcript-'))!;
const CHUNK_SOURCE = readFileSync(resolve(DIST, 'cdn/chunks', CHUNK), 'utf-8');
const REGISTRY = Symbol.for('showfm.chunks.v1');

const settle = async () => {
	for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const requests: string[] = [];

beforeAll(() => {
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const url = String(input);
		requests.push(url);
		if (url === TRANSCRIPT_VTT) return new Response(conversationVtt().vtt, { status: 200 });
		return new Response(JSON.stringify({ data: transcriptEpisode() }), { status: 200 });
	});
	// Run v1.js as the CDN serves it: the current script, with a nonce.
	const self = Object.assign(document.createElement('script'), {
		src: 'https://embed.cdn.media/player/v1.js',
		nonce: 'n0nce'
	});
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => self });
	(0, eval)(V1);
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
});

afterAll(async () => {
	document.body.innerHTML = '';
	await settle();
	vi.unstubAllGlobals();
});

describe('the build', () => {
	it('has a transcript chunk', () => {
		expect(CHUNK).toMatch(/^transcript-[\w-]+\.js$/);
	});

	it('keeps the transcript out of v1.js', () => {
		expect(V1).toContain(`./chunks/${CHUNK}`);
		for (const text of ['Search transcript', 'Back to now', 'transcriptError', 'back-wrap']) {
			expect(V1).not.toContain(text);
			expect(CHUNK_SOURCE).toContain(text);
		}
	});

	it('the chunk registers its factory under the shared registry, by its path', () => {
		const registry: Record<string, unknown> = {};
		const scope = { [REGISTRY]: registry } as Record<symbol, unknown>;
		new Function('globalThis', CHUNK_SOURCE)(scope);
		expect(Object.keys(registry)).toEqual([`chunks/${CHUNK}`]);
	});
});

describe('v1.js', () => {
	it('registers <showfm-transcript>', () => {
		expect(customElements.get('showfm-transcript')).toBeDefined();
	});

	it('load="click": requests nothing, not even the chunk, until showfm.load()', async () => {
		const facade = document.createElement('showfm-transcript');
		facade.setAttribute('episode', TRANSCRIPT_EPISODE_ID);
		facade.setAttribute('load', 'click');
		document.body.append(facade);
		await settle();
		expect(requests).toEqual([]);
		expect(document.head.querySelectorAll('script[src*="/chunks/transcript-"]')).toHaveLength(0);
		facade.remove();
	});

	it('adds the chunk next to itself once, with the nonce, then mounts the transcript', async () => {
		const first = document.createElement('showfm-transcript');
		first.setAttribute('episode', TRANSCRIPT_EPISODE_ID);
		first.innerHTML = '<div><p><strong>Maya:</strong> So the bakery…</p></div>';
		const second = first.cloneNode(true) as HTMLElement;
		document.body.append(first, second);
		await settle();
		const scripts = [
			...document.head.querySelectorAll<HTMLScriptElement>('script[src*="/chunks/transcript-"]')
		];
		expect(scripts.map((script) => script.src)).toEqual([
			`https://embed.cdn.media/player/chunks/${CHUNK}`
		]);
		expect(scripts[0].nonce).toBe('n0nce');
		// Until it has run, the elements have no shadow root: the fallback shows.
		expect(first.shadowRoot).toBeNull();
		(0, eval)(CHUNK_SOURCE);
		scripts[0].dispatchEvent(new Event('load'));
		await settle();
		for (const transcript of [first, second]) {
			expect(transcript.shadowRoot?.querySelectorAll('.line').length).toBeGreaterThan(5);
			// The fallback stays in the light DOM for search engines.
			expect(transcript.querySelector('p')).not.toBeNull();
		}
		// One episode, one VTT, for both.
		expect(requests.filter((url) => url === TRANSCRIPT_VTT)).toHaveLength(1);
	});

	it('showfm.load() then loads a load="click" transcript', async () => {
		const facade = document.createElement('showfm-transcript');
		facade.setAttribute('episode', TRANSCRIPT_EPISODE_ID);
		facade.setAttribute('load', 'click');
		document.body.append(facade);
		await settle();
		expect(facade.shadowRoot).toBeNull();
		(window as unknown as { showfm: { load: () => void } }).showfm.load();
		await settle();
		expect(facade.shadowRoot?.querySelectorAll('.line').length).toBeGreaterThan(5);
	});
});

describe('the npm root', () => {
	it('carries the chunk, so nothing is fetched next to it', () => {
		const root = readFileSync(resolve(DIST, 'index.js'), 'utf-8');
		expect(root).toContain(CHUNK_SOURCE.trimEnd());
		expect(root.indexOf(CHUNK_SOURCE.trimEnd())).toBeLessThan(
			root.indexOf('registerShowfmElements();')
		);
	});
});
