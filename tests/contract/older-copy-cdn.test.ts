/**
 * A page can already hold an older copy of the elements, such as a second
 * CDN script from before <showfm-episodes>. v1.js keeps that copy's player
 * and still adds the elements the copy lacks.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('v1.js adds <showfm-episodes> next to an older player, without redefining it', () => {
	class OlderPlayer extends HTMLElement {}
	class OlderAlias extends OlderPlayer {}
	customElements.define('showfm-player', OlderPlayer);
	customElements.define('podcasterplus-player', OlderAlias);

	(0, eval)(readFileSync(resolve(__dirname, '../../dist/cdn/v1.js'), 'utf-8'));

	expect(customElements.get('showfm-player')).toBe(OlderPlayer);
	expect(customElements.get('podcasterplus-player')).toBe(OlderAlias);
	expect(customElements.get('showfm-episodes')).toBeDefined();
});
