/**
 * The page's mini-player (design page 3.3, with pages 5 and 9), driven the
 * way a page drives it: <showfm-play> and <showfm-episodes> registered as
 * v1.js registers them, pressed, and the <showfm-mini-player> they add.
 *
 * Covers when it appears, the bar, the pill and the phone sheet, every
 * control, where focus goes, the suspended state, the credit's placement,
 * the position and bottom offset, the strings, the announcements and
 * jest-axe on each layout. (Which parts each layout shows is CSS: the
 * browser tests measure that.)
 */
import { axe } from 'jest-axe';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShowfmPlay } from '../play-element';
import { defineShowfmEpisodes } from '../episodes-element';
import { pageController } from '../controller';
import {
	API,
	AXE,
	EPISODE_ID,
	HOSTED_AUDIO,
	api,
	clearPage,
	deepActive,
	installMedia,
	media,
	mediaEvent,
	resetPage,
	settle,
	sharedAudio,
	viewport
} from './play-harness';

beforeAll(() => {
	installMedia();
	defineShowfmPlay();
	defineShowfmEpisodes();
});
beforeEach(resetPage);
afterEach(clearPage);

type Mini = HTMLElement & { shadowRoot: ShadowRoot };

/** Adds a play button and waits for its chunk to mount it. */
async function addButton(attributes: Record<string, string> = {}) {
	const host = document.createElement('showfm-play');
	host.setAttribute('api', API);
	host.setAttribute('episode', EPISODE_ID);
	for (const [name, value] of Object.entries(attributes)) host.setAttribute(name, value);
	document.body.append(host);
	// The first import compiles the chunk, so give it time.
	await vi.waitFor(() => expect(host.shadowRoot?.querySelector('[data-play]')).toBeTruthy(), {
		timeout: 10_000
	});
	const play = () => host.shadowRoot!.querySelector<HTMLButtonElement>('[data-play]')!;
	return { host, play };
}

async function press(button: HTMLElement) {
	button.focus();
	button.click();
	await settle();
}

/** Presses a new play button and waits for the mini-player it opens. */
async function open(attributes: Record<string, string> = {}) {
	const button = await addButton(attributes);
	await press(button.play());
	const mini = await vi.waitFor(
		() => {
			const found = document.querySelector('showfm-mini-player') as Mini | null;
			expect(found?.shadowRoot?.querySelector('section')).toBeTruthy();
			return found!;
		},
		{ timeout: 10_000 }
	);
	const root = mini.shadowRoot;
	const section = () => root.querySelector<HTMLElement>('section');
	const control = (name: string) => root.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
	const spoken = () => root.querySelector('p[role="status"]')!.textContent;
	return { ...button, mini, root, section, control, spoken };
}

describe('when it appears', () => {
	it('only after the first play, once per page, at the end of the body', async () => {
		const { play } = await addButton();
		expect(document.querySelector('showfm-mini-player')).toBeNull();
		await press(play());
		const { mini, host } = await open();
		expect(document.querySelectorAll('showfm-mini-player')).toHaveLength(1);
		expect(mini.parentElement).toBe(document.body);
		// Added after the first button, before the second.
		expect(document.querySelector('showfm-play')!.nextElementSibling).toBe(mini);
		expect(mini.nextElementSibling).toBe(host);
	});

	it('never for a button with mini-player="off"', async () => {
		const { play } = await addButton({ 'mini-player': 'off' });
		await press(play());
		await settle();
		expect(document.querySelector('showfm-mini-player')).toBeNull();
	});

	it('for a list row when the list has mini-player="on" (the event EMB-3 dispatches)', async () => {
		const list = document.createElement('showfm-episodes');
		list.setAttribute('api', API);
		list.setAttribute('podcast', 'the-long-table');
		list.setAttribute('mini-player', 'on');
		document.body.append(list);
		await vi.waitFor(
			() => expect(list.shadowRoot?.querySelector('[data-row] [data-play]')).toBeTruthy(),
			{ timeout: 10_000 }
		);
		await press(list.shadowRoot!.querySelector<HTMLElement>('[data-row] [data-play]')!);
		await vi.waitFor(() =>
			expect(document.querySelector('showfm-mini-player')?.shadowRoot?.textContent).toContain(
				'Sourdough, salt and the slow return of the village bakery'
			)
		);
	});
});

