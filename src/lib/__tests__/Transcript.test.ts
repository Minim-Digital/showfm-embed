/**
 * <showfm-transcript>, mounted the way v1.js mounts it (transcript.svelte.ts)
 * into an element's shadow root, against a mock public API and media host.
 *
 * Covers what it follows (an episode, a player or list by id, the page),
 * cue and word tracking, click to seek, search and its match navigation,
 * "Back to now", every state in the design (loading, error, suspended) plus
 * idle and no transcript, collapse, virtualisation, strings in English,
 * German and French, the heading rule, and jest-axe on each state.
 */
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTranscript } from '../transcript.svelte';
import { pageController } from '../controller';
import { clearTranscripts } from '../transcript-data';
import {
	EXTERNAL_TRANSCRIPT_AUDIO,
	TRANSCRIPT_EPISODE_ID,
	TRANSCRIPT_VTT,
	conversationVtt,
	transcriptEpisode
} from '../../../tests/fixtures/transcript';

const API = 'https://api.example.test';
const CONTROLLER = Symbol.for('showfm.page-audio-controller.v1');

interface Mock {
	episode: number;
	episodeBody: ReturnType<typeof transcriptEpisode>;
	vtt: number;
	vttBody: string;
	pending: boolean;
	/** Status of the episode when it is asked again (after a VTT failure). */
	recheck: number | null;
}
let mock: Mock;
let requests: string[];

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
	const url = String(input);
	requests.push(url);
	if (mock.pending) return new Promise<Response>(() => {});
	if (url === TRANSCRIPT_VTT) {
		return new Response(mock.vtt === 200 ? mock.vttBody : '', { status: mock.vtt });
	}
	const again = requests.filter((request) => request === url).length > 1;
	return new Response(JSON.stringify({ data: mock.episodeBody }), {
		status: again && mock.recheck ? mock.recheck : mock.episode,
		headers: { 'Content-Type': 'application/json' }
	});
});

let hosts: HTMLElement[] = [];
let cleanups: (() => void)[] = [];

beforeEach(() => {
	mock = {
		episode: 200,
		episodeBody: transcriptEpisode(),
		vtt: 200,
		vttBody: conversationVtt().vtt,
		pending: false,
		recheck: null
	};
	requests = [];
	vi.stubGlobal('fetch', fetchMock);
	delete (globalThis as unknown as Record<symbol, unknown>)[CONTROLLER];
	clearTranscripts();
});

afterEach(() => {
	for (const cleanup of cleanups) cleanup();
	cleanups = [];
	for (const host of hosts) host.remove();
	hosts = [];
	document.body.innerHTML = '';
	document.documentElement.removeAttribute('lang');
	delete (window as unknown as { showfmStrings?: unknown }).showfmStrings;
	vi.unstubAllGlobals();
});

