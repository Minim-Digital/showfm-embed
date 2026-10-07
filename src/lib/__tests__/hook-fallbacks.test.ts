/**
 * Every place a `--showfm-*` hook is read gives a fallback, so an unset hook
 * never leaves a declaration to the browser's own rules: the elements' CSS,
 * the click loader and the fallback stylesheet.
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sources = [
	...readdirSync('src/lib')
		.filter((file) => /\.(css|svelte|ts)$/.test(file))
		.map((file) => `src/lib/${file}`),
	'src/cdn/click-loader.ts',
	'src/cdn/v1-fallback.css'
];

describe('hook fallbacks', () => {
	it.each(sources)('%s reads every hook with a fallback', (file) => {
		const source = readFileSync(file, 'utf-8');
		const bare = [...source.matchAll(/var\(\s*(--showfm-[a-z-]+)\s*\)/g)].map((m) => m[0]);
		expect(bare).toEqual([]);
	});

	it('reads hooks somewhere, so the scan sees them', () => {
		const all = sources.map((file) => readFileSync(file, 'utf-8')).join('\n');
		expect(all.match(/var\(--showfm-[a-z-]+,/g)!.length).toBeGreaterThan(15);
	});
});
