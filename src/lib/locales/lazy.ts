/**
 * The CDN script's locales: none bundled. When an element's language
 * resolves to German or French, `loadLocale` adds `locales/{lang}.js` from
 * next to the running v1.js, once per page. That chunk registers its table
 * under Symbol.for('showfm.locales.v1') (see strings.ts), and the elements
 * re-render in that language. English needs nothing, so it paints at once.
 *
 * vite.cdn.config.ts swaps locales/index.ts for this file.
 */
import type { Language, Strings } from '../strings.js';

export const BUNDLED_LOCALES: Partial<Record<Language, Strings>> = {};

const KEY = Symbol.for('showfm.locales.v1');

// The script's own URL, read while it runs: classic scripts only expose it
// then. A copy without one (the ESM root) has its locales registered.
const base =
	typeof document !== 'undefined'
		? (document.currentScript as HTMLScriptElement | null)?.src || null
		: null;

const pending: Partial<Record<Language, Promise<boolean>>> = {};

const registered = (language: Language) =>
	!!(globalThis as unknown as Record<symbol, Record<string, unknown> | undefined>)[KEY]?.[language];

/** Resolves true once the language's table is registered, false if it cannot be. */
export function loadLocale(language: Language): Promise<boolean> {
	if (language === 'en' || registered(language)) return Promise.resolve(true);
	if (!base) return Promise.resolve(false);
	return (pending[language] ??= new Promise<boolean>((resolve) => {
		const script = document.createElement('script');
		script.src = new URL(`locales/${language}.js`, base).href;
		script.async = true;
		script.onload = () => resolve(registered(language));
		script.onerror = () => {
			// A failed load stays English; the next element may try again.
			delete pending[language];
			script.remove();
			resolve(false);
		};
		document.head.append(script);
	}));
}