async function settle() {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Mounts a <showfm-transcript> with these attributes. */
async function transcript(attributes: Record<string, string> = {}) {
	const host = document.createElement('showfm-transcript');
	host.setAttribute('api', API);
	for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
	document.body.append(host);
	hosts.push(host);
	const connection = mountTranscript(host);
	cleanups.push(() => connection(false));
	await settle();
	return host;
}

/** An audio element the page controller knows, as a player's would be. */
function playerAudio(id = 'player', episode = transcriptEpisode()) {
	const player = document.createElement('div');
	player.id = id;
	document.body.append(player);
	const audio = document.createElement('audio');
	let time = 0;
	let paused = true;
	Object.defineProperty(audio, 'currentTime', {
		configurable: true,
		get: () => time,
		set: (value: number) => {
			time = value;
			audio.dispatchEvent(new Event('seeked'));
		}
	});
	Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
	const detach = pageController().attach(player, audio, {
		id: episode.id,
		title: episode.title,
		audio: episode.audio,
		transcript: episode.transcript
	});
	cleanups.push(detach);
	return {
		player,
		audio,
		/** Plays from `seconds`, as the audio's events would say. */
		at(seconds: number) {
			time = seconds;
			paused = false;
			audio.dispatchEvent(new Event('play'));
			audio.dispatchEvent(new Event('timeupdate'));
			paused = true;
		}
	};
}

const shadow = (host: HTMLElement) => host.shadowRoot!;
const $ = <T extends Element = HTMLElement>(host: HTMLElement, selector: string) =>
	shadow(host).querySelector<T>(selector);
const $$ = (host: HTMLElement, selector: string) => [
	...shadow(host).querySelectorAll<HTMLElement>(selector)
];
const lines = (host: HTMLElement) => $$(host, '.line');
const current = (host: HTMLElement) => $(host, '.line[aria-current="true"]');
const search = (host: HTMLElement) => $<HTMLInputElement>(host, 'input[type="search"]')!;

async function type(host: HTMLElement, value: string) {
	const input = search(host);
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
}

describe('what it follows', () => {
	it('episode="…": loads that episode and its VTT, and reads without audio', async () => {
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect(requests).toEqual([`${API}/v1/episodes/${TRANSCRIPT_EPISODE_ID}`, TRANSCRIPT_VTT]);
		expect(lines(host).length).toBeGreaterThan(5);
		expect($(host, '.line .txt')!.textContent).toContain('So the bakery had been closed');
		// Nothing to seek: the timestamps are not buttons and no line is current.
		expect($$(host, '.line button')).toHaveLength(0);
		expect(current(host)).toBeNull();
	});

	it('for="id": follows that player, highlights the line and the word', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		const { cues } = conversationVtt();
		at(cues[3].start + 0.5);
		await settle();
		expect(current(host)!.dataset.i).toBe('3');
		const word = $(host, '.line.now .txt .now')!;
		expect(word.textContent).toBe('I’d');
		// The timestamp is the line's one button.
		expect($$(host, '.line.now button')).toHaveLength(1);
		at(cues[5].start + 0.01);
		await settle();
		expect(current(host)!.dataset.i).toBe('5');
		expect($$(host, '.line[aria-current]')).toHaveLength(1);
	});

	it('for="id" waits for a player that arrives later', async () => {
		const host = await transcript({ for: 'later' });
		expect($(host, '.msg')!.textContent).toContain('Play an episode');
		playerAudio('later');
		await settle();
		expect(lines(host).length).toBeGreaterThan(5);
	});

	it('with neither, follows whatever plays on the page', async () => {
		const host = await transcript();
		expect($(host, '.msg')!.textContent).toBe('Play an episode to follow its transcript here.');
		expect(search(host).disabled).toBe(true);
		const { at } = playerAudio();
		at(2);
		await settle();
		expect(current(host)!.dataset.i).toBe('0');
	});

	it('inside a player, it follows that player and asks the API once', async () => {
		const player = document.createElement('showfm-player');
		document.body.append(player);
		hosts.push(player);
		const root = player.attachShadow({ mode: 'open' });
		const audio = document.createElement('audio');
		root.append(audio);
		cleanups.push(
			pageController().attach(audio, audio, {
				id: TRANSCRIPT_EPISODE_ID,
				title: 'Bakery'
			})
		);
		const host = document.createElement('showfm-transcript');
		player.setAttribute('api', API);
		root.append(host);
		const connection = mountTranscript(host);
		cleanups.push(() => connection(false));
		await settle();
		expect(requests[0]).toBe(`${API}/v1/episodes/${TRANSCRIPT_EPISODE_ID}`);
		expect($$(host, '.line button').length).toBeGreaterThan(0);
		// The player's colours are inherited, not set here (jsdom computes no
		// custom properties, so no 4.5:1 accent text is made from them either).
		expect($(host, '.tr')!.getAttribute('style')).toBeNull();
		expect($(host, '.tr')!.classList.contains('card')).toBe(false);
	});
});

