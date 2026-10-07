/**
 * The locales the npm entries bundle. The CDN build swaps this module for
 * lazy.ts (vite.cdn.config.ts), which bundles none and loads them on demand.
 */
import type { Language, Strings } from '../strings.js';
import de from './de.js';
import fr from './fr.js';

export const BUNDLED_LOCALES: Partial<Record<Language, Strings>> = { de, fr };

/** Every locale is already here. Resolves true when the table is available. */
export function loadLocale(language: Language): Promise<boolean> {
	return Promise.resolve(language === 'en' || language in BUNDLED_LOCALES);
}
