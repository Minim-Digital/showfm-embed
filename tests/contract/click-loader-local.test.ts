/**
 * The built self-hosting loader (dist/cdn/click-loader-local.js), as a page
 * runs it: it names no remote host, it takes v1.js from
 * window.showfmEmbedSrc and then data-src, and with neither it does nothing
 * at all. The WordPress plugin ships this file (WordPress.org guideline 8:
 * no code path may load remote code).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { episodePayload } from '../fixtures/episode';

const DIST = resolve(__dirname, '../../dist/cdn');
const LOCAL = readFileSync(resolve(DIST, 'click-loader-local.js'), 'utf-8');
const LOADER = readFileSync(resolve(DIST, 'click-loader.js'), 'utf-8');
const V1 = readFileSync(resolve(DIST, 'v1.js'), 'utf-8');
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';
const SELF_HOSTED = 'https://site.example/wp-content/plugins/showfm/assets/showfm-embed/v1.js';

type ShowfmWindow = Window & { showfm?: { load?: () => void }; showfmEmbedSrc?: unknown };

const settle = async () => {
	for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Runs the built file as a classic script whose currentScript is `script`. */
function runLocal(script: HTMLScriptElement | null) {
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script });
	(0, eval)(LOCAL);
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
}

const loaderScript = (dataSrc?: string) => {
	const script = document.createElement('script');
	if (dataSrc !== undefined) script.setAttribute('data-src', dataSrc);
	return script;
};
const added = () =>
	[...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src);
const press = () =>
	(document.querySelector('[data-showfm-facade-ui] button') as HTMLButtonElement).click();

const FALLBACK = `<showfm-player episode="${EPISODE_ID}" load="click" style="display:block;min-height:291px"><a href="https://show.fm/x/e/one">Episode One</a></showfm-player>`;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeAll(() => {
	fetchSpy = vi.fn(() =>
		Promise.resolve(new Response(JSON.stringify({ data: episodePayload() }), { status: 200 }))
	);
	vi.stubGlobal('fetch', fetchSpy);
	HTMLMediaElement.prototype.play = vi.fn(async function (this: HTMLMediaElement) {
		this.dispatchEvent(new Event('play'));
	});
	HTMLMediaElement.prototype.pause = vi.fn();
	Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null });
});
afterEach(() => {
	fetchSpy.mockClear();
	document.head.innerHTML = '';
	delete (window as ShowfmWindow).showfm;
	delete (window as ShowfmWindow).showfmEmbedSrc;
});
afterAll(async () => {
	document.body.innerHTML = '';
	await settle();
	vi.unstubAllGlobals();
});

describe('click-loader-local.js', () => {
	it('names no remote host', () => {
		expect(LOCAL).not.toMatch(/http/i);
		expect(LOCAL).not.toContain('embed.cdn.media');
		expect(LOCAL).not.toMatch(/\/\/[a-z0-9-]+\./i);
	});

	it('is the same loader otherwise, and click-loader.js keeps its CDN default', () => {
		expect(LOCAL).toContain('showfmEmbedSrc');
		expect(LOCAL).toContain('data-showfm-facade');
		expect(LOADER).not.toContain('showfmEmbedSrc');
		expect(LOADER).toContain('||"https://embed.cdn.media/player/v1.js"');
	});

	it('is in the exports map', () => {
		const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
		expect(pkg.exports['./cdn/click-loader-local.js']).toBe('./dist/cdn/click-loader-local.js');
	});

	it('is small enough to paste inline', () => {
		expect(LOCAL.length).toBeLessThan(4.8 * 1000);
	});

	it('loads v1.js from window.showfmEmbedSrc', () => {
		document.body.innerHTML = FALLBACK;
		(window as ShowfmWindow).showfmEmbedSrc = SELF_HOSTED;
		runLocal(loaderScript('https://site.example/stale/v1.js'));
		expect(added()).toEqual([]);
		press();
		expect(added()).toEqual([SELF_HOSTED]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('loads v1.js from data-src alone', () => {
		document.body.innerHTML = FALLBACK;
		runLocal(loaderScript(SELF_HOSTED));
		press();
		expect(added()).toEqual([SELF_HOSTED]);
	});

	it.each([
		['with neither set', () => loaderScript()],
		['with an empty data-src', () => loaderScript('')],
		['without a currentScript and with no global', () => null]
	])('does nothing at all %s: no facade, no style, no request', async (_name, script) => {
		document.body.innerHTML = FALLBACK;
		runLocal(script());
		await settle();
		expect(document.querySelector('[data-showfm-facade], [data-showfm-facade-ui]')).toBeNull();
		expect(document.head.children).toHaveLength(0);
		expect(added()).toEqual([]);
		expect((window as ShowfmWindow).showfm).toBeUndefined();
		expect(fetchSpy).not.toHaveBeenCalled();
		// The server fallback stays as the page sent it.
		expect(document.body.innerHTML).toBe(FALLBACK);
	});

	it('loads from the global without a currentScript, through to a playing player', async () => {
		document.body.innerHTML = FALLBACK;
		(window as ShowfmWindow).showfmEmbedSrc = SELF_HOSTED;
		// A combined or delayed bundle: the loader is not its own <script>.
		runLocal(null);
		const element = document.querySelector('showfm-player')!;
		press();
		expect(added()).toEqual([SELF_HOSTED]);
		// The self-hosted v1.js arrives.
		(0, eval)(V1);
		await settle();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const root = element.shadowRoot!;
		expect(root.querySelector('[part="play"]')?.getAttribute('aria-label')).toBe('Pause');
		expect(element.querySelector('[data-showfm-facade-ui]')).toBeNull();
	});
});