describe('seeking', () => {
	it('a click on a line seeks the audio to its start and follows again', async () => {
		const { audio } = playerAudio();
		const host = await transcript({ for: 'player' });
		const line = lines(host)[4];
		line.querySelector('.txt')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		const { cues } = conversationVtt();
		expect(audio.currentTime).toBeCloseTo(cues[4].start + 0.01, 2);
		expect(current(host)!.dataset.i).toBe('4');
	});

	it('the timestamp button is named for the time and the speaker', async () => {
		playerAudio();
		const host = await transcript({ for: 'player' });
		const button = lines(host)[1].querySelector('button')!;
		expect(button.getAttribute('aria-label')).toMatch(/^Jump to \d+ seconds?, Tom$/);
		button.click();
		await settle();
		expect(current(host)!.dataset.i).toBe('1');
	});
});

describe('search', () => {
	it('counts matches, moves between them and highlights the active one', async () => {
		playerAudio();
		const host = await transcript({ for: 'player' });
		await type(host, 'BREAD');
		expect($(host, '.count')!.textContent).toBe('1 of 5');
		// Matches in the rendered lines are amber; the active one is ringed.
		expect($$(host, '.hit').length).toBeGreaterThan(1);
		expect($$(host, '.act').map((word) => word.textContent)).toEqual(['bread']);
		const [previous, next] = $$(host, '.icon');
		next.click();
		await settle();
		expect($(host, '.count')!.textContent).toBe('2 of 5');
		previous.click();
		previous.click();
		await settle();
		expect($(host, '.count')!.textContent).toBe('5 of 5');
		// Enter and Shift+Enter in the field do the same.
		search(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
		expect($(host, '.count')!.textContent).toBe('1 of 5');
	});

	it('ignores case and accents, and says when nothing matches', async () => {
		playerAudio();
		const host = await transcript({ for: 'player' });
		await type(host, 'thats');
		expect($(host, '.count')!.textContent).toBe('No matches');
		await type(host, 'That’s NOT');
		expect($(host, '.count')!.textContent).toBe('1 of 1');
		// A phrase match covers every word it touches.
		expect($$(host, '.hit').map((word) => word.textContent)).toEqual(['That’s', 'not']);
		await type(host, 'zzz');
		const [previous, next] = $$(host, '.icon');
		expect(previous).toBeDisabled();
		expect(next).toBeDisabled();
	});

	it('pauses following; Escape and Clear search restore it', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(2);
		await type(host, 'bread');
		expect($(host, '.back')).not.toBeNull();
		search(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(search(host).value).toBe('');
		expect($(host, '.count')).toBeNull();
		expect($(host, '.back')).toBeNull();
		await type(host, 'bread');
		$(host, '.clear')!.click();
		await settle();
		expect($(host, '.back')).toBeNull();
	});

	it('is the only live region, and only while searching', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(10);
		await settle();
		expect($$(host, '[aria-live], [role="log"], [role="marquee"]')).toHaveLength(0);
		await type(host, 'bread');
		expect($$(host, '[aria-live]')).toHaveLength(1);
	});
});

describe('Back to now', () => {
	it('appears when the visitor scrolls away, says when now is, and follows again', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(65);
		await settle();
		expect($(host, '.back')).toBeNull();
		$(host, '.scroll')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
		await settle();
		const back = $(host, '.back')!;
		expect(back.textContent).toContain('Back to now · 1:05');
		back.click();
		await settle();
		expect($(host, '.back')).toBeNull();
		expect(shadow(host).activeElement).toBe($(host, '.scroll'));
	});

	it('keyboard scrolling stops following too, typing elsewhere does not', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(5);
		await settle();
		const scroll = $(host, '.scroll')!;
		scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		await settle();
		expect($(host, '.back')).toBeNull();
		scroll.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
		await settle();
		expect($(host, '.back')).not.toBeNull();
	});
});

