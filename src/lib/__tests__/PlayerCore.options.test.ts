/**
 * PlayerCore options added for the shared foundations (EMB-2): credit,
 * heading-level, strings and language, external audio, the page audio
 * controller, and play()/focusPlay() for the load="click" hand-off. The
 * tests moved from the app stay unchanged in PlayerCore.test.ts.
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import PlayerCore from '../PlayerCore.svelte';
import type { PlayerEpisodeData } from '../types';

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