describe('the bar (desktop)', () => {
	it('shows the episode and every control, and is axe-clean', async () => {
		const { mini, root, section, control, spoken } = await open();
		expect(section()!.getAttribute('role')).toBe('region');
		expect(section()!.getAttribute('aria-label')).toBe('Now playing');
		expect(root.querySelector('.title')!.textContent).toBe('Episode One');
		// "S2 · E4" shows; "Season 2, episode 4" is read.
		expect(root.querySelector('.sub')!.textContent).toBe(
			'Test Signal · S2 · E4Season 2, episode 4'
		);
		expect(root.querySelector('.sub [aria-hidden="true"]')!.textContent).toBe('S2 · E4');
		for (const name of [
			'Back 15 seconds',
			'Pause: Episode One',
			'Forward 30 seconds',
			'Playback speed, currently 1×',
			'Collapse player',
			'Close player and stop playback'
		]) {
			expect(control(name), name).not.toBeNull();
		}
		const seek = root.querySelector('input[type="range"]')!;
		expect(seek.getAttribute('aria-label')).toBe('Seek');
		expect(seek.getAttribute('aria-valuetext')).toBe('0:00 of 52:18');
		expect(spoken()).toBe('Now playing: Episode One');
		// Opening does not take focus from the button that was pressed.
		expect(mini.shadowRoot.contains(deepActive())).toBe(false);
		expect(await axe(mini, AXE)).toHaveNoViolations();
	});

	it('drives the shared audio: play, pause, skip, seek and speed, and says so', async () => {
		const { root, control, spoken } = await open();
		const audio = sharedAudio();
		await press(control('Pause: Episode One')!);
		expect(audio.paused).toBe(true);
		expect(spoken()).toBe('Paused');
		await press(control('Play: Episode One')!);
		expect(audio.paused).toBe(false);
		expect(spoken()).toBe('Playing');
		await press(control('Forward 30 seconds')!);
		expect(audio.currentTime).toBe(30);
		await press(control('Back 15 seconds')!);
		expect(audio.currentTime).toBe(15);
		await press(control('Back 15 seconds')!);
		expect(audio.currentTime).toBe(0);
		const seek = root.querySelector<HTMLInputElement>('input[type="range"]')!;
		seek.value = '846';
		seek.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		expect(audio.currentTime).toBe(846);
		expect(seek.getAttribute('aria-valuetext')).toBe('14:06 of 52:18');
		expect(root.querySelector('.time')!.textContent).toBe('38 min left');
		await press(control('Playback speed, currently 1×')!);
		expect(audio.playbackRate).toBe(1.25);
		expect(spoken()).toBe('Playback speed 1.25×');
		expect(control('Playback speed, currently 1.25×')).not.toBeNull();
	});

	it('shows whatever the shared audio is doing, whoever started it', async () => {
		const { control, root, spoken } = await open();
		mediaEvent(sharedAudio(), 'waiting');
		await settle();
		expect(control('Pause: Episode One')!.classList.contains('busy')).toBe(true);
		// A list row (mini-player off) plays next: the mini-player follows it.
		const list = document.createElement('showfm-episodes');
		list.setAttribute('api', API);
		list.setAttribute('podcast', 'the-long-table');
		document.body.insertBefore(list, document.body.firstChild);
		await vi.waitFor(
			() => expect(list.shadowRoot?.querySelector('[data-row] [data-play]')).toBeTruthy(),
			{ timeout: 10_000 }
		);
		await press(list.shadowRoot!.querySelector<HTMLElement>('[data-row] [data-play]')!);
		expect(root.querySelector('.title')!.textContent).toBe(
			'Sourdough, salt and the slow return of the village bakery'
		);
		expect(spoken()).toBe('Now playing: Sourdough, salt and the slow return of the village bakery');
	});
});

describe('nothing stale lands', () => {
	it('"Playing" is not said for an episode the shared audio no longer holds', async () => {
		const { control, spoken } = await open();
		await press(control('Pause: Episode One')!);
		// Play from the mini-player, and before that play resolves another
		// element starts a different episode on the shared audio.
		control('Play: Episode One')!.click();
		void pageController().playShared(
			{},
			{ id: 'other', title: 'Another episode' },
			'https://m.cdn.media/other.mp3'
		);
		await settle();
		expect(spoken()).toBe('Now playing: Another episode');
	});
});