describe('states', () => {
	it('loading: a skeleton at the text area height, search disabled', async () => {
		mock.pending = true;
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID, height: '220' });
		const skeleton = $(host, '[role="status"]')!;
		expect(skeleton.getAttribute('aria-label')).toBe('Loading transcript');
		expect(skeleton.style.height).toBe('220px');
		expect(search(host).disabled).toBe(true);
		expect(await axe(host)).toHaveNoViolations();
	});

	it('error: the message and Try again, which loads it again', async () => {
		mock.vtt = 500;
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		const alert = $(host, '[role="alert"]')!;
		expect(alert.textContent).toContain(
			'The transcript can’t be loaded right now. The episode keeps playing.'
		);
		expect(await axe(host)).toHaveNoViolations();
		mock.vtt = 200;
		const retry = $<HTMLButtonElement>(host, '.retry')!;
		retry.focus();
		retry.click();
		await settle();
		expect(lines(host).length).toBeGreaterThan(5);
		// Try again went with the message: focus moved to the text.
		expect(shadow(host).activeElement).toBe($(host, '.scroll'));
	});

	it('suspended: the show’s message and no actions', async () => {
		mock.episode = 403;
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect($(host, '[role="status"]')!.textContent).toContain(
			'This show isn’t available right now.'
		);
		expect($$(host, '.msg button')).toHaveLength(0);
		expect(search(host).disabled).toBe(true);
		expect(await axe(host)).toHaveNoViolations();
	});

	it('suspended after the episode loaded: a VTT failure asks the API once', async () => {
		mock.vtt = 403;
		mock.recheck = 403;
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect($(host, '.msg')!.textContent).toContain('This show isn’t available right now.');
	});

	it('suspended mid-listen: the text goes with the audio', async () => {
		const controller = pageController();
		const owner = document.createElement('div');
		owner.id = 'list';
		document.body.append(owner);
		const audio = controller.sharedAudio();
		Object.defineProperty(audio, 'play', { configurable: true, value: async () => {} });
		const episode = transcriptEpisode();
		await controller.playShared(
			owner,
			{ ...episode, title: episode.title },
			'https://m.cdn.media/x.mp3'
		);
		const host = await transcript({ for: 'list' });
		expect(lines(host).length).toBeGreaterThan(5);
		controller.report(owner, episode.id, 'suspended');
		await settle();
		expect(lines(host)).toHaveLength(0);
		expect($(host, '[role="status"]')!.textContent).toContain(
			'This show isn’t available right now.'
		);
		expect(search(host).disabled).toBe(true);
	});

	it('episode="…" collapses on a 404, without a transcript, and for external audio', async () => {
		mock.episode = 404;
		const gone = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect(gone.hasAttribute('data-showfm-collapsed')).toBe(true);
		clearTranscripts();
		mock.episode = 200;
		mock.episodeBody = transcriptEpisode({ vtt: null });
		const none = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect(none.hasAttribute('data-showfm-collapsed')).toBe(true);
		clearTranscripts();
		mock.episodeBody = transcriptEpisode({ audio: EXTERNAL_TRANSCRIPT_AUDIO });
		const external = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		expect(external.hasAttribute('data-showfm-collapsed')).toBe(true);
		// External audio: the VTT is never fetched.
		expect(requests.filter((url) => url === TRANSCRIPT_VTT)).toHaveLength(0);
	});

	it('following, an episode with external audio says there is no transcript', async () => {
		playerAudio('player', transcriptEpisode({ audio: EXTERNAL_TRANSCRIPT_AUDIO }));
		mock.episodeBody = transcriptEpisode({ audio: EXTERNAL_TRANSCRIPT_AUDIO });
		const host = await transcript({ for: 'player' });
		expect(host.hasAttribute('data-showfm-collapsed')).toBe(false);
		expect($(host, '.msg')!.textContent).toContain('There’s no transcript for this episode.');
		expect(await axe(host)).toHaveNoViolations();
	});

	it('ready: no axe violations, with a search and the spoken line', async () => {
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(12);
		await type(host, 'bread');
		expect(await axe(host)).toHaveNoViolations();
	});

	it('idle: no axe violations', async () => {
		const host = await transcript();
		expect(await axe(host)).toHaveNoViolations();
	});
});

