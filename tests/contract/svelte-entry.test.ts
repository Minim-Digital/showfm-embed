/**
 * The Svelte entry (`@showfm/embed/svelte`, dist/svelte): a Svelte app can
 * render PlayerCore from the shipped source, and importing it registers no
 * custom element.
 */
import { render, screen } from '@testing-library/svelte';
import { beforeAll, describe, expect, it } from 'vitest';
import { episodePayload } from '../fixtures/episode';

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

	it('registers no custom element', () => {
		expect(customElements.get('showfm-player')).toBeUndefined();
		expect(customElements.get('podcasterplus-player')).toBeUndefined();
	});

	it('exports the same constants as the root entry', () => {
		expect(entry.PLAYER_MIN_HEIGHTS.standard.branded).toBe(291);
		expect(entry.IFRAME_HEIGHTS.compact).toBe(110);
	});
});
