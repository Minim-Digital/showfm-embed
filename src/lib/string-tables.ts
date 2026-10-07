/**
 * Every string table, for the npm entries, tests and tools such as the
 * WordPress plugin's .pot generation: the player's strings and the episode
 * list's, per language. The CDN script does not import this.
 */
import { EN, type Language, type Strings } from './strings.js';
import {
	LIST_EN,
	LIST_FACADE_EN,
	type ListFacadeStrings,
	type ListStrings
} from './list-strings.js';
import de from './locales/de.js';
import fr from './locales/fr.js';

export const STRING_TABLES: Readonly<Record<Language, Strings & ListStrings & ListFacadeStrings>> =
	{
		en: { ...EN, ...LIST_EN, ...LIST_FACADE_EN },
		de,
		fr
	};
