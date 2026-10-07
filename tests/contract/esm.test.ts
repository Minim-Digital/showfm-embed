/**
 * The ESM entry (`@showfm/embed`, dist/index.js): importing it registers the
 * same two elements as v1.js and exposes the pure modules and constants.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Typed from the source entry; loaded from the build. The specifier is a
// variable so type-checking does not need dist/ to exist.
let entry: typeof import('../../src/server');
const BUILT_ENTRY = '../../dist/index.js';

beforeAll(async () => {
	entry = await import(/* @vite-ignore */ BUILT_ENTRY);
});

describe('@showfm/embed ESM entry', () => {
	it('registers <showfm-player> and the <podcasterplus-player> alias on import', () => {
		expect(customElements.get('showfm-player')).toBeDefined();
		expect(Object.getPrototypeOf(customElements.get('podcasterplus-player'))).toBe(
			customElements.get('showfm-player')
		);
	});

	it('exports the height contract', () => {
		expect(entry.PLAYER_MIN_HEIGHTS).toEqual({
			standard: { branded: 291, unbranded: 252 },
			compact: { branded: 101, unbranded: 83 }
		});
		expect(entry.IFRAME_HEIGHTS).toEqual({ standard: 300, compact: 110 });
	});

	it('carries dist/cdn/v1.js verbatim, so the root and the CDN run one build', () => {
		const root = readFileSync(resolve(__dirname, '../../dist/index.js'), 'utf-8');
		const v1 = readFileSync(resolve(__dirname, '../../dist/cdn/v1.js'), 'utf-8');
		expect(root).toContain(v1.trimEnd());
	});

	it('exports the pure modules', () => {
		expect(entry.PLAYER_DEFAULT_API_URL).toBe('https://api.show.fm');
		expect(entry.MARKETING_APEX_URL).toBe('https://show.fm');
		expect(entry.resolvePalette('#7E22CE', 'dark').bg).toBe('#17151f');
		expect(entry.downloadFilename('Episode One', 'audio/mpeg')).toBe('episode-one.mp3');
		expect(entry.genPeaks('seed')).toHaveLength(220);
	});

	it('bundles German and French: no locale chunk is needed', async () => {
		vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })));
		const element = document.createElement('showfm-player');
		element.setAttribute('episode', '11111111-2222-4333-8444-555555555555');
		element.setAttribute('lang', 'fr');
		document.body.append(element);
		for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
		expect(element.shadowRoot!.querySelector('.fallback p')?.textContent?.trim()).toBe(
			'Lecture impossible pour le moment.'
		);
		expect(document.querySelector('script[src]')).toBeNull();
		element.remove();
		for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
		vi.unstubAllGlobals();
	});
});
