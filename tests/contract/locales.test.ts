/**
 * dist/cdn/v1.js carries English only. An element whose language resolves
 * to German or French makes it add dist/cdn/locales/{lang}.js from next to
 * itself, once, and re-render in that language. An English page adds nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dist = (file: string) => readFileSync(resolve(__dirname, '../../dist/cdn', file), 'utf-8');
const V1 = dist('v1.js');
const EPISODE_ID = '11111111-2222-4333-8444-555555555555';
const settle = async () => {
	for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
const localeScripts = () =>
	[...document.head.querySelectorAll('script[src*="/locales/"]')] as HTMLScriptElement[];

beforeAll(() => {
	vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })));
	// Run v1.js as the CDN serves it: as the current script, from its URL.
	const self = Object.assign(document.createElement('script'), {
		src: 'https://embed.cdn.media/player/v1.js'
	});
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => self });
	(0, eval)(V1);
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
});

// Elements left on the page would tear down after jsdom does.
afterAll(async () => {
	document.body.innerHTML = '';
	await settle();
	vi.unstubAllGlobals();
});

function mount(lang?: string) {
	const element = document.createElement('showfm-player');
	element.setAttribute('episode', EPISODE_ID);
	if (lang) element.setAttribute('lang', lang);
	document.body.append(element);
	return element;
}
const message = (element: HTMLElement) =>
	element.shadowRoot!.querySelector('.fallback p')?.textContent?.trim();

describe('locale chunks', () => {
	it('v1.js carries no German or French strings', () => {
		expect(V1).not.toContain('Diese Folge ist gerade nicht abspielbar.');
		expect(V1).not.toContain('Lecture impossible pour le moment.');
		expect(dist('locales/de.js')).toContain('Diese Folge ist gerade nicht abspielbar.');
		expect(dist('locales/fr.js')).toContain('Lecture impossible pour le moment.');
	});

	it('an English page loads no locale', async () => {
		const element = mount();
		await settle();
		expect(message(element)).toBe('This episode can’t be played right now.');
		expect(localeScripts()).toHaveLength(0);
	});

	it('lang="de" paints in English, adds de.js once, then speaks German', async () => {
		const first = mount('de');
		const second = mount('de-AT');
		await settle();
		expect(message(first)).toBe('This episode can’t be played right now.');
		expect(localeScripts().map((s) => s.src)).toEqual([
			'https://embed.cdn.media/player/locales/de.js'
		]);
		// The chunk arrives.
		(0, eval)(dist('locales/de.js'));
		localeScripts()[0].dispatchEvent(new Event('load'));
		await settle();
		expect(message(first)).toBe('Diese Folge ist gerade nicht abspielbar.');
		expect(message(second)).toBe('Diese Folge ist gerade nicht abspielbar.');
		// Later German elements use the registered table at once.
		const later = mount('de');
		await settle();
		expect(message(later)).toBe('Diese Folge ist gerade nicht abspielbar.');
		expect(localeScripts()).toHaveLength(1);
	});

	it('stays English if the chunk fails to load', async () => {
		const element = mount('fr');
		await settle();
		const [script] = localeScripts().filter((s) => s.src.endsWith('/fr.js'));
		script.dispatchEvent(new Event('error'));
		await settle();
		expect(message(element)).toBe('This episode can’t be played right now.');
	});
});
