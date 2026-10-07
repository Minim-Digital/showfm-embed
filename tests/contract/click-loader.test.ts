/**
 * The built loader (dist/cdn/click-loader.js) with the built v1.js, as a
 * page runs them: the facade requests nothing, the press adds v1.js, and
 * the element that upgrades loads, plays and removes the loader's facade.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { episodePayload } from '../fixtures/episode';

const LOADER = readFileSync(resolve(__dirname, '../../dist/cdn/click-loader.js'), 'utf-8');
const V1 = readFileSync(resolve(__dirname, '../../dist/cdn/v1.js'), 'utf-8');
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';

const settle = async () => {
	for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

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
afterAll(async () => {
	// Elements left on the page would tear down after jsdom does.
	document.body.innerHTML = '';
	await settle();
	vi.unstubAllGlobals();
});

describe('click-loader.js with v1.js', () => {
	it('is small enough to paste inline', () => {
		expect(LOADER.length).toBeLessThan(4.5 * 1000);
	});

	it('takes a press from facade to playing player with one script and one request', async () => {
		document.body.innerHTML = `<showfm-player episode="${EPISODE_ID}" load="click" style="display:block;min-height:291px"><a href="https://show.fm/x">Episode One</a></showfm-player>`;
		(0, eval)(LOADER);
		const element = document.querySelector('showfm-player')!;
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(document.querySelectorAll('script[src]')).toHaveLength(0);

		const button = element.querySelector('[data-showfm-facade-ui] button') as HTMLButtonElement;
		button.focus();
		button.click();
		const added = [...document.querySelectorAll('script[src]')] as HTMLScriptElement[];
		expect(added.map((s) => s.src)).toEqual(['https://embed.cdn.media/player/v1.js']);

		// The added script arrives.
		(0, eval)(V1);
		await settle();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const root = element.shadowRoot!;
		expect(root.querySelector('[part="container"]')).not.toBeNull();
		expect(root.querySelector('[part="play"]')?.getAttribute('aria-label')).toBe('Pause');
		expect(root.activeElement).toBe(root.querySelector('[part="play"]'));
		// The loader's facade and marks are gone; the snippet's link stays.
		expect(element.querySelector('[data-showfm-facade-ui]')).toBeNull();
		expect(element.hasAttribute('data-showfm-activated')).toBe(false);
		expect(element.querySelector('a')?.textContent).toBe('Episode One');
	});

	it('leaves other facades as facades until they are pressed', async () => {
		fetchSpy.mockClear();
		const other = document.createElement('showfm-player');
		other.setAttribute('episode', EPISODE_ID);
		other.setAttribute('load', 'click');
		document.body.append(other);
		await settle();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(other.shadowRoot!.querySelector('button')?.getAttribute('aria-label')).toBe(
			'Play podcast episode'
		);
		(window as unknown as { showfm: { load: () => void } }).showfm.load();
		await settle();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(other.shadowRoot!.querySelector('[part="container"]')).not.toBeNull();
	});
});
