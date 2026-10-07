import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-contract tripwire for the embed bundle entry.
 *
 * The bundle entry cannot be imported here: the unit tests compile Svelte
 * without `customElement: true`, so `ShowfmPlayer.element` only exists in the
 * real player build (vite.cdn.config.ts; tests/contract checks the built
 * file). What this guards is the
 * contract itself: <podcasterplus-player> is the pre-rebrand element name and
 * embed snippets carrying it are pasted into pages we cannot edit, so the
 * legacy registration must never be dropped from the entry again (it was,
 * in the Epic 16 rename, and every pre-flip embed rendered only its
 * fallback link until 2026-08-28).
 */
describe('embed player element entry', () => {
	const source = readFileSync(resolve(__dirname, '../element.ts'), 'utf-8');

	it('registers the current element via the ShowfmPlayer import', () => {
		expect(source).toContain("import ShowfmPlayer from './ShowfmPlayer.svelte'");
	});

	it('keeps the pre-rebrand <podcasterplus-player> tag registered as an alias', () => {
		expect(source).toContain("customElements.define('podcasterplus-player'");
	});
});
