/**
 * The <showfm-transcript> element as v1.js registers it: it loads the
 * transcript the first time one connects, and a load="click" transcript
 * fetches nothing, not even its code, until showfm.load() runs. (In the CDN
 * build the import is a classic script next to v1.js; the contract and
 * browser tests cover that.)
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShowfmTranscript } from '../transcript-element';
import { clearTranscripts } from '../transcript-data';
import {
	TRANSCRIPT_EPISODE_ID,
	TRANSCRIPT_VTT,
	conversationVtt,
	transcriptEpisode
} from '../../../tests/fixtures/transcript';

const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
	String(input) === TRANSCRIPT_VTT
		? new Response(conversationVtt().vtt)
		: new Response(JSON.stringify({ data: transcriptEpisode() }))
);

async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function transcript(attributes: Record<string, string> = {}) {
	const element = document.createElement('showfm-transcript');
	element.setAttribute('episode', TRANSCRIPT_EPISODE_ID);
	element.setAttribute('api', 'https://api.example.test');
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	element.innerHTML = '<div><p><strong>Maya:</strong> So the bakery…</p></div>';
	return element;
}

const lines = (element: Element) => element.shadowRoot?.querySelectorAll('.line').length ?? 0;
/** The first import compiles the transcript, so give it time. */
const loaded = (element: Element) =>
	vi.waitFor(() => expect(lines(element)).toBeGreaterThan(5), { timeout: 10_000 });

beforeAll(() => {
	defineShowfmTranscript();
});

beforeEach(() => {
	fetchMock.mockClear();
	clearTranscripts();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
});

describe('<showfm-transcript>', () => {
	it('registers once', () => {
		const registered = customElements.get('showfm-transcript');
		expect(registered).toBeDefined();
		defineShowfmTranscript();
		expect(customElements.get('showfm-transcript')).toBe(registered);
	});

	it('loads when it connects; the fallback stays in the light DOM', async () => {
		const element = transcript();
		document.body.append(element);
		await loaded(element);
		expect(element.querySelector('p')).not.toBeNull();
	});

	it('load="click": nothing is fetched until showfm.load() runs', async () => {
		const element = transcript({ load: 'click' });
		document.body.append(element);
		await settle();
		expect(element.shadowRoot).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		document.dispatchEvent(new Event('showfm:load'));
		await loaded(element);
		expect(fetchMock).toHaveBeenCalled();
	});

	it('unmounts when removed and mounts again when put back', async () => {
		const element = transcript();
		document.body.append(element);
		await loaded(element);
		element.remove();
		await settle();
		expect(lines(element)).toBe(0);
		document.body.append(element);
		await loaded(element);
	});
});
