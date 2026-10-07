/**
 * The inline load="click" loader (design page 6): nothing is requested
 * before a press, the first press adds v1.js once, and showfm.load()
 * upgrades every facade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ShowfmWindow = Window & { showfm?: { load?: () => void }; showfmStrings?: unknown };

const EPISODE = '11111111-2222-4333-8444-555555555555';

async function runLoader(currentScript: HTMLScriptElement | null = null) {
	Object.defineProperty(document, 'currentScript', {
		configurable: true,
		get: () => currentScript
	});
	vi.resetModules();
	await import('../click-loader');
}

const scripts = () => [...document.head.querySelectorAll('script[src]')] as HTMLScriptElement[];
const facadeButton = (element: Element) =>
	element.querySelector('[data-showfm-facade-ui] button') as HTMLButtonElement;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
	fetchSpy = vi.fn();
	vi.stubGlobal('fetch', fetchSpy);
	document.body.innerHTML = `
		<showfm-player id="one" episode="${EPISODE}" load="click" accent="#0ea5e9" style="display:block;min-height:291px">
			<a href="https://show.fm/x/e/one">Episode One</a><audio controls preload="none"></audio>
		</showfm-player>
		<showfm-player id="two" episode="${EPISODE}" load="click" size="compact" theme="dark"></showfm-player>
		<showfm-episodes id="list" podcast="x" load="click"></showfm-episodes>
		<showfm-player id="eager" episode="${EPISODE}"></showfm-player>`;
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('lang');
	delete (window as ShowfmWindow).showfm;
	delete (window as ShowfmWindow).showfmStrings;
});

describe('before the press', () => {
	it('draws a facade in every load="click" element and requests nothing', async () => {
		await runLoader();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(scripts()).toHaveLength(0);
		for (const id of ['one', 'two', 'list']) {
			expect(document.getElementById(id)!.querySelector('[data-showfm-facade-ui]')).not.toBeNull();
		}
		expect(document.getElementById('eager')!.children).toHaveLength(0);
		expect(document.querySelectorAll('img, iframe, link')).toHaveLength(0);
	});

	it('labels the facade generically and knows only accent, type and height', async () => {
		await runLoader();
		const one = document.getElementById('one')!;
		const button = facadeButton(one);
		expect(button.getAttribute('aria-label')).toBe('Play podcast episode');
		expect(one.querySelector('small')!.textContent).toBe('Loads from show.fm when you press play');
		const box = one.querySelector('[data-showfm-facade-ui]') as HTMLElement;
		expect(box.style.getPropertyValue('--a')).toBe('#0ea5e9');
		expect(box.style.getPropertyValue('--h')).toBe('252px');
		const two = document.getElementById('two')!.querySelector('[data-showfm-facade-ui]')!;
		expect(two.hasAttribute('data-c')).toBe(true);
		expect(two.hasAttribute('data-d')).toBe(true);
		const list = document.getElementById('list')!;
		expect(facadeButton(list).getAttribute('aria-label')).toBe('Load episodes');
		// The fallback children are hidden while the facade shows.
		expect(document.head.querySelector('style')!.textContent).toContain(
			'[data-showfm-facade]:not(:defined)>:not([data-showfm-facade-ui]){display:none}'
		);
	});

	it('translates from lang and takes window.showfmStrings', async () => {
		document.documentElement.setAttribute('lang', 'fr-FR');
		document.getElementById('two')!.setAttribute('lang', 'de');
		(window as ShowfmWindow).showfmStrings = { facadeListTitle: 'Show me' };
		await runLoader();
		expect(facadeButton(document.getElementById('one')!).getAttribute('aria-label')).toBe(
			'Lire l’épisode du podcast'
		);
		expect(facadeButton(document.getElementById('two')!).getAttribute('aria-label')).toBe(
			'Podcastfolge abspielen'
		);
		expect(facadeButton(document.getElementById('list')!).getAttribute('aria-label')).toBe(
			'Show me'
		);
	});

	it('falls back to the default accent for a value that is not a hex colour', async () => {
		document.getElementById('one')!.setAttribute('accent', 'red;background:url(x)');
		await runLoader();
		const box = document.querySelector('#one [data-showfm-facade-ui]') as HTMLElement;
		expect(box.style.getPropertyValue('--a')).toBe('#7E22CE');
		expect(box.style.getPropertyValue('--f')).toBe('#fff');
	});
});

describe('the press', () => {
	it('adds v1.js once and marks the element to load and play', async () => {
		await runLoader();
		const one = document.getElementById('one')!;
		facadeButton(one).focus();
		facadeButton(one).click();
		expect(scripts().map((s) => s.src)).toEqual(['https://embed.cdn.media/player/v1.js']);
		expect(one.getAttribute('data-showfm-activated')).toBe('play');
		expect(one.hasAttribute('data-showfm-focus')).toBe(true);
		expect(facadeButton(one).getAttribute('aria-busy')).toBe('true');

		// A second facade adds no second script; the list loads without playing.
		const list = document.getElementById('list')!;
		facadeButton(list).click();
		expect(scripts()).toHaveLength(1);
		expect(list.getAttribute('data-showfm-activated')).toBe('load');
		expect(document.getElementById('two')!.hasAttribute('data-showfm-activated')).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('loads a self-hosted v1.js from data-src', async () => {
		const self = document.createElement('script');
		self.setAttribute('data-src', 'https://site.example/wp-content/plugins/showfm/v1.js');
		await runLoader(self);
		facadeButton(document.getElementById('one')!).click();
		expect(scripts().map((s) => s.src)).toEqual([
			'https://site.example/wp-content/plugins/showfm/v1.js'
		]);
	});
});

describe('showfm.load()', () => {
	it('upgrades every facade at once without playing', async () => {
		await runLoader();
		const heard = vi.fn();
		document.addEventListener('showfm:load', heard);
		(window as ShowfmWindow).showfm!.load!();
		expect(scripts()).toHaveLength(1);
		for (const id of ['one', 'two', 'list']) {
			expect(document.getElementById(id)!.getAttribute('data-showfm-activated')).toBe('load');
		}
		expect(heard).toHaveBeenCalledTimes(1);
		document.removeEventListener('showfm:load', heard);
	});
});
