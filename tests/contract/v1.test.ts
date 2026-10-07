/**
 * Backward-compatibility contract for dist/cdn/v1.js, the file served as
 * /player/v1.js. Embed snippets that load it are pasted into pages we cannot
 * edit, so everything here must keep holding for as long as v1 is served:
 *
 * - both tag names register (<podcasterplus-player> is the pre-rebrand name);
 * - the seven v1 attributes are observed and behave as they always have
 *   (1.1 adds heading-level, credit, load and strings beside them);
 * - the loading skeleton reserves the unbranded heights (252 and 83);
 * - the light-DOM fallback link projects through the shadow-DOM slot.
 *
 * The real rendered heights are measured in Chromium by tests/browser.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { episodePayload } from '../fixtures/episode';

const ATTRIBUTES = ['episode', 'podcast', 'theme', 'size', 'accent', 'wave', 'api'];
const ADDED_IN_1_1 = ['heading-level', 'credit', 'load', 'strings'];
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';

type PlayerConstructor = CustomElementConstructor & { observedAttributes?: string[] };

/** Canvas drawing calls per canvas, so a test can tell the waveform from the plain bar. */
const drawCalls = new WeakMap<HTMLCanvasElement, string[]>();

beforeAll(() => {
	// jsdom has no layout and no canvas. Give canvases a size and a 2D context
	// that records the method names it is called with.
	Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { get: () => 300 });
	Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { get: () => 40 });
	HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
		const calls = drawCalls.get(this) ?? [];
		drawCalls.set(this, calls);
		return new Proxy(
			{},
			{
				get: (_target, name) =>
					name === 'canvas' ? this : (..._args: unknown[]) => calls.push(String(name)),
				set: () => true
			}
		);
	} as unknown as typeof HTMLCanvasElement.prototype.getContext;
	const source = readFileSync(resolve(__dirname, '../../dist/cdn/v1.js'), 'utf-8');
	// A classic script runs in the global scope; indirect eval does the same.
	(0, eval)(source);
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
});

