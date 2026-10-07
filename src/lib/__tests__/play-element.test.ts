/**
 * <showfm-play> and <showfm-mini-player> as v1.js registers them: each
 * registers once, a button loads its code the first time one connects, a
 * load="click" button fetches nothing until its facade is pressed or
 * showfm.load() runs, and the page gets one mini-player however many
 * elements ask. (In the CDN build the import is a classic script next to
 * v1.js; the contract and browser tests cover that.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShowfmPlay } from '../play-element';
import {
	API,
	EPISODE_ID,
	clearPage,
	fetchMock,
	installMedia,
	resetPage,
	settle
} from './play-harness';

beforeAll(() => {
	installMedia();
	defineShowfmPlay();
});
beforeEach(resetPage);
afterEach(clearPage);

function button(attributes: Record<string, string> = {}) {
	const element = document.createElement('showfm-play');
	element.setAttribute('episode', EPISODE_ID);
	element.setAttribute('api', API);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	element.innerHTML = '<a href="https://show.fm/x">Episode One</a>';
	return element;
}

/** The first import compiles the chunk, so give it time. */
const mounted = (element: Element) =>
	vi.waitFor(() => expect(element.shadowRoot?.querySelector('[data-play]')).toBeTruthy(), {
		timeout: 10_000
	});

describe('<showfm-play>', () => {
	it('registers both elements once', () => {
		const play = customElements.get('showfm-play');
		const mini = customElements.get('showfm-mini-player');
		expect(play).toBeDefined();
		expect(mini).toBeDefined();
		defineShowfmPlay();
		expect(customElements.get('showfm-play')).toBe(play);
		expect(customElements.get('showfm-mini-player')).toBe(mini);
	});

	it('loads the button when it connects, keeping the fallback link in the light DOM', async () => {
		const element = button();
		document.body.append(element);
		await mounted(element);
		expect(element.querySelector(':scope > a')).not.toBeNull();
	});

	it('load="click": nothing is fetched until the facade is pressed', async () => {
		const element = button({ load: 'click' });
		document.body.append(element);
		await settle();
		expect(element.shadowRoot).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		// The inline loader marks the element when its facade is pressed.
		element.setAttribute('data-showfm-activated', 'play');
		await mounted(element);
		expect(fetchMock).toHaveBeenCalled();
	});

	it('showfm.load() loads every play button facade at once', async () => {
		const first = button({ load: 'click' });
		const second = button({ load: 'click' });
		document.body.append(first, second);
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		document.dispatchEvent(new Event('showfm:load'));
		await mounted(first);
		await mounted(second);
	});

	it('unmounts when removed and mounts again when put back', async () => {
		const element = button();
		document.body.append(element);
		await mounted(element);
		element.remove();
		await settle();
		expect(element.shadowRoot!.querySelector('.root')).toBeNull();
		document.body.append(element);
		await mounted(element);
	});
});

describe('<showfm-mini-player>', () => {
	it('is added once, at the end of the body, however many elements ask', async () => {
		const first = document.createElement('div');
		const second = document.createElement('div');
		document.body.append(first, second);
		for (const opener of [first, second, first]) {
			opener.dispatchEvent(new CustomEvent('showfm:mini-player', { bubbles: true }));
		}
		const minis = document.querySelectorAll('showfm-mini-player');
		expect(minis).toHaveLength(1);
		expect(document.body.lastElementChild).toBe(minis[0]);
		// Until its code is here, it keeps the latest opener for when it mounts.
		expect((minis[0] as HTMLElement & { showfmOpener?: Element }).showfmOpener).toBe(first);
	});

	it('a second copy of the script on the page does not add a second listener', async () => {
		// Already defined: this copy registers nothing and listens to nothing.
		const listen = vi.spyOn(document, 'addEventListener');
		defineShowfmPlay();
		expect(listen).not.toHaveBeenCalledWith('showfm:mini-player', expect.anything());
		listen.mockRestore();
	});
});
