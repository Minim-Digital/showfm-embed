/**
 * Importing the package root on a page that already holds an older copy of
 * the elements (one from before <showfm-episodes>) keeps that copy's player
 * and still adds the elements the copy lacks.
 */
import { expect, it } from 'vitest';

it('the root adds <showfm-episodes> next to an older player, without redefining it', async () => {
	class OlderPlayer extends HTMLElement {}
	class OlderAlias extends OlderPlayer {}
	customElements.define('showfm-player', OlderPlayer);
	customElements.define('podcasterplus-player', OlderAlias);

	const entry = await import(/* @vite-ignore */ '../../dist/index.js' as string);

	expect(entry.PLAYER_MIN_HEIGHTS.standard.branded).toBe(291);
	expect(customElements.get('showfm-player')).toBe(OlderPlayer);
	expect(customElements.get('podcasterplus-player')).toBe(OlderAlias);
	expect(customElements.get('showfm-episodes')).toBeDefined();
});
