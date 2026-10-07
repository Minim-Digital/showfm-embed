// @vitest-environment node
/**
 * Both entries import in plain Node, where there is no DOM: no
 * customElements, no HTMLElement, no window. SSR frameworks and workers
 * import the package root for its constants, so it must not throw there.
 *
 * Each import runs in a fresh `node` process that resolves the package by
 * name through its own exports map, as a consumer's Node would.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function importInNode(specifier: string) {
	const script = `
		const entry = await import(${JSON.stringify(specifier)});
		console.log(JSON.stringify({
			dom: typeof customElements !== 'undefined' || typeof HTMLElement !== 'undefined' || typeof window !== 'undefined',
			exports: Object.keys(entry).sort(),
			heights: entry.PLAYER_MIN_HEIGHTS,
			iframe: entry.IFRAME_HEIGHTS,
			api: entry.PLAYER_DEFAULT_API_URL,
			darkBg: entry.resolvePalette('#7E22CE', 'dark').bg,
			ratio: entry.contrastRatio('#000000', '#ffffff')
		}));
	`;
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
		cwd: ROOT,
		encoding: 'utf-8'
	});
	return JSON.parse(output);
}

describe.each(['@showfm/embed', '@showfm/embed/server'])('%s in plain Node', (specifier) => {
	it('imports without DOM globals and exposes the pure modules', () => {
		const result = importInNode(specifier);
		expect(result.dom).toBe(false);
		expect(result.heights).toEqual({
			standard: { branded: 291, unbranded: 252 },
			compact: { branded: 101, unbranded: 83 }
		});
		expect(result.iframe).toEqual({ standard: 300, compact: 110 });
		expect(result.api).toBe('https://api.show.fm');
		expect(result.darkBg).toBe('#17151f');
		expect(result.ratio).toBeCloseTo(21, 0);
	});
});

it('the root and server entries export the same names', () => {
	expect(importInNode('@showfm/embed').exports).toEqual(
		importInNode('@showfm/embed/server').exports
	);
});