/** Waits until Svelte has flushed the element's effects and the fetch chain. */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function mount(tag: string, attributes: Record<string, string>, children = '') {
	const element = document.createElement(tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	element.innerHTML = children;
	document.body.append(element);
	return element;
}

function stubFetch(response: () => Promise<Response>) {
	const fetchSpy = vi.fn(response);
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

const okResponse = (body: unknown) => () =>
	Promise.resolve(new Response(JSON.stringify({ data: body }), { status: 200 }));

describe('registration', () => {
	it('registers <showfm-player> and the <podcasterplus-player> alias', () => {
		const current = customElements.get('showfm-player');
		const legacy = customElements.get('podcasterplus-player');
		expect(current).toBeDefined();
		expect(legacy).toBeDefined();
		expect(legacy).not.toBe(current);
		expect(Object.getPrototypeOf(legacy)).toBe(current);
	});

	it.each(['showfm-player', 'podcasterplus-player'])(
		'%s observes every v1 attribute, plus the ones 1.1 adds',
		(tag) => {
			const constructor = customElements.get(tag) as PlayerConstructor;
			expect([...(constructor.observedAttributes ?? [])].sort()).toEqual(
				[...ATTRIBUTES, ...ADDED_IN_1_1].sort()
			);
		}
	);
});

describe('attributes', () => {
	it.each(['showfm-player', 'podcasterplus-player'])(
		'%s fetches the episode from the default API',
		async (tag) => {
			const fetchSpy = stubFetch(() => new Promise(() => {}));
			mount(tag, { episode: EPISODE_ID });
			await settle();
			expect(fetchSpy).toHaveBeenCalledWith(`https://api.show.fm/v1/episodes/${EPISODE_ID}`);
		}
	);

	it('podcast fetches the latest episode, and api overrides the origin', async () => {
		const fetchSpy = stubFetch(() => new Promise(() => {}));
		mount('showfm-player', { podcast: 'test signal', api: 'https://api.example.test' });
		await settle();
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://api.example.test/v1/podcasts/test%20signal/episodes/latest'
		);
	});

	it('episode wins over podcast', async () => {
		const fetchSpy = stubFetch(() => new Promise(() => {}));
		mount('showfm-player', { episode: EPISODE_ID, podcast: 'test-signal' });
		await settle();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(`https://api.show.fm/v1/episodes/${EPISODE_ID}`);
	});

	it('neither episode nor podcast shows the fallback without a request', async () => {
		const fetchSpy = stubFetch(okResponse(episodePayload()));
		const element = mount('showfm-player', {});
		await settle();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(element.shadowRoot?.querySelector('.fallback')).not.toBeNull();
	});

	it('renders the player from the payload with the embed source tag', async () => {
		stubFetch(okResponse(episodePayload()));
		const element = mount('showfm-player', { episode: EPISODE_ID });
		await settle();
		const root = element.shadowRoot!;
		expect(root.querySelector('[part="container"]')?.getAttribute('aria-label')).toBe(
			'Audio player: Episode One'
		);
		expect(root.querySelector('audio')?.getAttribute('src')).toBe(
			'https://media.example.test/audio.mp3?src=embed'
		);
		expect(root.querySelector('audio')?.getAttribute('preload')).toBe('none');
		expect(root.querySelector('[part="footer"] a')?.getAttribute('href')).toBe(
			'https://show.fm/?ref=player'
		);
	});

	it('size="compact" renders the compact layout', async () => {
		stubFetch(okResponse(episodePayload()));
		const element = mount('showfm-player', { episode: EPISODE_ID, size: 'compact' });
		await settle();
		expect(element.shadowRoot?.querySelector('.body-compact')).not.toBeNull();
	});

	it('wave pins the waveform on or off over the show setting', async () => {
		// The plain bar is the only drawing with a knob (an arc); the waveform
		// is bars only.
		const knobDrawn = (element: HTMLElement) => {
			const calls = drawCalls.get(element.shadowRoot!.querySelector('canvas')!) ?? [];
			expect(calls).toContain('fill');
			return calls.includes('arc');
		};
		stubFetch(okResponse(episodePayload({ wave: true })));
		const follows = mount('showfm-player', { episode: EPISODE_ID });
		const off = mount('showfm-player', { episode: EPISODE_ID, wave: 'false' });
		await settle();
		expect(knobDrawn(follows)).toBe(false);
		expect(knobDrawn(off)).toBe(true);

		vi.unstubAllGlobals();
		stubFetch(okResponse(episodePayload({ wave: false })));
		const followsOff = mount('showfm-player', { episode: EPISODE_ID });
		const on = mount('showfm-player', { episode: EPISODE_ID, wave: 'true' });
		await settle();
		expect(knobDrawn(followsOff)).toBe(true);
		expect(knobDrawn(on)).toBe(false);
	});

	it('theme pins the palette and accent overrides the show colour', async () => {
		stubFetch(okResponse(episodePayload({ theme: 'light' })));
		const element = mount('showfm-player', {
			episode: EPISODE_ID,
			theme: 'dark',
			accent: '#0ea5e9'
		});
		await settle();
		const style = element.shadowRoot?.querySelector('[part="container"]')?.getAttribute('style');
		expect(style).toMatch(/--pp-bg:\s*#17151f;/);
		expect(style).toMatch(/--pp-accent:\s*#0ea5e9;/);
	});
});

describe('loading skeleton', () => {
	function skeletonCss(element: HTMLElement) {
		return [...(element.shadowRoot?.querySelectorAll('style') ?? [])]
			.map((style) => style.textContent)
			.join('');
	}

	it('reserves the unbranded standard height (252px) while loading', async () => {
		stubFetch(() => new Promise(() => {}));
		const element = mount('showfm-player', { episode: EPISODE_ID });
		await settle();
		const skeleton = element.shadowRoot?.querySelector('.skeleton');
		expect(skeleton?.getAttribute('role')).toBe('status');
		expect(skeleton?.classList.contains('sk-compact')).toBe(false);
		expect(skeletonCss(element)).toMatch(
			/\.skeleton\.svelte-[a-z0-9]+\s*\{[^}]*min-height:\s*252px/
		);
	});

	it('reserves the unbranded compact height (83px) while loading', async () => {
		stubFetch(() => new Promise(() => {}));
		const element = mount('showfm-player', { episode: EPISODE_ID, size: 'compact' });
		await settle();
		expect(element.shadowRoot?.querySelector('.skeleton.sk-compact')).not.toBeNull();
		expect(skeletonCss(element)).toMatch(
			/\.sk-compact\.svelte-[a-z0-9]+\s*\{[^}]*min-height:\s*83px/
		);
	});
});

describe('light-DOM fallback', () => {
	it.each(['showfm-player', 'podcasterplus-player'])(
		'%s projects the snippet link through the slot when loading fails',
		async (tag) => {
			// A 404 collapses instead (below), so this is a server error.
			stubFetch(() => Promise.resolve(new Response('', { status: 500 })));
			const element = mount(
				tag,
				{ episode: EPISODE_ID },
				'<a href="https://show.fm/test-signal/e/episode-one">Listen on show.fm</a>'
			);
			await settle();
			const slot = element.shadowRoot?.querySelector('.fallback slot') as HTMLSlotElement | null;
			expect(slot).not.toBeNull();
			const assigned = slot!.assignedNodes().filter((node) => node.nodeType === 1);
			expect(assigned).toHaveLength(1);
			expect((assigned[0] as HTMLAnchorElement).textContent).toBe('Listen on show.fm');
		}
	);
});

describe('not public (plan Q1 and section 6)', () => {
	const notFound = () =>
		Promise.resolve(
			new Response(
				JSON.stringify({ error: { code: 'not_found', message: 'Episode not found.' } }),
				{
					status: 404
				}
			)
		);
	const SNIPPET = '<a href="https://show.fm/test-signal/e/episode-one">Listen on show.fm</a>';

	it('a 404 collapses the element: nothing renders and no fallback projects', async () => {
		stubFetch(notFound);
		const element = mount('showfm-player', { episode: EPISODE_ID }, SNIPPET);
		element.setAttribute('style', 'display:block;min-height:291px');
		await settle();
		expect(element.hasAttribute('data-showfm-collapsed')).toBe(true);
		expect(element.shadowRoot!.querySelector('slot, div, p')).toBeNull();
		// :host([data-showfm-collapsed]) { display: none !important } outranks
		// the snippet's inline display and so releases its reserved height.
		const css = [...element.shadowRoot!.querySelectorAll('style')]
			.map((x) => x.textContent)
			.join('');
		expect(css).toMatch(/:host\(\[data-showfm-collapsed\]\)\s*\{\s*display:\s*none\s*!important/);
	});

	it('renders byte-identical DOM for a scheduled episode and a random UUID', async () => {
		stubFetch(notFound);
		const scheduled = mount(
			'showfm-player',
			{ episode: '33333333-4444-4555-8666-777777777777' },
			SNIPPET
		);
		const random = mount('showfm-player', { episode: crypto.randomUUID() }, SNIPPET);
		await settle();
		const snapshot = (element: HTMLElement) => {
			const clone = element.cloneNode(true) as HTMLElement;
			clone.removeAttribute('episode');
			return { host: clone.outerHTML, shadow: element.shadowRoot!.innerHTML };
		};
		expect(snapshot(scheduled)).toEqual(snapshot(random));
	});

	it('a 403 (suspended show) shows the message card without actions', async () => {
		stubFetch(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: { code: 'unavailable', message: 'x' } }), {
					status: 403
				})
			)
		);
		const element = mount('showfm-player', { episode: EPISODE_ID }, SNIPPET);
		await settle();
		const root = element.shadowRoot!;
		expect(root.querySelector('[part="error"]')?.textContent?.trim()).toBe(
			'This show isn’t available right now.'
		);
		expect(root.querySelector('a, button, slot')).toBeNull();
		expect(element.hasAttribute('data-showfm-collapsed')).toBe(false);
	});
});