describe('collapse, expand and close (focus goes with them)', () => {
	it('Collapse makes the pill, keeps playing and moves focus to Expand; Expand comes back', async () => {
		const { mini, root, section, control } = await open();
		await press(control('Collapse player')!);
		expect(section()!.classList.contains('pill')).toBe(true);
		expect(sharedAudio().paused).toBe(false);
		expect(deepActive()).toBe(control('Expand player'));
		expect(root.querySelector('.time')!.textContent).toBe('52 min left');
		expect(await axe(mini, AXE)).toHaveNoViolations();
		await press(control('Expand player')!);
		expect(section()!.classList.contains('pill')).toBe(false);
		expect(deepActive()).toBe(control('Collapse player'));
	});

	it('Close stops playback, hides it and gives focus back; the next play brings back the bar', async () => {
		const { play, section, control } = await open();
		await press(control('Collapse player')!);
		await press(control('Close player and stop playback')!);
		expect(sharedAudio().paused).toBe(true);
		expect(section()).toBeNull();
		expect(deepActive()).toBe(play());
		await press(play());
		expect(section()).not.toBeNull();
		expect(section()!.classList.contains('pill')).toBe(false);
	});

	it('sits in the corner the opener asks for, lifted by its --showfm-bottom-offset', async () => {
		const { mini, root } = await open({
			'mini-player-position': 'left',
			style: '--showfm-bottom-offset: 72px'
		});
		expect(root.querySelector('.mini')!.className).toContain('pos-left');
		expect(mini.style.getPropertyValue('--showfm-bottom-offset')).toBe('72px');
		// The styles that use it, and the reduced-motion rule, are checked in
		// the built chunk (tests/contract/play.test.ts): Vitest loads no CSS.
	});
});

describe('per opener', () => {
	it('drops a bottom offset the next opener does not set', async () => {
		const { mini, control } = await open({ style: '--showfm-bottom-offset: 72px' });
		expect(mini.style.getPropertyValue('--showfm-bottom-offset')).toBe('72px');
		await press(control('Close player and stop playback')!);
		const other = await open({ episode: '22222222-2222-4333-8444-555555555555' });
		expect(other.mini).toBe(mini);
		expect(mini.style.getPropertyValue('--showfm-bottom-offset')).toBe('');
	});

	it("takes the opener's own strings for its keys and the player's", async () => {
		const host = document.createElement('showfm-play');
		host.setAttribute('api', API);
		host.setAttribute('episode', EPISODE_ID);
		(host as HTMLElement & { strings?: unknown }).strings = {
			closePlayer: 'Stop listening',
			back15: 'Back a bit'
		};
		document.body.append(host);
		await vi.waitFor(() => expect(host.shadowRoot?.querySelector('[data-play]')).toBeTruthy(), {
			timeout: 10_000
		});
		await press(host.shadowRoot!.querySelector<HTMLElement>('[data-play]')!);
		const root = await vi.waitFor(() => {
			const found = document.querySelector('showfm-mini-player')?.shadowRoot;
			expect(found?.querySelector('section')).toBeTruthy();
			return found!;
		});
		expect(root.querySelector('[aria-label="Stop listening"]')).not.toBeNull();
		expect(root.querySelector('[aria-label="Back a bit"]')).not.toBeNull();
		expect(root.querySelector('[aria-label="Collapse player"]')).not.toBeNull();
	});
});

describe('an episode of unknown length', () => {
	it('shows no time left rather than " left", in every language', async () => {
		api.payload = {
			audio: { url: HOSTED_AUDIO, content_type: 'audio/mpeg', duration_seconds: null }
		};
		media.duration = Number.NaN;
		for (const lang of ['en', 'de', 'fr']) {
			const { root, control } = await open({ lang });
			expect(root.querySelector('.time')!.textContent, lang).toBe('');
			const collapse = control(
				lang === 'en'
					? 'Collapse player'
					: lang === 'de'
						? 'Player verkleinern'
						: 'Réduire le lecteur'
			)!;
			await press(collapse);
			expect(root.querySelector('.time')!.textContent, lang).toBe('');
			// The next language's button plays the same episode afresh.
			sharedAudio().pause();
			document.body.innerHTML = '';
			await settle();
		}
	});
});

