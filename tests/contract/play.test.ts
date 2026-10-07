/**
 * <showfm-play> and the page's mini-player in the built files.
 *
 * - v1.js registers both, but their code is one lazy chunk in
 *   dist/cdn/chunks/: v1.js carries none of its code, strings or styles.
 * - The first button on a page adds the chunk as a script next to v1.js,
 *   once, with the page's nonce; the mini-player a press opens uses the
 *   same chunk, so nothing more is fetched.
 * - The chunk's styles keep the reduced-motion rule and the bottom offset.
 * - The npm root carries the chunk; v1-fallback.css keeps the button's line.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { episodePayload } from '../fixtures/episode';

const DIST = resolve(__dirname, '../../dist');
const V1 = readFileSync(resolve(DIST, 'cdn/v1.js'), 'utf-8');
const CHUNK = readdirSync(resolve(DIST, 'cdn/chunks')).find((file) => file.startsWith('play-'))!;
const CHUNK_SOURCE = readFileSync(resolve(DIST, 'cdn/chunks', CHUNK), 'utf-8');
const FALLBACK_CSS = readFileSync(resolve(DIST, 'cdn/v1-fallback.css'), 'utf-8');
const REGISTRY = Symbol.for('showfm.chunks.v1');
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';

const settle = async () => {
	for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const chunkScripts = () => [
	...document.head.querySelectorAll<HTMLScriptElement>('script[src*="/chunks/play-"]')
];

beforeAll(() => {
	vi.stubGlobal('fetch', async () =>
		Response.json({
			data: {
				...episodePayload(),
				audio: { ...episodePayload().audio, url: 'https://m.cdn.media/a.mp3' }
			}
		})
	);
	HTMLMediaElement.prototype.play = vi.fn(async function (this: HTMLMediaElement) {
		this.dispatchEvent(new Event('play'));
	});
	HTMLMediaElement.prototype.pause = vi.fn();
	Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null });
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
	it('keeps the play button and the mini-player out of v1.js', () => {
		expect(V1).toContain(`./chunks/${CHUNK}`);
		for (const text of [
			'Close player and stop playback',
			'Collapse player',
			'mini-player-position'
		]) {
			expect(V1).not.toContain(text);
		}
		for (const text of ['Close player and stop playback', 'Collapse player', 'Play episode']) {
			expect(CHUNK_SOURCE).toContain(text);
		}
		// Builders' copy is not shipped to visitors.
		expect(CHUNK_SOURCE).not.toContain('Visitors can only play and pause.');
	});

	it('styles the mini-player for reduced motion and the bottom offset', () => {
		expect(CHUNK_SOURCE).toContain(
			'@media(prefers-reduced-motion:reduce){.busy:after{animation:none}}'
		);
		expect(CHUNK_SOURCE).toContain('--o: var(--showfm-bottom-offset, 0px)');
		expect(CHUNK_SOURCE).toContain('@media(max-width:640px)');
	});

	it('the chunk registers its factory under the shared registry, by its path', () => {
		const registry: Record<string, unknown> = {};
		const scope = { [REGISTRY]: registry } as Record<symbol, unknown>;
		new Function('globalThis', CHUNK_SOURCE)(scope);
		expect(Object.keys(registry)).toEqual([`chunks/${CHUNK}`]);
	});

	it("v1-fallback.css keeps the button's line before it upgrades", () => {
		expect(FALLBACK_CSS).toContain(
			'showfm-play{display:inline-flex;align-items:center;vertical-align:middle;max-width:100%;min-height:40px}'
		);
		expect(FALLBACK_CSS).toContain('showfm-play[size=lg i]{min-height:48px}');
	});
});

describe('v1.js', () => {
	it('registers <showfm-play> and <showfm-mini-player>', () => {
		expect(customElements.get('showfm-play')).toBeDefined();
		expect(customElements.get('showfm-mini-player')).toBeDefined();
	});

	it('adds the chunk next to itself once, with the nonce, then mounts the buttons', async () => {
		document.body.innerHTML = `<showfm-play episode="${EPISODE_ID}"><a href="https://show.fm/x">One</a></showfm-play><showfm-play episode="${EPISODE_ID}" variant="icon"></showfm-play>`;
		await settle();
		expect(chunkScripts().map((script) => script.src)).toEqual([
			`https://embed.cdn.media/player/chunks/${CHUNK}`
		]);
		expect(chunkScripts()[0].nonce).toBe('n0nce');
		const [first, second] = document.querySelectorAll('showfm-play');
		// Until it has run, the elements have no shadow root: the fallback shows.
		expect(first.shadowRoot).toBeNull();
		(0, eval)(CHUNK_SOURCE);
		chunkScripts()[0].dispatchEvent(new Event('load'));
		await settle();
		for (const button of [first, second]) {
			expect(button.shadowRoot?.querySelector('[data-play]')).not.toBeNull();
		}
	});

	it('a press opens the mini-player from the chunk already here', async () => {
		const button = document
			.querySelector('showfm-play')!
			.shadowRoot!.querySelector<HTMLButtonElement>('[data-play]')!;
		button.click();
		await settle();
		const mini = document.querySelector('showfm-mini-player')!;
		expect(mini.shadowRoot?.querySelector('section[aria-label="Now playing"]')).not.toBeNull();
		expect(chunkScripts()).toHaveLength(1);
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
