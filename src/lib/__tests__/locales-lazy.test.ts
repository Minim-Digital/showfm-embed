/**
 * The CDN build's locale loader: German and French come as a chunk from
 * next to v1.js, once per page, and a failed load stays English.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = Symbol.for('showfm.locales.v1');
type Registry = Record<symbol, Record<string, unknown> | undefined>;

async function lazyFrom(src: string | null) {
	const script = src ? Object.assign(document.createElement('script'), { src }) : null;
	Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script });
	vi.resetModules();
	return import('../locales/lazy');
}

const added = () => [...document.head.querySelectorAll('script')] as HTMLScriptElement[];

afterEach(() => {
	document.head.innerHTML = '';
	delete (globalThis as unknown as Registry)[KEY];
});

describe('loadLocale (CDN build)', () => {
	it('bundles nothing and needs nothing for English', async () => {
		const { BUNDLED_LOCALES, loadLocale } = await lazyFrom('https://embed.cdn.media/player/v1.js');
		expect(BUNDLED_LOCALES).toEqual({});
		expect(await loadLocale('en')).toBe(true);
		expect(added()).toHaveLength(0);
	});

	it('adds locales/{lang}.js next to v1.js once, and resolves when it registers', async () => {
		const { loadLocale } = await lazyFrom('https://embed.cdn.media/player/v1.js?v=1');
		const first = loadLocale('de');
		const second = loadLocale('de');
		expect(added().map((s) => s.src)).toEqual(['https://embed.cdn.media/player/locales/de.js']);
		((globalThis as unknown as Registry)[KEY] ??= {}).de = { play: 'Abspielen' };
		added()[0].dispatchEvent(new Event('load'));
		expect(await first).toBe(true);
		expect(await second).toBe(true);
		expect(await loadLocale('de')).toBe(true);
		expect(added()).toHaveLength(1);
	});

	it('stays English when the chunk fails, and tries again next time', async () => {
		const { loadLocale } = await lazyFrom('https://site.example/plugins/showfm/v1.js');
		const failing = loadLocale('fr');
		added()[0].dispatchEvent(new Event('error'));
		expect(await failing).toBe(false);
		expect(added()).toHaveLength(0);
		void loadLocale('fr');
		expect(added().map((s) => s.src)).toEqual([
			'https://site.example/plugins/showfm/locales/fr.js'
		]);
	});

	it('requests nothing without a script URL (the ESM root registers its locales)', async () => {
		const { loadLocale } = await lazyFrom(null);
		expect(await loadLocale('de')).toBe(false);
		expect(added()).toHaveLength(0);
	});
});