describe('the phone sheet', () => {
	it('Expand opens a modal sheet with focus inside; Tab stays in it; Escape closes it', async () => {
		viewport({ phone: true });
		const { mini, root, section, control } = await open();
		await press(control('Expand player')!);
		const sheet = section()!;
		expect(sheet.getAttribute('role')).toBe('dialog');
		expect(sheet.getAttribute('aria-modal')).toBe('true');
		expect(sheet.getAttribute('aria-label')).toBe('Audio player: Episode One');
		expect(root.querySelector('.backdrop')).not.toBeNull();
		expect(deepActive()).toBe(control('Collapse player'));
		expect(await axe(mini, AXE)).toHaveNoViolations();
		// Tab from the last control wraps to the first, and back.
		const controls = [...sheet.querySelectorAll<HTMLElement>('button, input, a[href]')];
		controls.at(-1)!.focus();
		sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		expect(deepActive()).toBe(controls[0]);
		sheet.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
		);
		expect(deepActive()).toBe(controls.at(-1));
		sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(section()!.getAttribute('role')).toBe('region');
		expect(root.querySelector('.backdrop')).toBeNull();
		expect(deepActive()).toBe(control('Expand player'));
	});

	it("the sheet's Collapse makes the pill; the pill's Expand brings back the phone bar", async () => {
		viewport({ phone: true });
		const { section, control } = await open();
		await press(control('Expand player')!);
		await press(control('Collapse player')!);
		expect(section()!.classList.contains('pill')).toBe(true);
		await press(control('Expand player')!);
		expect(section()!.classList.contains('pill')).toBe(false);
		// The phone bar's own Expand.
		expect(deepActive()).toBe(control('Expand player'));
	});
});

describe('suspended mid-listen (design page 5)', () => {
	it('stops, keeps the title and artwork, and leaves only Close', async () => {
		const { mini, root, section, spoken } = await open();
		api.recheck = 403;
		mediaEvent(sharedAudio(), 'error');
		await vi.waitFor(() => expect(section()!.classList.contains('msg')).toBe(true));
		expect(root.querySelector('.message')!.textContent).toBe(
			'This show isn’t available right now.'
		);
		expect(root.querySelector('.title')!.textContent).toBe('Episode One');
		expect(root.querySelector('img.art')).not.toBeNull();
		expect([...root.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
			'Close player and stop playback'
		]);
		expect(spoken()).toBe('This show isn’t available right now.');
		expect(sharedAudio().paused).toBe(true);
		expect(await axe(mini, AXE)).toHaveNoViolations();
	});

	it('collapsed when it happens: Play becomes an info mark, Expand becomes Close', async () => {
		const { mini, root, section, control } = await open();
		await press(control('Collapse player')!);
		api.recheck = 403;
		mediaEvent(sharedAudio(), 'error');
		await vi.waitFor(() => expect(section()!.classList.contains('msg')).toBe(true));
		expect(section()!.classList.contains('pill')).toBe(true);
		const mark = root.querySelector('.info')!;
		expect(mark.getAttribute('role')).toBe('img');
		expect(mark.getAttribute('aria-label')).toBe('This show isn’t available right now.');
		expect(root.querySelector('.time')!.textContent).toBe('This show isn’t available right now.');
		expect(root.querySelector('[data-play], [data-expand]')).toBeNull();
		expect(control('Close player and stop playback')).not.toBeNull();
		expect(await axe(mini, AXE)).toHaveNoViolations();
	});
});

describe('"Powered by show.fm" (decision 3)', () => {
	it('goes in the mini-player when the page has only play buttons', async () => {
		const { root } = await open();
		const credit = root.querySelector<HTMLAnchorElement>('.credit')!;
		expect(credit.textContent).toBe('Powered by show.fm');
		expect(credit.href).toBe('https://show.fm/?ref=player');
	});

	it('stays on an embed above it that shows it, and is off for credit="off"', async () => {
		const list = document.createElement('showfm-episodes');
		list.setAttribute('api', API);
		list.setAttribute('podcast', 'the-long-table');
		document.body.append(list);
		await vi.waitFor(() => expect(list.shadowRoot?.querySelector('.powered-by')).toBeTruthy(), {
			timeout: 10_000
		});
		const { root } = await open();
		expect(root.querySelector('.credit')).toBeNull();
		list.remove();
		await settle();
		expect(root.querySelector('.credit')).not.toBeNull();
	});

	it('is off when the button that started the episode says credit="off"', async () => {
		const { root } = await open({ credit: 'off' });
		expect(root.querySelector('.credit')).toBeNull();
	});
});

describe('strings', () => {
	it("speaks the opener's language", async () => {
		const { section, control } = await open({ lang: 'de' });
		expect(section()!.getAttribute('aria-label')).toBe('Läuft gerade');
		expect(control('Player verkleinern')).not.toBeNull();
		expect(control('Player schließen und Wiedergabe beenden')).not.toBeNull();
		expect(control('15 Sekunden zurück')).not.toBeNull();
	});
});
