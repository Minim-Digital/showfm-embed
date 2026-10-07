/**
 * <showfm-episodes> in the built files.
 *
 * - v1.js registers it, but the list itself is a lazy chunk in
 *   dist/cdn/chunks/: v1.js carries none of its code or strings.
 * - The first list on a page adds the chunk as a script next to v1.js, once,
 *   with the page's nonce, and the list mounts when it has run.
 * - The npm root carries the chunk, so a list mounts there with no request.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { listPage, podcastPayload, sampleEpisodes } from '../fixtures/episodes';

const DIST = resolve(__dirname, '../../dist');
const V1 = readFileSync(resolve(DIST, 'cdn/v1.js'), 'utf-8');
const CHUNKS = readdirSync(resolve(DIST, 'cdn/chunks')).filter((file) => file.endsWith('.js'));
const CHUNK = CHUNKS.find((file) => file.startsWith('episodes-'))!;
const CHUNK_SOURCE = readFileSync(resolve(DIST, 'cdn/chunks', CHUNK), 'utf-8');
const REGISTRY = Symbol.for('showfm.chunks.v1');

const settle = async () => {
	for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeAll(() => {
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		const body = url.pathname.endsWith('/episodes')
			? listPage(sampleEpisodes())
			: { data: podcastPayload() };
		return new Response(JSON.stringify(body), { status: 200 });
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
	it('has three chunks: the episode list, the play button with the mini-player, the transcript', () => {
		expect(CHUNKS).toHaveLength(3);
		expect(CHUNK).toMatch(/^episodes-[\w-]+\.js$/);
		const others = CHUNKS.filter((file) => file !== CHUNK).sort();
		expect(others[0]).toMatch(/^play-[\w-]+\.js$/);
		expect(others[1]).toMatch(/^transcript-[\w-]+\.js$/);
	});

	it('keeps the list out of v1.js', () => {
		expect(V1).toContain(`./chunks/${CHUNK}`);
		for (const text of ['Load more episodes', 'No episodes yet', 'grid-template-areas']) {
			expect(V1).not.toContain(text);
			expect(CHUNK_SOURCE).toContain(text);
		}
	});

	it('the chunk registers its factory under the shared registry, by its path', () => {
		const registry: Record<string, unknown> = {};
		const scope = { [REGISTRY]: registry } as Record<symbol, unknown>;
		new Function('globalThis', CHUNK_SOURCE)(scope);
		expect(Object.keys(registry)).toEqual([`chunks/${CHUNK}`]);
		expect(typeof registry[`chunks/${CHUNK}`]).toBe('function');
	});
});

describe('v1.js', () => {
	it('registers <showfm-episodes>', () => {
		expect(customElements.get('showfm-episodes')).toBeDefined();
	});

	it('adds the chunk next to itself once, with the nonce, then mounts the list', async () => {
		const first = document.createElement('showfm-episodes');
		first.setAttribute('podcast', 'the-long-table');
		const second = first.cloneNode() as HTMLElement;
		document.body.append(first, second);
		await settle();
		const scripts = [
			...document.head.querySelectorAll<HTMLScriptElement>('script[src*="/chunks/episodes-"]')
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
		for (const list of [first, second]) {
			expect(list.shadowRoot?.querySelectorAll('[data-row]')).toHaveLength(7);
		}
	});

	it('a list added later mounts from the chunk already here', async () => {
		const later = document.createElement('showfm-episodes');
		later.setAttribute('podcast', 'the-long-table');
		document.body.append(later);
		await settle();
		expect(later.shadowRoot?.querySelectorAll('[data-row]')).toHaveLength(7);
		expect(document.head.querySelectorAll('script[src*="/chunks/episodes-"]')).toHaveLength(1);
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
