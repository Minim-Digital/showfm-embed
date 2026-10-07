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
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
	if (currentScript) currentScript.nonce = 'changed-after-evaluation';
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
		<p>Hear it: <showfm-play id="button" episode="${EPISODE}" load="click" accent="#0ea5e9">
			<a href="https://show.fm/x/e/one">Episode One</a><audio controls preload="none"></audio>
		</showfm-play></p>
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
		for (const id of ['one', 'two', 'list', 'button']) {
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
		// The fallback children are hidden while the facade shows, and a
		// list's or play button's stay hidden after v1.js defines it (a stub),
		// until its chunk mounts.
		expect(document.head.querySelector('style')!.textContent).toContain(
			'[data-showfm-facade]:is(showfm-episodes,showfm-play,:not(:defined))>:not([data-showfm-facade-ui]){display:none}'
		);
	});

	it("draws a play button's facade as its button alone, in a 40px line (design page 6)", async () => {
		await runLoader();
		const element = document.getElementById('button')!;
		const box = element.querySelector('[data-showfm-facade-ui]') as HTMLElement;
		expect(box.hasAttribute('data-p')).toBe(true);
		// The compact facade's 34px button.
		expect(box.hasAttribute('data-c')).toBe(true);
		expect(box.style.getPropertyValue('--h')).toBe('40px');
		expect(box.style.getPropertyValue('--a')).toBe('#0ea5e9');
		expect(facadeButton(element).getAttribute('aria-label')).toBe('Play podcast episode');
		const css = document.head.querySelector('style')!.textContent!;
		expect(css).toContain('[data-showfm-facade-ui][data-p]{display:inline-flex;width:auto;');
		expect(css).toContain('[data-showfm-facade-ui][data-p] :is(span,i){display:none}');
		// Pressed, it loads and plays, as the player's does.
		facadeButton(element).click();
		expect(element.getAttribute('data-showfm-activated')).toBe('play');
		expect(scripts()).toHaveLength(1);
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

	it.each([
		['#fff', '#000'],
		['#000', '#fff'],
		['#abc', '#000'],
		['#ABCDEF', '#000'],
		['#7E22CE', '#fff'],
		['#0ea5e9', '#000']
	])('picks the text colour on %s by contrast, shorthand included: %s', async (accent, text) => {
		document.getElementById('one')!.setAttribute('accent', accent);
		await runLoader();
		const box = document.querySelector('#one [data-showfm-facade-ui]') as HTMLElement;
		expect(box.style.getPropertyValue('--a')).toBe(accent);
		expect(box.style.getPropertyValue('--f')).toBe(text);
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
	it.each([undefined, '', 'host-nonce'])(
		'propagates only a non-empty nonce (%s)',
		async (nonce) => {
			const self = document.createElement('script');
			if (nonce !== undefined) self.nonce = nonce;
			await runLoader(self);
			facadeButton(document.getElementById('one')!).click();
			expect(scripts()).toHaveLength(1);
			expect(scripts()[0].nonce).toBe(nonce || '');
			expect(scripts()[0].hasAttribute('nonce')).toBe(!!nonce);
			scripts()[0].dispatchEvent(new Event('error'));

			// Consent activation and retries use the same captured nonce.
			(window as ShowfmWindow).showfm!.load!();
			expect(scripts()).toHaveLength(1);
			expect(scripts()[0].nonce).toBe(nonce || '');
			expect(scripts()[0].hasAttribute('nonce')).toBe(!!nonce);
		}
	);

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

	it('lets the next press try again when v1.js fails to load', async () => {
		await runLoader();
		const one = document.getElementById('one')!;
		const list = document.getElementById('list')!;
		facadeButton(one).focus();
		facadeButton(one).click();
		facadeButton(list).click();
		const [failed] = scripts();
		failed.dispatchEvent(new Event('error'));

		// Back to a pressable facade, focus still on the pressed button.
		expect(scripts()).toHaveLength(0);
		for (const element of [one, list]) {
			expect(element.hasAttribute('data-showfm-activated')).toBe(false);
			expect(facadeButton(element).hasAttribute('aria-busy')).toBe(false);
		}
		expect(one.hasAttribute('data-showfm-focus')).toBe(false);
		expect(document.activeElement).toBe(facadeButton(one));

		// The next press inserts the script again, and this time it loads.
		facadeButton(one).click();
		expect(scripts()).toHaveLength(1);
		expect(scripts()[0]).not.toBe(failed);
		expect(one.getAttribute('data-showfm-activated')).toBe('play');
		expect(one.hasAttribute('data-showfm-focus')).toBe(true);
		scripts()[0].dispatchEvent(new Event('load'));
		expect(one.getAttribute('data-showfm-activated')).toBe('play');
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
		for (const id of ['one', 'two', 'list', 'button']) {
			expect(document.getElementById(id)!.getAttribute('data-showfm-activated')).toBe('load');
		}
		expect(heard).toHaveBeenCalledTimes(1);
		document.removeEventListener('showfm:load', heard);
	});
});
