/**
 * The <showfm-episodes> element as v1.js registers it: it loads the list
 * the first time one connects, and a load="click" list fetches nothing,
 * not even its code, until its facade is pressed or showfm.load() runs.
 * (In the CDN build the import is a classic script next to v1.js; the
 * contract and browser tests cover that.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShowfmEpisodes } from '../episodes-element';
import { listPage, podcastPayload, sampleEpisodes } from '../../../tests/fixtures/episodes';

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = new URL(String(input));
	const body = url.pathname.endsWith('/episodes')
		? listPage(sampleEpisodes())
		: { data: podcastPayload() };
	return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
});

async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function list(attributes: Record<string, string> = {}) {
	const element = document.createElement('showfm-episodes');
	element.setAttribute('podcast', 'the-long-table');
	element.setAttribute('api', 'https://api.example.test');
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	element.innerHTML = '<ul><li><a href="https://show.fm/x">Episode</a></li></ul>';
	return element;
}

const rows = (element: Element) => element.shadowRoot?.querySelectorAll('[data-row]').length ?? 0;

/** The first import compiles the list, so give it time. */
const listed = (element: Element) =>
	vi.waitFor(() => expect(rows(element)).toBe(7), { timeout: 10_000 });

beforeAll(() => {
	defineShowfmEpisodes();
});

beforeEach(() => {
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
});

describe('<showfm-episodes>', () => {
	it('registers once', () => {
		const registered = customElements.get('showfm-episodes');
		expect(registered).toBeDefined();
		defineShowfmEpisodes();
		expect(customElements.get('showfm-episodes')).toBe(registered);
	});

	it('loads the list when it connects and replaces the fallback with it', async () => {
		const element = list();
		document.body.append(element);
		await listed(element);
		// The fallback links stay in the light DOM.
		expect(element.querySelector('ul a')).not.toBeNull();
	});

	it('load="click": nothing is fetched until the facade is pressed', async () => {
		const element = list({ load: 'click' });
		document.body.append(element);
		await settle();
		expect(element.shadowRoot).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		// The inline loader marks the element when its facade is pressed.
		element.setAttribute('data-showfm-activated', 'load');
		await listed(element);
		expect(fetchMock).toHaveBeenCalled();
	});

	it('showfm.load() loads every list facade at once', async () => {
		const first = list({ load: 'click' });
		const second = list({ load: 'click' });
		document.body.append(first, second);
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		document.dispatchEvent(new Event('showfm:load'));
		await listed(first);
		await listed(second);
	});

	it('unmounts when removed and mounts again when put back', async () => {
		const element = list();
		document.body.append(element);
		await listed(element);
		element.remove();
		await settle();
		expect(element.shadowRoot!.querySelector('.list')).toBeNull();
		document.body.append(element);
		await listed(element);
	});
});
