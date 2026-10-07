/**
 * Every string table, for the npm entries, tests and tools such as the
 * WordPress plugin's .pot generation. The CDN script does not import this.
 */
import { EN, type Language, type Strings } from './strings.js';
import de from './locales/de.js';
import fr from './locales/fr.js';

export const STRING_TABLES: Readonly<Record<Language, Strings>> = { en: EN, de, fr };
