/**
 * Host fonts for the browser tests. The elements take the page's font (or
 * --showfm-font), so the height contract and the layouts are checked with
 * fonts at the extremes. Each is OFL and comes from devDependencies; the
 * tests serve the files, so nothing is fetched.
 *
 * - system: the platform's UI font (system-ui), no file.
 * - geist: the design's font, and the iframe pages'.
 * - merriweather: a wide serif with tall line metrics.
 * - oswald: a narrow sans, also tall.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const FILES = {
	geist: { family: 'Geist', package: 'geist-sans' },
	merriweather: { family: 'Merriweather', package: 'merriweather' },
	oswald: { family: 'Oswald', package: 'oswald' }
} as const;

export type HostFont = 'system' | keyof typeof FILES;
export const HOST_FONTS: HostFont[] = ['system', 'geist', 'merriweather', 'oswald'];

const WEIGHTS = [400, 500, 600, 700];

/** The CSS font-family value for a host font, as computed styles give it. */
export function family(font: HostFont): string {
	return font === 'system' ? 'system-ui, sans-serif' : FILES[font].family;
}

/** @font-face rules for a host font, served from /fonts/ on the test page. */
export function fontFaces(font: HostFont): string {
	if (font === 'system') return '';
	const { family: name, package: pkg } = FILES[font];
	return WEIGHTS.map(
		(weight) =>
			`@font-face{font-family:'${name}';font-weight:${weight};src:url(/fonts/${pkg}-${weight}.woff2)}`
	).join('');
}

/** The file for a /fonts/ path on the test page, or null. */
export function fontFile(path: string): Buffer | null {
	const match = /^\/fonts\/([a-z-]+)-(\d+)\.woff2$/.exec(path);
	if (!match || !Object.values(FILES).some((file) => file.package === match[1])) return null;
	return readFileSync(
		fileURLToPath(
			new URL(
				`../../node_modules/@fontsource/${match[1]}/files/${match[1]}-latin-${match[2]}-normal.woff2`,
				import.meta.url
			)
		)
	);
}

/** Head markup that makes `font` the page's font. */
export function hostFontHead(font: HostFont): string {
	return `<style>${fontFaces(font)}body{font-family:${family(font)}}</style>`;
}

/** Loads every weight of the page's font, and fails if it did not load. */
export async function fontsLoaded(page: Page, font: HostFont) {
	if (font === 'system') return true;
	const name = FILES[font].family;
	return page.evaluate(
		async ({ name, weights }) => {
			await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 16px '${name}'`)));
			await document.fonts.ready;
			return weights.every((weight) => document.fonts.check(`${weight} 16px '${name}'`));
		},
		{ name, weights: WEIGHTS }
	);
}
