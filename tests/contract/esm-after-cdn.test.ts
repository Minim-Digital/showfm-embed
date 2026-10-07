/**
 * A page that loads the CDN script and also imports the package root must
 * not fail: the root registers only when the elements are not there yet.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('importing the root after v1.js has run does not register twice', async () => {
	(0, eval)(readFileSync(resolve(__dirname, '../../dist/cdn/v1.js'), 'utf-8'));
	const before = customElements.get('showfm-player');
	expect(before).toBeDefined();
	const entry = await import(/* @vite-ignore */ '../../dist/index.js' as string);
	expect(entry.PLAYER_MIN_HEIGHTS.standard.branded).toBe(291);
	expect(customElements.get('showfm-player')).toBe(before);
});
