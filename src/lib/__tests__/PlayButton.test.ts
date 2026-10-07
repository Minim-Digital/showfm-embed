/**
 * <showfm-play>, mounted the way v1.js mounts it (play.svelte.ts) into an
 * element's shadow root, against a mock of the public API.
 *
 * Covers every variant and size, every state in the design (pages 3.4, 5,
 * 6 and 8) with where focus goes, the page audio controller (a button, a
 * list row and a player take turns; buttons for one episode agree), the
 * mini-player request, load="click", the strings and jest-axe on each state.
 */
import { within } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPlay } from '../play.svelte';
import { mountEpisodes } from '../episodes.svelte';
import { pageController } from '../controller';
import { renderEpisodeHTML } from '../fallback';
import {
	API,
	AXE,
	EPISODE_ID,
	HOSTED_AUDIO,
	api,
	clearPage,
	deepActive,
	fetchMock,
	installMedia,
	media,
	mediaEvent,
	payload,
	requests,
	resetPage,
	settle,
	sharedAudio
} from './play-harness';

beforeAll(installMedia);
beforeEach(resetPage);
afterEach(clearPage);

/** Mounts a play button the way v1.js does. */
async function mountButton(attributes: Record<string, string> = {}, children = '') {
	const host = document.createElement('showfm-play');
	host.setAttribute('api', API);
	host.setAttribute('episode', EPISODE_ID);
	for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
	host.innerHTML = children;
	document.body.append(host);
	const connection = mountPlay(host);
	await settle();
	const root = host.shadowRoot!;
	const view = within(root as unknown as HTMLElement);
	const button = () => root.querySelector<HTMLButtonElement>('[data-play]');
	return { host, root, view, button, connection };
}

/** Presses `button` with focus on it, as a visitor would, and lets it settle. */
async function press(button: HTMLElement | null) {
	button!.focus();
	button!.click();
	await settle();
}

const text = (root: ShadowRoot) => root.querySelector('.root')!.textContent!.trim();
/** The status line that takes the button's place. */
const message = (root: ShadowRoot) => root.querySelector('.msg[role="status"]');

