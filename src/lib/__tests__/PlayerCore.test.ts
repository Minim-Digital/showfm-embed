/**
 * PlayerCore — the embeddable player UI. Covers the accessibility contract
 * (axe-clean in both sizes + error state, labelled controls, aria-live
 * announcements), the branding rule (footer only when show_powered_by),
 * playback interactions against jsdom's stubbed media element, and the
 * ?src= attribution on the audio URL.
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { axe, toHaveNoViolations } from 'jest-axe';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import PlayerCore from '../PlayerCore.svelte';
import type { PlayerEpisodeData } from '../types';

expect.extend(toHaveNoViolations);

// jsdom never loads media, so axe's media rules would wait forever for the
// <audio> element to become ready — disable them (transcripts a11y precedent).
const AXE_MEDIA_OPTIONS = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};

// jsdom has no media pipeline — stub the playback surface.
beforeAll(() => {
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			this.dispatchEvent(new Event('play'));
		})
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value: vi.fn(function (this: HTMLMediaElement) {
			this.dispatchEvent(new Event('pause'));
		})
	});
});

function makeEpisode(overrides: Partial<PlayerEpisodeData> = {}): PlayerEpisodeData {
	return {
		id: '11111111-2222-4333-8444-555555555555',
		title: 'Episode One',
		published_at: '2026-07-01T10:00:00.000Z',
		audio: {
			url: 'https://media.podcasterplus.com/audio.mp3',
			content_type: 'audio/mpeg',
			duration_seconds: 1843
		},
		artwork: { url: 'https://media.podcasterplus.com/cover.jpg' },
		links: { listen: 'https://listen.podcasterplus.com/test-signal/e/episode-one' },
		podcast: {
			title: 'Test Signal',
			brand_color: '#7E22CE',
			branding: { show_powered_by: true }
		},
		...overrides
	};
}

describe('accessibility', () => {
	it('standard size has no axe violations', async () => {
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('compact size has no axe violations', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), size: 'compact' }
		});
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('error state (no audio URL) has no axe violations and links out', async () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({ audio: { url: null, content_type: null, duration_seconds: null } })
			}
		});
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
		expect(screen.getByRole('link', { name: /listen on show\.fm/i })).toHaveAttribute(
			'href',
			'https://listen.podcasterplus.com/test-signal/e/episode-one'
		);
	});

	it('labels every control and exposes the seek slider with aria-valuetext', () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Forward 30 seconds' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /playback speed/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
		const seek = screen.getByRole('slider', { name: 'Seek' });
		expect(seek).toHaveAttribute(
			'aria-valuetext',
			expect.stringContaining('of 30 minutes 43 seconds')
		);
	});
});

describe('playback interactions', () => {
	it('play/pause toggles the button label and announces politely', async () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		const play = screen.getByRole('button', { name: 'Play' });
		await fireEvent.click(play);
		expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Playing');
		await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Paused');
	});

	it('cycles the playback rate and announces it', async () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		const rate = screen.getByRole('button', { name: /playback speed, currently 1×/i });
		await fireEvent.click(rate);
		expect(
			screen.getByRole('button', { name: /playback speed, currently 1.25×/i })
		).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Playback speed 1.25×');
	});

	it('appends the source tag to the audio URL for attribution', () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), sourceTag: 'listen' }
		});
		const audio = container.querySelector('audio');
		expect(audio?.getAttribute('src')).toBe('https://media.podcasterplus.com/audio.mp3?src=listen');
	});

	it('falls back to the payload duration before metadata loads', () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		const seek = screen.getByRole('slider', { name: 'Seek' });
		expect(seek).toHaveAttribute('max', '1843');
	});
});

describe('playback error resilience', () => {
	/** Temporarily make play() reject, restoring the resolving stub afterwards. */
	async function withRejectingPlay(error: Error, run: () => Promise<void>) {
		const original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')!;
		Object.defineProperty(HTMLMediaElement.prototype, 'play', {
			configurable: true,
			value: vi.fn(async () => {
				throw error;
			})
		});
		try {
			await run();
		} finally {
			Object.defineProperty(HTMLMediaElement.prototype, 'play', original);
		}
	}

	it('an interrupted play() (AbortError) does not brick the player', async () => {
		// preload="none" keeps play() pending until media loads; a pause() in
		// that window rejects it with AbortError. That is routine, not fatal —
		// the player must keep its controls instead of latching hasError.
		await withRejectingPlay(new DOMException('interrupted by pause()', 'AbortError'), async () => {
			render(PlayerCore, { props: { episode: makeEpisode() } });
			await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
			expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
			expect(screen.queryByText(/can’t be played right now/)).toBeNull();
		});
	});

	it('a blocked browser (NotAllowedError) keeps the <audio> element mounted behind the card', async () => {
		// A hard block (per-site permission, extension, low-power mode) refuses
		// one play ATTEMPT — the media is fine. Latching hasError would unmount
		// the <audio> element and destroy a mid-episode listener's position, so
		// the element must survive while the card explains the block.
		await withRejectingPlay(
			new DOMException('blocked by permission', 'NotAllowedError'),
			async () => {
				const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
				const audioBefore = container.querySelector('audio')!;
				audioBefore.currentTime = 2400; // 40 minutes in

				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText('Your browser blocked audio playback.')).toBeInTheDocument();

				// Same element instance, same position — the whole point.
				expect(container.querySelector('audio')).toBe(audioBefore);
				expect(container.querySelector('audio')!.currentTime).toBe(2400);
				// The listen link opens under a different top-level origin,
				// where a per-site block on the embedding page doesn't apply.
				expect(screen.getByRole('link', { name: /listen on show\.fm/i })).toBeInTheDocument();
				expect(screen.getByRole('status')).toHaveTextContent('Your browser blocked audio playback');
				expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
			}
		);
	});

	it('the blocked card REPLACES the player body rather than adding a row to it', async () => {
		// Height contract: the embed heights (300 standard / 110 compact) are
		// baked into host pages at copy-paste time, so they cannot be widened
		// retroactively. A blocked-state row rendered alongside the live player
		// measured 324/146px and clipped its own recovery link. The card is the
		// only height-safe surface (109px in every variant) BECAUSE it replaces
		// the body — if a body ever renders next to it, the heights break.
		await withRejectingPlay(
			new DOMException('blocked by permission', 'NotAllowedError'),
			async () => {
				const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText('Your browser blocked audio playback.')).toBeInTheDocument();
				expect(container.querySelector('.body-error')).toBeInTheDocument();
				expect(container.querySelector('.body-full')).toBeNull();
				expect(container.querySelector('.body-compact')).toBeNull();
			}
		);
	});

	it('Try again on a blocked card re-attempts play in place, resuming the same position', async () => {
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		const audioBefore = container.querySelector('audio')!;
		audioBefore.currentTime = 2400;

		await withRejectingPlay(
			new DOMException('blocked by permission', 'NotAllowedError'),
			async () => {
				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText('Your browser blocked audio playback.')).toBeInTheDocument();
			}
		);

		// Block lifted (the resolving stub is back): Try again must re-attempt
		// play() on the SAME element, not remount and restart from 0:00 the way
		// the error card's retry deliberately does.
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
		expect(container.querySelector('audio')).toBe(audioBefore);
		expect(container.querySelector('audio')!.currentTime).toBe(2400);
		expect(screen.queryByText('Your browser blocked audio playback.')).toBeNull();
	});

	it('a media error after a block shows the error card without stale blocked copy', async () => {
		// blocked and hasError are mutually exclusive: a real media failure
		// while the block shows must clear blockedMessage, or Try again would
		// restore the player with stale "browser blocked" copy.
		const NOTICE = 'Your browser blocked audio playback.';
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		await withRejectingPlay(
			new DOMException('blocked by permission', 'NotAllowedError'),
			async () => {
				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText(NOTICE)).toBeInTheDocument();
			}
		);
		await fireEvent(container.querySelector('audio')!, new Event('error'));
		expect(await screen.findByText(/can’t be played right now/)).toBeInTheDocument();
		expect(screen.queryByText(NOTICE)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
		expect(screen.queryByText(NOTICE)).toBeNull();
	});

	it('a genuine failure shows the error card, and Try again restores the player', async () => {
		await withRejectingPlay(
			new DOMException('no supported source', 'NotSupportedError'),
			async () => {
				render(PlayerCore, { props: { episode: makeEpisode() } });
				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText(/can’t be played right now/)).toBeInTheDocument();
				expect(screen.getByRole('link', { name: /listen on show\.fm/i })).toBeInTheDocument();
				await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
				expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
			}
		);
	});

	it('mute and playback rate survive the Try again remount', async () => {
		// The remount destroys the <audio> element; a fresh element defaults to
		// unmuted/1×. The declarative $effect must re-apply the toolbar state —
		// otherwise a muted embed blasts at full volume after a retry while the
		// control still reads "Unmute".
		await withRejectingPlay(
			new DOMException('no supported source', 'NotSupportedError'),
			async () => {
				const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
				await fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
				await fireEvent.click(
					screen.getByRole('button', { name: /playback speed, currently 1×/i })
				);
				expect(container.querySelector('audio')!.muted).toBe(true);
				expect(container.querySelector('audio')!.playbackRate).toBe(1.25);

				await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
				expect(await screen.findByText(/can’t be played right now/)).toBeInTheDocument();
				await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

				const remounted = container.querySelector('audio')!;
				expect(remounted.muted).toBe(true);
				expect(remounted.playbackRate).toBe(1.25);
				// The toolbar still reflects the same state it applied.
				expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
				expect(
					screen.getByRole('button', { name: /playback speed, currently 1.25×/i })
				).toBeInTheDocument();
			}
		);
	});

	it('moves focus to Try again when a swap destroys the pressed Play button', async () => {
		// Removing the focused element drops focus to the document, stranding a
		// keyboard user: the recovery path is neither announced nor reachable
		// without tabbing from the top. Focus must follow the swap. Both the
		// blocked and the error card destroy the pressed Play, so both move it.
		for (const error of [
			new DOMException('blocked', 'NotAllowedError'),
			new DOMException('no source', 'NotSupportedError')
		]) {
			await withRejectingPlay(error, async () => {
				const { unmount } = render(PlayerCore, { props: { episode: makeEpisode() } });
				const play = screen.getByRole('button', { name: 'Play' });
				play.focus();
				expect(document.activeElement).toBe(play);

				await fireEvent.click(play);
				const retry = await screen.findByRole('button', { name: 'Try again' });
				expect(document.activeElement).toBe(retry);
				unmount();
			});
		}
	});

	it('moves focus back to Play when Try again destroys the card', async () => {
		// The mirror case: dismissing the card removes the button the visitor
		// just pressed, so focus has to land on what replaced it.
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		await withRejectingPlay(new DOMException('no source', 'NotSupportedError'), async () => {
			await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		});
		const retry = await screen.findByRole('button', { name: 'Try again' });
		retry.focus();

		await fireEvent.click(retry);
		const play = await screen.findByRole('button', { name: 'Play' });
		expect(document.activeElement).toBe(play);
		// The detached retry button must not be what got focused: focusing a
		// removed node silently drops focus to the body, which looks identical
		// to doing nothing at all.
		expect(container.contains(document.activeElement)).toBe(true);
	});

	it('never steals focus on a background media error (no press behind it)', async () => {
		// onerror arrives on its own — a failed load, a dropped connection.
		// Moving focus here would yank it away from wherever the visitor
		// actually is on the host page.
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		outside.focus();

		await fireEvent(container.querySelector('audio')!, new Event('error'));
		expect(await screen.findByText(/can’t be played right now/)).toBeInTheDocument();
		expect(document.activeElement).toBe(outside);
		outside.remove();
	});

	it('never steals focus when a size change remounts the player after a plain play', async () => {
		// `size` is a live prop — the embed builder's Size select rebuilds the
		// standard↔compact branch while the visitor's focus is still in the
		// form. A successful play from the normal player swaps nothing, so it
		// must leave nothing armed; otherwise that later, unrelated remount
		// consumes the arm and drags focus into the preview.
		const { rerender } = render(PlayerCore, { props: { episode: makeEpisode() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();

		const outside = document.createElement('button');
		document.body.appendChild(outside);
		outside.focus();

		await rerender({ episode: makeEpisode(), size: 'compact' });
		expect(document.activeElement).toBe(outside);
		outside.remove();
	});

	it('never steals focus when a size change follows an interrupted play (AbortError)', async () => {
		const { rerender } = render(PlayerCore, { props: { episode: makeEpisode() } });
		await withRejectingPlay(new DOMException('interrupted', 'AbortError'), async () => {
			await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		});

		const outside = document.createElement('button');
		document.body.appendChild(outside);
		outside.focus();

		await rerender({ episode: makeEpisode(), size: 'compact' });
		expect(document.activeElement).toBe(outside);
		outside.remove();
	});

	it('never steals focus when the card renders on mount (no audio URL)', async () => {
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		outside.focus();

		render(PlayerCore, {
			props: {
				episode: makeEpisode({ audio: { url: null, content_type: null, duration_seconds: null } })
			}
		});
		expect(document.activeElement).toBe(outside);
		outside.remove();
	});

	it('the no-audio-URL error card offers no retry (nothing to remount)', () => {
		render(PlayerCore, {
			props: {
				episode: makeEpisode({ audio: { url: null, content_type: null, duration_seconds: null } })
			}
		});
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
	});
});

// Values the API must never be trusted with in an href or src.
const UNSAFE_URLS = [
	'javascript:alert(1)',
	' JavaScript:alert(1)',
	'data:text/html,<script>alert(1)</script>',
	'/relative/path',
	'//evil.example/x'
];

/** Every href and src in `root`, which must all be absolute http(s). */
function urlsIn(root: ParentNode) {
	return [...root.querySelectorAll('[href],[src]')].map(
		(element) => element.getAttribute('href') ?? element.getAttribute('src')
	);
}

describe('URLs from the API', () => {
	it.each(UNSAFE_URLS)('%s never reaches an href or src; the player still renders', (bad) => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({
					audio: { url: bad, content_type: 'audio/mpeg', duration_seconds: 1843 },
					artwork: { url: bad },
					links: { listen: bad }
				})
			}
		});
		for (const url of urlsIn(container)) expect(url).toMatch(/^https?:\/\//);
		expect(container.querySelector('img')).toBeNull();
		// There is no audio to play, so the card says so, with no link out.
		expect(screen.getByText('This episode can’t be played right now.')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /listen on show\.fm/i })).toBeNull();
	});

	it('a bad listen link alone leaves the title as text and the player playable', () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode({ links: { listen: 'javascript:alert(1)' } }) }
		});
		for (const url of urlsIn(container)) expect(url).toMatch(/^https?:\/\//);
		expect(screen.getByText('Episode One').closest('a')).not.toHaveAttribute('href');
		expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
		// Share needs the listen page, so it is not offered; Download needs only the audio.
		expect(screen.queryByRole('button', { name: 'Share episode' })).toBeNull();
		expect(container.querySelector('[part="share"]')).toBeNull();
		expect(screen.getByRole('link', { name: 'Download episode' })).toBeInTheDocument();
	});

	it('bad audio alone: no Download, and Share still offers the listen page', () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({
					audio: { url: 'javascript:alert(1)', content_type: 'audio/mpeg', duration_seconds: 1 }
				})
			}
		});
		expect(container.querySelector('[part="download"]')).toBeNull();
		expect(screen.getByRole('link', { name: /listen on show\.fm/i })).toHaveAttribute(
			'href',
			'https://listen.podcasterplus.com/test-signal/e/episode-one'
		);
	});

	it('valid https URLs still render', () => {
		const { container } = render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(screen.getByRole('button', { name: 'Share episode' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Download episode' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Episode One' })).toHaveAttribute(
			'href',
			'https://listen.podcasterplus.com/test-signal/e/episode-one'
		);
		expect(container.querySelector('img')).toHaveAttribute(
			'src',
			'https://media.podcasterplus.com/cover.jpg'
		);
		expect(container.querySelector('audio')!.getAttribute('src')).toMatch(
			/^https:\/\/media\.podcasterplus\.com\/audio\.mp3\?src=/
		);
	});
});

