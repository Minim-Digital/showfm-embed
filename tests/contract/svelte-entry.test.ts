/**
 * The Svelte entry (`@showfm/embed/svelte`, dist/svelte): a Svelte app can
 * render PlayerCore from the shipped source, and importing it registers no
 * custom element.
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { episodePayload } from '../fixtures/episode';
import { TRANSCRIPT_VTT, conversationVtt, transcriptEpisode } from '../fixtures/transcript';

// Typed from the source entry; loaded from the build (see esm.test.ts).
let entry: typeof import('../../src/lib/index');
const BUILT_ENTRY = '../../dist/svelte/index.js';

beforeAll(async () => {
	entry = await import(/* @vite-ignore */ BUILT_ENTRY);
});

describe('@showfm/embed/svelte', () => {
	it('renders PlayerCore from the shipped source', () => {
		render(entry.PlayerCore, { props: { episode: episodePayload(), sourceTag: 'listen' } });
		expect(screen.getByRole('group', { name: 'Audio player: Episode One' })).toBeInTheDocument();
		expect(document.querySelector('audio')?.getAttribute('src')).toBe(
			'https://media.example.test/audio.mp3?src=listen'
		);
	});

	it('opens the transcript inside PlayerCore with transcript="on", no custom element needed', async () => {
		const requests: string[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
			requests.push(String(input));
			return new Response(conversationVtt().vtt);
		});
		HTMLCanvasElement.prototype.getContext = (() =>
			null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
		const { container } = render(entry.PlayerCore, {
			props: { episode: transcriptEpisode(), transcript: 'on' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Transcript' }));
		const panel = container.querySelector('.tr')!;
		await vi.waitFor(
			() => expect(panel.shadowRoot?.querySelectorAll('.line').length).toBeGreaterThan(5),
			{ timeout: 10_000 }
		);
		// The VTT only: the player already has the episode.
		expect(requests).toEqual([TRANSCRIPT_VTT]);
		expect(customElements.get('showfm-transcript')).toBeUndefined();
		vi.unstubAllGlobals();
	});

	it('registers no custom element', () => {
		expect(customElements.get('showfm-player')).toBeUndefined();
		expect(customElements.get('podcasterplus-player')).toBeUndefined();
		expect(customElements.get('showfm-transcript')).toBeUndefined();
	});

	it('exports the same constants as the root entry', () => {
		expect(entry.PLAYER_MIN_HEIGHTS.standard.branded).toBe(291);
		expect(entry.IFRAME_HEIGHTS.compact).toBe(110);
	});
});