describe('variants and sizes (design page 3.4)', () => {
	it('label, small (the default): "Play", named "Play: {title}"', async () => {
		const { host, root, view } = await mountButton();
		expect(view.getByRole('button', { name: 'Play: Episode One' })).toBeInTheDocument();
		expect(text(root)).toBe('Play');
		expect(root.querySelector('.root')!.className).toContain('v-label s-sm');
		// No headings, ever: the button has no title of its own.
		expect(root.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('label, large: "Play episode · 52 min", the label starting the name', async () => {
		const { root, view } = await mountButton({ size: 'lg' });
		expect(text(root)).toBe('Play episode · 52 min');
		expect(
			view.getByRole('button', { name: 'Play episode · 52 min: Episode One' })
		).toBeInTheDocument();
	});

	it('icon: no text, named "Play: {title}", in both sizes', async () => {
		for (const size of ['sm', 'lg']) {
			const { host, root, view } = await mountButton({ variant: 'icon', size });
			expect(view.getByRole('button', { name: 'Play: Episode One' })).toBeInTheDocument();
			expect(text(root)).toBe('');
			expect(root.querySelector('.root')!.className).toContain(`v-icon s-${size}`);
			expect(await axe(host, AXE)).toHaveNoViolations();
			host.remove();
		}
	});

	it('link: "Listen · 52 min", for use inside a sentence', async () => {
		const { root, view } = await mountButton({ variant: 'link' });
		expect(text(root)).toBe('Listen · 52 min');
		expect(view.getByRole('button', { name: 'Listen · 52 min: Episode One' })).toBeVisible();
	});

	it('takes the episode, or the latest one for a podcast', async () => {
		await mountButton();
		expect(requests).toEqual([`/v1/episodes/${EPISODE_ID}`]);
		requests.length = 0;
		const { host } = await mountButton({ episode: '', podcast: 'test-signal' });
		expect(requests).toEqual(['/v1/podcasts/test-signal/episodes/latest']);
		expect(host.shadowRoot!.querySelector('[data-play]')).not.toBeNull();
	});

	it('keeps its fallback in the light DOM for search engines', async () => {
		const fallback = renderEpisodeHTML(payload(), { sourceTag: 'embed' });
		const { host } = await mountButton({}, fallback);
		expect(host.querySelector(':scope > a')!.getAttribute('href')).toBe(
			'https://show.fm/test-signal/e/episode-one'
		);
		expect(host.querySelector(':scope > audio')).not.toBeNull();
	});
});

describe('playback states', () => {
	it('idle → loading → playing → paused → idle, the label and name changing together', async () => {
		const { root, button } = await mountButton({ size: 'lg' });
		await press(button());
		const audio = sharedAudio();
		expect(audio.getAttribute('src')).toBe(`${HOSTED_AUDIO}?src=embed`);
		expect(text(root)).toBe('Pause · 52 min left');
		audio.currentTime = 846;
		await settle();
		expect(text(root)).toBe('Pause · 38 min left');
		expect(button()!.getAttribute('aria-label')).toBe('Pause · 38 min left: Episode One');
		// Buffering: "Loading…" with an arc round the button.
		mediaEvent(audio, 'waiting');
		await settle();
		expect(text(root)).toBe('Loading…');
		expect(button()!.classList.contains('busy')).toBe(true);
		mediaEvent(audio, 'playing');
		await settle();
		await press(button());
		expect(audio.paused).toBe(true);
		expect(text(root)).toBe('Resume · 38 min left');
		expect(button()!.getAttribute('aria-label')).toBe('Resume · 38 min left: Episode One');
		mediaEvent(audio, 'ended');
		await settle();
		expect(text(root)).toBe('Play episode · 52 min');
	});

	it('a press before an episode that fails to load does not stay loading', async () => {
		let answer!: (response: Response) => void;
		vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (answer = resolve)));
		const { root, button } = await mountButton();
		await press(button());
		expect(text(root)).toBe('Loading…');
		answer(new Response('{}', { status: 500 }));
		await settle();
		expect(message(root)).toHaveTextContent('This episode can’t be played right now.');
		// Try again brings the episode, at rest.
		vi.stubGlobal('fetch', fetchMock);
		await press(root.querySelector<HTMLElement>('[data-retry]'));
		expect(text(root)).toBe('Play');
	});

	it('a new episode attribute drops the old episode: a press while it loads plays nothing old', async () => {
		const { host, root, button } = await mountButton({ size: 'lg' });
		expect(text(root)).toBe('Play episode · 52 min');
		api.episode = 'pending';
		host.setAttribute('episode', '99999999-2222-4333-8444-555555555555');
		await settle();
		// The old episode's length has gone with it.
		expect(text(root)).toBe('Play episode');
		await press(button());
		expect(pageController().sharedState()).toBeNull();
		expect(text(root)).toBe('Loading…');
	});

	it('a press before the episode arrives plays it once it is here', async () => {
		api.episode = 'pending';
		const { root, button } = await mountButton();
		expect(text(root)).toBe('Play');
		await press(button());
		expect(button()!.classList.contains('busy')).toBe(true);
		expect(text(root)).toBe('Loading…');
	});

	it("can't be played: the message in the button's place, focus on Try again, which plays", async () => {
		media.outcome = 'error';
		const { host, root, view, button } = await mountButton();
		await press(button());
		expect(message(root)).toHaveTextContent('This episode can’t be played right now.');
		const retry = view.getByRole('button', { name: 'Try again' });
		expect(deepActive()).toBe(retry);
		expect(root.querySelector('[data-play]')).toBeNull();
		// The failure was checked with the API once: not suspended.
		expect(requests.filter((path) => path === `/v1/episodes/${EPISODE_ID}`)).toHaveLength(2);
		expect(await axe(host, AXE)).toHaveNoViolations();
		media.outcome = 'ok';
		await press(retry);
		expect(text(root)).toContain('Pause');
		expect(deepActive()).toBe(button());
	});

	it('blocked by the browser: play stays ready beside the message, focus stays on it', async () => {
		media.outcome = 'blocked';
		const { host, root, button } = await mountButton();
		await press(button());
		expect(root.querySelector('.note')).toHaveTextContent('Your browser blocked audio playback.');
		expect(deepActive()).toBe(button());
		expect(button()!.getAttribute('aria-describedby')).toBe('message');
		expect(root.querySelector('[role="status"][aria-live]')).toHaveTextContent(
			'Your browser blocked audio playback.'
		);
		expect(await axe(host, AXE)).toHaveNoViolations();
		media.outcome = 'ok';
		await press(button());
		expect(root.querySelector('.note')).toBeNull();
		expect(text(root)).toContain('Pause');
	});

	it('blocked, icon only: the message is spoken and describes the button', async () => {
		media.outcome = 'blocked';
		const { root, button } = await mountButton({ variant: 'icon' });
		await press(button());
		expect(root.querySelector('#message.vh')).toHaveTextContent('Your browser blocked');
		expect(button()!.getAttribute('aria-describedby')).toBe('message');
	});

	it('suspended (403): a status line in the host font, no actions (design page 5)', async () => {
		api.episode = 403;
		const { host, root } = await mountButton();
		expect(message(root)).toHaveTextContent('This show isn’t available right now.');
		expect(root.querySelectorAll('button')).toHaveLength(0);
		expect(root.querySelector('svg')).not.toBeNull();
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('suspended, icon only: a quiet mark named by the message, not a tab stop', async () => {
		api.episode = 403;
		const { host, root, view } = await mountButton({ variant: 'icon' });
		const mark = view.getByRole('img', { name: 'This show isn’t available right now.' });
		expect(mark.tagName).toBe('SPAN');
		expect(mark.tabIndex).toBe(-1);
		expect(root.querySelectorAll('button')).toHaveLength(0);
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('suspended mid-listen: the audio fails, the API says 403, the mini-player hears it', async () => {
		const { root, button } = await mountButton();
		await press(button());
		api.recheck = 403;
		mediaEvent(sharedAudio(), 'error');
		await settle();
		expect(message(root)).toHaveTextContent('This show isn’t available right now.');
		expect(root.querySelector('[data-retry]')).toBeNull();
		expect(pageController().sharedState()!.message).toBe('suspended');
	});

	it("couldn't load (5xx): the error with Try again, which asks again", async () => {
		api.episode = 500;
		const { root, view } = await mountButton();
		expect(message(root)).toHaveTextContent('This episode can’t be played right now.');
		api.episode = 200;
		await press(view.getByRole('button', { name: 'Try again' }));
		expect(root.querySelector('[data-play]')).not.toBeNull();
		expect(deepActive()).toBe(root.querySelector('[data-play]'));
	});

	it('icon only, failed: the button itself is a quiet Try again, described by the message', async () => {
		api.episode = 500;
		const { host, view } = await mountButton({ variant: 'icon' });
		const retry = view.getByRole('button', { name: 'Try again' });
		expect(retry.classList.contains('quiet')).toBe(true);
		expect(retry).toHaveAccessibleDescription('This episode can’t be played right now.');
		expect(await axe(host, AXE)).toHaveNoViolations();
	});

	it('no audio: the error, with nothing to try again', async () => {
		api.payload = { audio: { url: null, content_type: null, duration_seconds: null } };
		const { root } = await mountButton();
		expect(message(root)).toHaveTextContent('This episode can’t be played right now.');
		expect(root.querySelectorAll('button')).toHaveLength(0);
	});

	it('not found (404): collapses, renders nothing and gives the line back', async () => {
		api.episode = 404;
		const { host, root } = await mountButton({}, '<a href="https://show.fm/x">Episode</a>');
		expect(host.hasAttribute('data-showfm-collapsed')).toBe(true);
		expect(root.querySelector('button, .msg')).toBeNull();
		expect(root.querySelector('.root')!.textContent!.trim()).toBe('');
	});

	it('audio hosted elsewhere plays the same way (design page 9)', async () => {
		api.payload = {
			audio: {
				url: 'https://media.example.test/a.mp3',
				content_type: 'audio/mpeg',
				duration_seconds: 600
			}
		};
		const { root, button } = await mountButton();
		await press(button());
		expect(sharedAudio().getAttribute('src')).toBe('https://media.example.test/a.mp3?src=embed');
		expect(text(root)).toContain('Pause');
	});
});

describe('one generation per load and per play: nothing stale lands', () => {
	const OTHER = '22222222-2222-4333-8444-555555555555';

	/** A fetch whose answers the test gives, one request at a time. */
	function heldFetch() {
		const held: { path: string; answer: (status: number, data?: unknown) => void }[] = [];
		vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
			return new Promise<Response>((resolve) => {
				held.push({
					path: new URL(String(input)).pathname,
					answer: (status, data) => resolve(new Response(JSON.stringify({ data }), { status }))
				});
			});
		});
		return held;
	}

	it("a new episode starts clean: the old one's error does not follow it", async () => {
		media.outcome = 'error';
		const { host, root, button } = await mountButton();
		await press(button());
		expect(message(root)).toHaveTextContent('This episode can’t be played right now.');
		media.outcome = 'ok';
		api.payload = { id: OTHER, title: 'Episode Two' };
		host.setAttribute('episode', OTHER);
		await settle();
		expect(message(root)).toBeNull();
		expect(button()!.getAttribute('aria-label')).toBe('Play: Episode Two');
	});

	it("a new episode starts clean: the old show's suspension does not follow it", async () => {
		media.outcome = 'error';
		api.recheck = 403;
		const { host, root, button } = await mountButton();
		await press(button());
		expect(message(root)).toHaveTextContent('This show isn’t available right now.');
		media.outcome = 'ok';
		api.payload = { id: OTHER, title: 'Episode Two' };
		host.setAttribute('episode', OTHER);
		await settle();
		await press(button());
		expect(button()!.getAttribute('aria-label')).toMatch(/^Pause · /);
	});

	it('a late recheck about the old episode is neither shown nor reported for the new one', async () => {
		const held = heldFetch();
		const { host, root, button } = await mountButton();
		held[0].answer(200, payload());
		await settle();
		media.outcome = 'error';
		await press(button());
		// A's failure recheck is out; the element moves to B before it answers.
		expect(held[1].path).toBe(`/v1/episodes/${EPISODE_ID}`);
		host.setAttribute('episode', OTHER);
		await settle();
		held[2].answer(200, { ...payload(), id: OTHER, title: 'Episode Two' });
		await settle();
		held[1].answer(403);
		await settle();
		expect(message(root)).toBeNull();
		expect(button()!.getAttribute('aria-label')).toBe('Play: Episode Two');
		expect(pageController().sharedState()!.message).toBeNull();
	});

	it('a late recheck lands nowhere once another button has started the episode', async () => {
		const held = heldFetch();
		const first = await mountButton();
		const second = await mountButton({ variant: 'icon' });
		held[0].answer(200, payload());
		held[1].answer(200, payload());
		await settle();
		media.outcome = 'error';
		await press(first.button());
		// The first button's recheck is out; the second starts the episode fine.
		expect(held[2].path).toBe(`/v1/episodes/${EPISODE_ID}`);
		media.outcome = 'ok';
		await press(second.button());
		held[2].answer(403);
		await settle();
		expect(message(first.root)).toBeNull();
		expect(first.button()!.getAttribute('aria-label')).toMatch(/^Pause · /);
		expect(pageController().sharedState()!.message).toBeNull();
	});

	it("a late recheck lands nowhere once a player's own audio starts the episode, still buffering", async () => {
		const held = heldFetch();
		const { root, button } = await mountButton();
		held[0].answer(200, payload());
		await settle();
		media.outcome = 'error';
		await press(button());
		// A <showfm-player> for the same episode starts: play, but no playing yet.
		const own = document.createElement('audio');
		pageController().attach(own, own, { id: EPISODE_ID, title: 'Episode One' });
		own.dispatchEvent(new Event('play'));
		held[1].answer(403);
		await settle();
		expect(message(root)).toBeNull();
	});

	it('a late recheck lands nowhere once the same episode has started again', async () => {
		const held = heldFetch();
		const { root, button } = await mountButton();
		held[0].answer(200, payload());
		await settle();
		media.outcome = 'error';
		await press(button());
		media.outcome = 'ok';
		await press(button());
		expect(button()!.getAttribute('aria-label')).toMatch(/^Pause · /);
		held[1].answer(500);
		await settle();
		expect(message(root)).toBeNull();
		expect(button()!.getAttribute('aria-label')).toMatch(/^Pause · /);
	});

	it('a late answer for the old episode does not replace the new one', async () => {
		const held = heldFetch();
		const { host, root } = await mountButton({ size: 'lg' });
		host.setAttribute('episode', OTHER);
		await settle();
		held[1].answer(200, { ...payload(), id: OTHER, title: 'Episode Two' });
		await settle();
		held[0].answer(200, payload());
		await settle();
		expect(root.querySelector('[data-play]')!.getAttribute('aria-label')).toMatch(/: Episode Two$/);
	});
});

describe('the page audio controller', () => {
	it('buttons for one episode show the same state; a press on either pauses', async () => {
		const first = await mountButton();
		const second = await mountButton({ variant: 'icon' });
		await press(first.button());
		expect(second.button()!.getAttribute('aria-label')).toBe('Pause: Episode One');
		sharedAudio().currentTime = 846;
		await press(second.button());
		expect(sharedAudio().paused).toBe(true);
		expect(text(first.root)).toContain('Resume');
	});

	it('a list row and a button take turns on the page audio', async () => {
		const list = document.createElement('showfm-episodes');
		list.setAttribute('api', API);
		list.setAttribute('podcast', 'the-long-table');
		document.body.append(list);
		mountEpisodes(list);
		await settle();
		const rowPlay = () =>
			list.shadowRoot!.querySelector<HTMLButtonElement>('[data-row] [data-play]')!;
		await press(rowPlay());
		expect(rowPlay().getAttribute('aria-label')).toMatch(/^Pause: /);
		const { root, button } = await mountButton();
		await press(button());
		expect(text(root)).toContain('Pause');
		expect(rowPlay().getAttribute('aria-label')).toMatch(/^Play: /);
		await press(rowPlay());
		expect(text(root)).toBe('Play');
	});

	it("a player with its own audio pauses the button's, and the reverse", async () => {
		const { root, button } = await mountButton();
		await press(button());
		sharedAudio().currentTime = 846;
		const own = document.createElement('audio');
		const player = {};
		pageController().attach(player, own);
		await own.play();
		await settle();
		expect(sharedAudio().paused).toBe(true);
		expect(text(root)).toContain('Resume');
		await press(button());
		expect(own.paused).toBe(true);
		expect(text(root)).toContain('Pause');
	});
});

describe('the mini-player (on by default)', () => {
	it('asks for it after the first play, and hands over the episode with its colours and credit', async () => {
		const opened = vi.fn();
		document.addEventListener('showfm:mini-player', opened);
		const { host, button } = await mountButton({ accent: '#0ea5e9', theme: 'dark' });
		expect(opened).not.toHaveBeenCalled();
		await press(button());
		expect(opened).toHaveBeenCalledTimes(1);
		const event = opened.mock.calls[0][0] as Event;
		expect(event.target).toBe(host);
		expect(event.bubbles && event.composed).toBe(true);
		expect(pageController().sharedState()!.episode).toMatchObject({
			id: EPISODE_ID,
			title: 'Episode One',
			podcastTitle: 'Test Signal',
			accent: '#0ea5e9',
			theme: 'dark',
			credit: true,
			season_number: 2,
			episode_number: 4
		});
		document.removeEventListener('showfm:mini-player', opened);
	});

	it('mini-player="off": no mini-player; credit="off" or an unbranded show: no credit', async () => {
		const opened = vi.fn();
		document.addEventListener('showfm:mini-player', opened);
		const { button } = await mountButton({ 'mini-player': 'off', credit: 'off' });
		await press(button());
		expect(opened).not.toHaveBeenCalled();
		expect(pageController().sharedState()!.episode!.credit).toBe(false);
		document.removeEventListener('showfm:mini-player', opened);
	});
});

describe('load="click" (design page 6)', () => {
	it('a pressed facade loads and plays, keeps focus on the button, and goes', async () => {
		const host = document.createElement('showfm-play');
		host.setAttribute('api', API);
		host.setAttribute('episode', EPISODE_ID);
		host.setAttribute('load', 'click');
		host.setAttribute('data-showfm-activated', 'play');
		host.setAttribute('data-showfm-focus', '');
		host.innerHTML = '<div data-showfm-facade-ui><button>Play podcast episode</button></div>';
		document.body.append(host);
		mountPlay(host);
		await settle();
		expect(host.querySelector('[data-showfm-facade-ui]')).toBeNull();
		expect(host.hasAttribute('data-showfm-activated')).toBe(false);
		const button = host.shadowRoot!.querySelector('[data-play]');
		expect(deepActive()).toBe(button);
		expect(button!.getAttribute('aria-label')).toBe('Pause · 52 min left: Episode One');
	});

	it('showfm.load() loads it but does not play', async () => {
		const { root } = await mountButton({ load: 'click', 'data-showfm-activated': 'load' });
		expect(text(root)).toBe('Play');
		expect(pageController().sharedState()).toBeNull();
	});
});

describe('strings (design page 8)', () => {
	it('follows lang: German and French, with the narrow no-break space', async () => {
		const de = await mountButton({ lang: 'de', size: 'lg' });
		expect(text(de.root)).toBe('Folge abspielen · 52 Min.');
		expect(de.button()!.getAttribute('aria-label')).toBe('Folge abspielen · 52 Min.: Episode One');
		document.documentElement.setAttribute('lang', 'fr-FR');
		const fr = await mountButton();
		expect(text(fr.root)).toBe('Lire');
		expect(fr.button()!.getAttribute('aria-label')).toBe('Lire : Episode One');
		api.episode = api.recheck = 403;
		const suspended = await mountButton({ lang: 'de' });
		expect(message(suspended.root)).toHaveTextContent('Diese Show ist gerade nicht verfügbar.');
	});

	it('takes window.showfmStrings, then element.strings, even one set before it mounted', async () => {
		(window as unknown as { showfmStrings: unknown }).showfmStrings = { play: 'Hear it' };
		const page = await mountButton();
		expect(text(page.root)).toBe('Hear it');
		const host = document.createElement('showfm-play');
		host.setAttribute('api', API);
		host.setAttribute('episode', EPISODE_ID);
		host.setAttribute('variant', 'link');
		(host as HTMLElement & { strings?: unknown }).strings = { listen: 'Hear · {duration}' };
		document.body.append(host);
		mountPlay(host);
		await settle();
		expect(text(host.shadowRoot!)).toBe('Hear · 52 min');
		(host as HTMLElement & { strings?: unknown }).strings = { listen: 'Écoutez · {duration}' };
		await settle();
		expect(text(host.shadowRoot!)).toBe('Écoutez · 52 min');
	});
});

describe('attributes are read live', () => {
	it('a new variant or episode re-renders, and it unmounts and mounts again with the element', async () => {
		const { host, root, connection } = await mountButton();
		host.setAttribute('variant', 'link');
		await settle();
		expect(text(root)).toBe('Listen · 52 min');
		connection(false);
		expect(root.querySelector('.root')).toBeNull();
		connection(true);
		await settle();
		expect(root.querySelector('[data-play]')).not.toBeNull();
	});
});
