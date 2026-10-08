/**
 * <showfm-player> states, compiled as an ordinary component (the custom
 * element build is covered by tests/contract and tests/browser):
 * load="click" requests nothing before the press, a 404 collapses with no
 * trace of why, a 403 shows the suspended card, and the attributes
 * heading-level, credit and the language reach the player.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ShowfmPlayer from '../ShowfmPlayer.svelte';
import { resolvePalette } from '../palette';
import { episodePayload } from '../../../tests/fixtures/episode';

const AXE_MEDIA_OPTIONS = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';
const API = 'https://api.example.test';

beforeAll(() => {
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			this.dispatchEvent(new Event('play'));
		})
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value: vi.fn()
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.documentElement.removeAttribute('lang');
});

function stubFetch(answer: (url: string) => Response | Promise<Response>) {
	const spy = vi.fn((url: string) => Promise.resolve(answer(url)));
	vi.stubGlobal('fetch', spy);
	return spy;
}
const ok =
	(payload: unknown = episodePayload()) =>
	() =>
		new Response(JSON.stringify({ data: payload }), { status: 200 });
const status =
	(code: number, body: unknown = { error: { code: 'not_found', message: 'Episode not found.' } }) =>
	() =>
		new Response(JSON.stringify(body), { status: code });

/** Element children, ignoring the comment anchors Svelte leaves. */
const rendered = (container: HTMLElement) => container.querySelectorAll('*').length;

function setVisibility(state: 'hidden' | 'visible') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('load="click"', () => {
	it('makes no request before the press, then loads and plays on it', async () => {
		const fetchSpy = stubFetch(ok());
		const { container } = render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, load: 'click' }
		});
		const facade = await screen.findByRole('button', { name: 'Play podcast episode' });
		expect(facade).toHaveAccessibleDescription('Loads from show.fm when you press play');
		await new Promise((r) => setTimeout(r, 20));
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();

		facade.focus();
		await fireEvent.click(facade);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(`${API}/v1/episodes/${EPISODE_ID}`);
		// One press loads and plays, and focus follows to the real play button.
		const pause = await screen.findByRole('button', { name: 'Pause' });
		await waitFor(() => expect(document.activeElement).toBe(pause));
	});

	it('shows the facade with a busy ring while loading, keeping the button', async () => {
		stubFetch(() => new Promise<Response>(() => {}));
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, load: 'click' } });
		const facade = await screen.findByRole('button', { name: 'Play podcast episode' });
		await fireEvent.click(facade);
		expect(screen.getByRole('button', { name: 'Play podcast episode' })).toHaveAttribute(
			'aria-busy',
			'true'
		);
	});

	it('showfm.load() (the showfm:load event) loads every facade without playing', async () => {
		const fetchSpy = stubFetch(ok());
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, load: 'click' } });
		render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, load: 'click', size: 'compact' }
		});
		await screen.findAllByRole('button', { name: 'Play podcast episode' });
		expect(fetchSpy).not.toHaveBeenCalled();
		document.dispatchEvent(new Event('showfm:load'));
		await waitFor(() => expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(2));
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
	});

	it('uses a valid accent on the facade (made 3:1), and the default for anything else', async () => {
		stubFetch(ok());
		const { container } = render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, load: 'click', accent: '0ea5e9' }
		});
		const other = render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, load: 'click', accent: 'red;background:url(x)' }
		});
		await screen.findAllByRole('button', { name: 'Play podcast episode' });
		expect(container.querySelector('.facade')?.getAttribute('style')).toContain(
			`--pp-accent: ${resolvePalette('#0ea5e9', 'light').accent};`
		);
		expect(other.container.querySelector('.facade')?.getAttribute('style')).toContain(
			'--pp-accent: #7e22ce;'
		);
	});

	it('translates the facade with <html lang>', async () => {
		stubFetch(ok());
		document.documentElement.setAttribute('lang', 'de');
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, load: 'click' } });
		expect(
			await screen.findByRole('button', { name: 'Podcastfolge abspielen' })
		).toBeInTheDocument();
	});
});