describe('word timings', () => {
	it('line-only VTT: the line is highlighted, no word', async () => {
		mock.vttBody = conversationVtt({ words: false }).vtt;
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(8);
		await settle();
		expect(current(host)).not.toBeNull();
		expect($(host, '.txt .now')).toBeNull();
	});

	it('stale word timings (audio replaced) fall back to lines', async () => {
		mock.vttBody = conversationVtt({ wordShift: 40 }).vtt;
		const { at } = playerAudio();
		const host = await transcript({ for: 'player' });
		at(8);
		await settle();
		expect(current(host)).not.toBeNull();
		expect($(host, '.txt .now')).toBeNull();
	});

	it('speaker names show when the speaker changes; unlabelled speakers have none', async () => {
		mock.vttBody = conversationVtt().vtt.replace(/<v Maya>/g, '<v Speaker B>');
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID });
		const names = $$(host, '.spk').map((name) => name.textContent);
		expect(names.every((name) => name === 'Tom')).toBe(true);
		expect(names.length).toBeGreaterThan(2);
	});
});

describe('long transcripts', () => {
	it('keeps the DOM small: 15,000 words render well under 300 lines', async () => {
		const long = conversationVtt({ repeat: 66 });
		mock.vttBody = long.vtt;
		mock.episodeBody = transcriptEpisode({ duration: long.duration });
		const { at } = playerAudio('player', mock.episodeBody);
		const host = await transcript({ for: 'player' });
		const words = long.cues.reduce((total, cue) => total + cue.text.split(' ').length, 0);
		expect(words).toBeGreaterThan(15_000);
		expect(lines(host).length).toBeLessThan(60);
		// The line being spoken is rendered wherever it is, and so is a search hit.
		at(long.cues[600].start + 0.5);
		await settle();
		expect(current(host)!.dataset.i).toBe('600');
		expect(lines(host).length).toBeLessThan(300);
		expect(shadow(host).querySelectorAll('*').length).toBeLessThan(3000);
	});
});

describe('strings and headings', () => {
	it('German from the page’s lang', async () => {
		document.documentElement.setAttribute('lang', 'de-DE');
		playerAudio();
		const host = await transcript({ for: 'player' });
		expect($(host, '[role="region"]')!.getAttribute('aria-label')).toBe('Transkript');
		expect(search(host).placeholder).toBe('Transkript durchsuchen');
		expect(lines(host)[1].querySelector('button')!.getAttribute('aria-label')).toMatch(
			/^Zu \d+ Sekunden? springen, Tom$/
		);
		await type(host, 'bread');
		expect($(host, '.count')!.textContent).toBe('1 von 5');
	});

	it('French from the element’s lang', async () => {
		const host = await transcript({ lang: 'fr' });
		expect($(host, '.label')!.textContent).toBe('Transcription');
		expect($(host, '.msg')!.textContent).toContain('Lancez un épisode');
	});

	it('element.strings overrides a key', async () => {
		const host = await transcript();
		(host as HTMLElement & { strings: unknown }).strings = { transcriptIdle: 'Nothing yet' };
		await settle();
		expect($(host, '.msg')!.textContent).toBe('Nothing yet');
	});

	it('no heading by default; heading-level makes the name one', async () => {
		const plain = await transcript();
		expect($$(plain, '[role="heading"], h2, h3, h4, h5, h6')).toHaveLength(0);
		const headed = await transcript({ 'heading-level': '3' });
		const heading = $(headed, '[role="heading"]')!;
		expect(heading.getAttribute('aria-level')).toBe('3');
		expect(heading.textContent).toBe('Transcript');
		const ignored = await transcript({ 'heading-level': '7' });
		expect($$(ignored, '[role="heading"]')).toHaveLength(0);
	});

	it('uses the show’s colours on its own and the theme attribute', async () => {
		const host = await transcript({ episode: TRANSCRIPT_EPISODE_ID, theme: 'dark' });
		expect($(host, '.tr')!.getAttribute('style')).toContain('--pp-bg: #17151f');
		expect($(host, '.tr')!.classList.contains('card')).toBe(true);
	});
});