describe('"Powered by show.fm" once per page', () => {
	it('only the first embed on the page shows the credit', async () => {
		stubFetch(okResponse(episodePayload({ branded: true })));
		const first = mount('showfm-player', { episode: EPISODE_ID });
		const second = mount('podcasterplus-player', { episode: EPISODE_ID });
		await settle();
		expect(first.shadowRoot!.querySelector('[part="footer"]')).not.toBeNull();
		expect(second.shadowRoot!.querySelector('[part="footer"]')).toBeNull();
	});

	it('credit="off" on the first passes it to the next embed', async () => {
		stubFetch(okResponse(episodePayload({ branded: true })));
		const first = mount('showfm-player', { episode: EPISODE_ID, credit: 'off' });
		const second = mount('showfm-player', { episode: EPISODE_ID });
		await settle();
		expect(first.shadowRoot!.querySelector('[part="footer"]')).toBeNull();
		expect(second.shadowRoot!.querySelector('[part="footer"]')).not.toBeNull();
	});

	it('passes to the next embed when the first is removed', async () => {
		stubFetch(okResponse(episodePayload({ branded: true })));
		const first = mount('showfm-player', { episode: EPISODE_ID });
		const second = mount('showfm-player', { episode: EPISODE_ID });
		await settle();
		first.remove();
		await settle();
		expect(second.shadowRoot!.querySelector('[part="footer"]')).not.toBeNull();
	});
});

describe('load="click"', () => {
	it('requests nothing until the facade is pressed', async () => {
		const fetchSpy = stubFetch(okResponse(episodePayload()));
		const element = mount('showfm-player', { episode: EPISODE_ID, load: 'click' });
		await settle();
		expect(fetchSpy).not.toHaveBeenCalled();
		const facade = element.shadowRoot!.querySelector('button')!;
		expect(facade.getAttribute('aria-label')).toBe('Play podcast episode');
		facade.click();
		await settle();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(element.shadowRoot!.querySelector('[part="container"]')).not.toBeNull();
	});
});
