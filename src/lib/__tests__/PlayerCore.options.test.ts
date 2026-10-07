/**
 * PlayerCore options added for the shared foundations (EMB-2): credit,
 * heading-level, strings and language, external audio, the page audio
 * controller, and play()/focusPlay() for the load="click" hand-off. The
 * tests moved from the app stay unchanged in PlayerCore.test.ts.
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import PlayerCore from '../PlayerCore.svelte';
import type { PlayerEpisodeData } from '../types';
import { contrastRatio, mixHex } from '../contrast';

const AXE_MEDIA_OPTIONS = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};

// jsdom has no media pipeline. These stubs also track paused, so the page
// controller can see which audio is playing.
const playing = new WeakSet<HTMLMediaElement>();
beforeAll(() => {
	Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
		configurable: true,
		get(this: HTMLMediaElement) {
			return !playing.has(this);
		}
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			playing.add(this);
			this.dispatchEvent(new Event('play'));
		})
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value: vi.fn(function (this: HTMLMediaElement) {
			if (!playing.delete(this)) return;
			this.dispatchEvent(new Event('pause'));
		})
	});
});

afterEach(() => {
	delete (window as unknown as { showfmMediaHosts?: unknown }).showfmMediaHosts;
});

function makeEpisode(overrides: Partial<PlayerEpisodeData> = {}): PlayerEpisodeData {
	return {
		id: '11111111-2222-4333-8444-555555555555',
		title: 'Episode One',
		published_at: '2026-07-01T10:00:00.000Z',
		audio: {
			url: 'https://m.cdn.media/audio.mp3',
			content_type: 'audio/mpeg',
			duration_seconds: 1843
		},
		artwork: { url: 'https://m.cdn.media/cover.jpg' },
		links: { listen: 'https://show.fm/test-signal/e/episode-one' },
		podcast: { title: 'Test Signal', brand_color: '#7E22CE', branding: { show_powered_by: true } },
		...overrides
	};
}

const unbranded = () =>
	makeEpisode({
		podcast: { title: 'Test Signal', brand_color: null, branding: { show_powered_by: false } }
	});
const poweredBy = () => screen.queryByRole('link', { name: /powered by/i });

describe('credit', () => {
	it('null follows the payload, as the player always has', () => {
		const { unmount } = render(PlayerCore, { props: { episode: makeEpisode(), credit: null } });
		expect(poweredBy()).not.toBeNull();
		unmount();
		render(PlayerCore, { props: { episode: unbranded(), credit: null } });
		expect(poweredBy()).toBeNull();
	});

	it('false hides it and true shows it, whatever the payload says', () => {
		const { unmount } = render(PlayerCore, { props: { episode: makeEpisode(), credit: false } });
		expect(poweredBy()).toBeNull();
		unmount();
		render(PlayerCore, { props: { episode: unbranded(), credit: true } });
		expect(poweredBy()).not.toBeNull();
	});
});

describe('heading-level', () => {
	it('emits no heading by default: the title stays a link', () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.getByRole('link', { name: 'Episode One' })).toBeInTheDocument();
	});

	it.each([2, 3, 4, 5, 6])('wraps the title link in an <h%i>', async (level) => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), headingLevel: level }
		});
		const heading = screen.getByRole('heading', { level });
		expect(heading.querySelector('a')?.textContent?.trim()).toBe('Episode One');
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('wraps the compact title too', () => {
		render(PlayerCore, { props: { episode: makeEpisode(), size: 'compact', headingLevel: 3 } });
		expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Episode One');
	});

	it.each([1, 7, 0, 2.5, Number.NaN])('ignores %s: levels 2 to 6 only', (level) => {
		render(PlayerCore, { props: { episode: makeEpisode(), headingLevel: level } });
		expect(screen.queryByRole('heading')).toBeNull();
	});
});

describe('strings and language', () => {
	it('speaks German with lang="de"', async () => {
		const { container } = render(PlayerCore, { props: { episode: makeEpisode(), lang: 'de-DE' } });
		expect(screen.getByRole('group', { name: 'Audioplayer: Episode One' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '15 Sekunden zurück' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Folge herunterladen' })).toBeInTheDocument();
		expect(screen.getByRole('slider', { name: 'Position' })).toHaveAttribute(
			'aria-valuetext',
			expect.stringContaining('von 30 Minuten 43 Sekunden')
		);
		expect(screen.getByRole('link', { name: /bereitgestellt von show\.fm/i })).toBeInTheDocument();
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('survives a lang that is not a valid language tag', () => {
		render(PlayerCore, { props: { episode: makeEpisode(), lang: 'not a tag!' } });
		expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
		expect(screen.getByText(/Test Signal/)).toBeInTheDocument();
	});

	it('shows the French error string on the error card', () => {
		render(PlayerCore, {
			props: {
				episode: makeEpisode({ audio: { url: null, content_type: null, duration_seconds: null } }),
				lang: 'fr'
			}
		});
		expect(screen.getByText('Lecture impossible pour le moment.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Écouter sur show.fm' })).toBeInTheDocument();
	});

	it('takes overrides for single strings', async () => {
		render(PlayerCore, { props: { episode: makeEpisode(), strings: { play: 'Start' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
		expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
	});
});

describe('external audio (design page 9)', () => {
	it('streams but offers no Download when the audio is not on a show.fm host', async () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({
					audio: {
						url: 'https://cdn.other-host.test/a.mp3',
						content_type: 'audio/mpeg',
						duration_seconds: 60
					}
				})
			}
		});
		expect(screen.queryByRole('link', { name: 'Download episode' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Share episode' })).toBeInTheDocument();
		expect(container.querySelector('audio')?.getAttribute('src')).toBe(
			'https://cdn.other-host.test/a.mp3?src=embed'
		);
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('offers Download on a show.fm host, including hosts the page adds', () => {
		(window as unknown as { showfmMediaHosts: string[] }).showfmMediaHosts = ['media.example.test'];
		render(PlayerCore, {
			props: {
				episode: makeEpisode({
					audio: {
						url: 'https://media.example.test/a.mp3',
						content_type: 'audio/mpeg',
						duration_seconds: 60
					}
				})
			}
		});
		expect(screen.getByRole('link', { name: 'Download episode' })).toBeInTheDocument();
	});
});

describe('page audio controller', () => {
	it('pauses the other players when one starts', async () => {
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		const second = render(PlayerCore, {
			props: { episode: makeEpisode({ id: 'two', title: 'Episode Two' }) }
		});
		const [first, other] = [container, second.container].map((c) => c.querySelector('audio')!);
		const [playOne, playTwo] = screen.getAllByRole('button', { name: 'Play' });
		await fireEvent.click(playOne);
		expect(first.paused).toBe(false);
		await fireEvent.click(playTwo);
		expect(first.paused).toBe(true);
		expect(other.paused).toBe(false);
		// The first player's own UI follows: its button reads Play again.
		expect(
			screen
				.getAllByRole('button', { name: /^(Play|Pause)$/ })
				.map((b) => b.getAttribute('aria-label'))
		).toEqual(['Play', 'Pause']);
	});
});

describe('play() and focusPlay()', () => {
	it('start playback and focus the play button, for the load="click" hand-off', async () => {
		const { component } = render(PlayerCore, { props: { episode: makeEpisode() } });
		component.focusPlay();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Play' }));
		component.play();
		await tick();
		expect(screen.getByRole('button', { name: 'Pause' })).toBe(document.activeElement);
	});
});

describe('the transcript option (design page 3.1 A)', () => {
	const VTT = 'https://m.cdn.media/one.vtt';
	const VTT_BODY =
		'WEBVTT\n\n00:00.000 --> 00:05.000\n<v Maya>Hello there.</v>\n\n00:05.000 --> 00:09.000\n<v Tom>Hi.</v>\n';
	const withTranscript = (overrides: Partial<PlayerEpisodeData> = {}) =>
		makeEpisode({ transcript: { url: VTT, type: 'text/vtt' }, ...overrides });
	const button = () => screen.queryByRole('button', { name: 'Transcript' });
	// Nothing in these tests reaches the network: the VTT is answered here.
	beforeEach(() => vi.stubGlobal('fetch', async () => new Response(VTT_BODY)));
	afterEach(() => vi.unstubAllGlobals());

	it('is off by default: no button, nothing changes', () => {
		const { container } = render(PlayerCore, { props: { episode: withTranscript() } });
		expect(button()).toBeNull();
		expect(container.querySelector('.tr')).toBeNull();
	});

	it('on: a Transcript button that opens it under the controls, credit underneath', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: withTranscript(), transcript: 'on' }
		});
		expect(button()).toHaveAttribute('aria-expanded', 'false');
		expect(container.querySelector('.tr')).toBeNull();
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
		const vtt = vi.fn(async (_input: RequestInfo | URL) => new Response(VTT_BODY));
		vi.stubGlobal('fetch', vtt);
		await fireEvent.click(button()!);
		expect(button()).toHaveAttribute('aria-expanded', 'true');
		const panel = container.querySelector('.tr')!;
		// The transcript itself, mounted in the player: no custom element,
		// no API request (the player has the episode), 340px of text.
		await vi.waitFor(() => expect(panel.shadowRoot?.querySelectorAll('.line')).toHaveLength(2), {
			timeout: 10_000
		});
		expect(vtt.mock.calls.map(([url]) => String(url))).toEqual([VTT]);
		expect(panel.shadowRoot!.querySelector<HTMLElement>('.scroll')!.style.height).toBe('340px');
		expect(customElements.get('showfm-transcript')).toBeUndefined();
		// It follows this player's audio.
		const audio = container.querySelector('audio')!;
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		Object.defineProperty(audio, 'currentTime', { configurable: true, value: 6 });
		audio.dispatchEvent(new Event('timeupdate'));
		await vi.waitFor(() =>
			expect(
				panel.shadowRoot!.querySelector<HTMLElement>('.line[aria-current="true"]')?.dataset.i
			).toBe('1')
		);
		vi.unstubAllGlobals();
		// "Powered by" moves under the transcript.
		expect(
			panel.compareDocumentPosition(poweredBy()!) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		await fireEvent.click(button()!);
		expect(container.querySelector('.tr')).toBeNull();
	});

	it('keeps the accent text at 4.5:1 when the player’s accent or theme changes', async () => {
		const { container, rerender } = render(PlayerCore, {
			props: { episode: withTranscript(), transcript: 'open', theme: 'light', accent: '#7E22CE' }
		});
		const panel = container.querySelector('.tr')!;
		await vi.waitFor(() => expect(panel.shadowRoot?.querySelector('.line')).toBeTruthy(), {
			timeout: 10_000
		});
		const text = () =>
			panel
				.shadowRoot!.querySelector<HTMLElement>('.tr')!
				.style.getPropertyValue('--pp-accent-text')
				.trim();
		const player = container.querySelector<HTMLElement>('.player')!;
		const ratio = () => {
			const bg = player.style.getPropertyValue('--pp-bg').trim();
			const accent = player.style.getPropertyValue('--pp-accent').trim();
			const dark = bg.toLowerCase() !== '#ffffff';
			return contrastRatio(text(), dark ? mixHex(bg, '#ffffff', 0.07) : mixHex(accent, bg, 0.92));
		};
		const light = text();
		expect(ratio()).toBeGreaterThanOrEqual(4.5);
		await rerender({ accent: '#facc15' });
		await vi.waitFor(() => expect(text()).not.toBe(light));
		expect(ratio()).toBeGreaterThanOrEqual(4.5);
		const yellow = text();
		await rerender({ theme: 'dark' });
		await vi.waitFor(() => expect(text()).not.toBe(yellow));
		expect(ratio()).toBeGreaterThanOrEqual(4.5);
	});

	it('open: opens at once', () => {
		const { container } = render(PlayerCore, {
			props: { episode: withTranscript(), transcript: 'open' }
		});
		expect(button()).toHaveAttribute('aria-expanded', 'true');
		expect(container.querySelector('.tr')).not.toBeNull();
	});

	it('is not offered in the compact size, without a VTT, or for media off show.fm', () => {
		const cases: [Partial<PlayerEpisodeData>, string?][] = [
			[{}, 'compact'],
			[{ transcript: null }],
			[{ transcript: { url: 'https://other.example.test/one.vtt' } }],
			[
				{
					audio: {
						url: 'https://cdn.other-host.test/a.mp3',
						content_type: null,
						duration_seconds: 9
					}
				}
			]
		];
		for (const [overrides, size] of cases) {
			const view = render(PlayerCore, {
				props: {
					episode: withTranscript(overrides),
					transcript: 'open',
					size: (size ?? 'standard') as 'standard' | 'compact'
				}
			});
			expect(button()).toBeNull();
			expect(view.container.querySelector('.tr')).toBeNull();
			view.unmount();
		}
	});

	it('names the button in German and French', () => {
		const de = render(PlayerCore, {
			props: { episode: withTranscript(), transcript: 'on', lang: 'de' }
		});
		expect(screen.getByRole('button', { name: 'Transkript' })).toBeInTheDocument();
		de.unmount();
		render(PlayerCore, { props: { episode: withTranscript(), transcript: 'on', lang: 'fr' } });
		expect(screen.getByRole('button', { name: 'Transcription' })).toBeInTheDocument();
	});
});