describe('not found: collapse (plan Q1)', () => {
	it('renders nothing for a 404', async () => {
		stubFetch(status(404));
		const { container } = render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API } });
		await waitFor(() => expect(rendered(container)).toBe(0));
		expect(container.textContent?.trim()).toBe('');
	});

	it('renders the same DOM for a scheduled episode and a random UUID', async () => {
		// The API answers both with the same 404, so nothing about a schedule
		// can reach the page.
		stubFetch(status(404));
		const scheduled = render(ShowfmPlayer, {
			props: { episode: '33333333-4444-4555-8666-777777777777', api: API }
		});
		const random = render(ShowfmPlayer, { props: { episode: crypto.randomUUID(), api: API } });
		await waitFor(() => expect(rendered(scheduled.container)).toBe(0));
		await waitFor(() => expect(rendered(random.container)).toBe(0));
		expect(scheduled.container.innerHTML).toBe(random.container.innerHTML);
	});

	it('re-checks once when the tab becomes visible again, never polling', async () => {
		let published = false;
		const fetchSpy = stubFetch(() => (published ? ok()() : status(404)()));
		const { container } = render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API } });
		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(rendered(container)).toBe(0));

		// Visible → visible is not a return to the tab.
		setVisibility('visible');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		setVisibility('hidden');
		published = true;
		setVisibility('visible');
		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
		expect(
			await screen.findByRole('group', { name: 'Audio player: Episode One' })
		).toBeInTheDocument();
	});

	it('re-checks only once while the episode stays missing', async () => {
		const fetchSpy = stubFetch(status(404));
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API } });
		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		for (let i = 0; i < 3; i++) {
			setVisibility('hidden');
			setVisibility('visible');
			await new Promise((r) => setTimeout(r, 5));
		}
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});

describe('suspended show: 403 unavailable (design page 5)', () => {
	it('shows the message card with no actions and no fallback', async () => {
		stubFetch(status(403, { error: { code: 'unavailable', message: 'x' } }));
		const { container } = render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, size: 'compact' }
		});
		const message = await screen.findByText('This show isn’t available right now.');
		expect(message.closest('[role="status"]')).not.toBeNull();
		expect(container.querySelector('button, a, slot')).toBeNull();
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});
});

describe('any other failure', () => {
	// The slot that projects the light-DOM fallback exists only in the custom
	// element build; tests/contract/v1.test.ts checks it.
	it.each([500, 429])('%i shows the one error string', async (code) => {
		stubFetch(status(code));
		const { container } = render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API } });
		expect(await screen.findByText('This episode can’t be played right now.')).toBeInTheDocument();
		expect(container.querySelector('.fallback')).not.toBeNull();
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});
});

describe('attributes', () => {
	it('heading-level="3" wraps the title in an <h3>; absent emits none', async () => {
		stubFetch(ok());
		const { container } = render(ShowfmPlayer, {
			props: { episode: EPISODE_ID, api: API, headingLevel: '3' }
		});
		expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Episode One');
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('heading-level outside 2 to 6 emits no heading', async () => {
		stubFetch(ok());
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, headingLevel: '1' } });
		await screen.findByRole('group');
		expect(screen.queryByRole('heading')).toBeNull();
	});

	// show_powered_by is false only for a show whose plan includes branding
	// removal and that turned the credit off: only then can it hide.
	it.each([
		['auto', true, true],
		['auto', false, false],
		['off', true, true],
		['off', false, false],
		['on', false, true],
		['nonsense', false, false]
	])('credit="%s" with show_powered_by %s shows the credit: %s', async (credit, branded, shown) => {
		stubFetch(ok(episodePayload({ branded })));
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, credit } });
		await screen.findByRole('group');
		expect(screen.queryByRole('link', { name: /powered by show\.fm/i }) !== null).toBe(shown);
	});

	it.each(['auto', 'off'])(
		'credit="%s" shows the credit when the payload has no branding (cached before it)',
		async (credit) => {
			const payload = episodePayload();
			delete (payload.podcast as { branding?: unknown }).branding;
			stubFetch(ok(payload));
			render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API, credit } });
			await screen.findByRole('group');
			expect(screen.getByRole('link', { name: /powered by show\.fm/i })).toBeInTheDocument();
		}
	);

	it('French strings with an override from window.showfmStrings', async () => {
		stubFetch(status(500));
		document.documentElement.setAttribute('lang', 'fr-FR');
		vi.stubGlobal('showfmStrings', { error: 'Oups.' });
		render(ShowfmPlayer, { props: { episode: EPISODE_ID, api: API } });
		expect(await screen.findByText('Oups.')).toBeInTheDocument();
	});
});