describe('download & share (redesign additions, full player only)', () => {
	it('renders a real attachment link: source-tagged URL + dl filename', () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		const download = screen.getByRole('link', { name: 'Download episode' });
		expect(download.getAttribute('href')).toBe(
			'https://media.podcasterplus.com/audio.mp3?src=embed&dl=episode-one.mp3'
		);
		expect(download.getAttribute('download')).toBe('episode-one.mp3');
	});

	it('hides download and share in the compact variant (per the design)', () => {
		render(PlayerCore, { props: { episode: makeEpisode(), size: 'compact' } });
		expect(screen.queryByRole('link', { name: 'Download episode' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Share episode' })).toBeNull();
	});

	it('share falls back to clipboard with a polite announcement when Web Share is absent', async () => {
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});
		render(PlayerCore, { props: { episode: makeEpisode() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Share episode' }));
		expect(writeText).toHaveBeenCalledWith(
			'https://listen.podcasterplus.com/test-signal/e/episode-one'
		);
		expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
	});

	it('share prefers navigator.share when available', async () => {
		const nativeShare = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
		render(PlayerCore, { props: { episode: makeEpisode() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Share episode' }));
		expect(nativeShare).toHaveBeenCalledWith({
			title: 'Episode One',
			text: 'Test Signal',
			url: 'https://listen.podcasterplus.com/test-signal/e/episode-one'
		});
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
	});

	it('share falls back to clipboard when the sheet is blocked (iframe without allow="web-share")', async () => {
		const nativeShare = vi.fn(async () => {
			throw new DOMException('permissions policy', 'NotAllowedError');
		});
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		render(PlayerCore, { props: { episode: makeEpisode() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Share episode' }));
		expect(writeText).toHaveBeenCalledWith(
			'https://listen.podcasterplus.com/test-signal/e/episode-one'
		);
		expect(await screen.findByRole('status')).toHaveTextContent('Link copied');
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
	});

	it('share stays quiet when the visitor dismisses the sheet (AbortError)', async () => {
		const nativeShare = vi.fn(async () => {
			throw new DOMException('dismissed', 'AbortError');
		});
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		render(PlayerCore, { props: { episode: makeEpisode() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Share episode' }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(writeText).not.toHaveBeenCalled();
		expect(screen.getByRole('status')).toHaveTextContent('');
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
	});
});

describe('accent resolution', () => {
	function playerStyle(container: HTMLElement): string {
		return container.querySelector('.player')?.getAttribute('style') ?? '';
	}

	it("the show's player_color wins over legacy brand_color", () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({
					podcast: {
						title: 'Test Signal',
						brand_color: '#1d4ed8',
						player_color: '#0e8f7e',
						branding: { show_powered_by: true }
					}
				})
			}
		});
		expect(playerStyle(container)).toContain('--pp-accent: #0e8f7e');
	});

	it('an explicit accent prop wins over the payload colors', () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({
					podcast: {
						title: 'Test Signal',
						brand_color: '#1d4ed8',
						player_color: '#0e8f7e',
						branding: { show_powered_by: true }
					}
				}),
				accent: '#b91c1c'
			}
		});
		expect(playerStyle(container)).toContain('--pp-accent: #b91c1c');
	});

	it('the powered-by wordmark keeps the brand purple regardless of accent', () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), accent: '#b91c1c' }
		});
		expect(playerStyle(container)).toContain('--pp-logo: #7E22CE');
	});
});

describe('branding rule', () => {
	it('shows Powered by show.fm when show_powered_by is true', () => {
		render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(screen.getByRole('link', { name: /powered by show\.fm/i })).toBeInTheDocument();
	});

	it('hides the footer when branding removal is resolved server-side', () => {
		render(PlayerCore, {
			props: {
				episode: makeEpisode({
					podcast: { title: 'Test Signal', brand_color: null, branding: { show_powered_by: false } }
				})
			}
		});
		expect(screen.queryByRole('link', { name: /powered by show\.fm/i })).toBeNull();
	});
});
