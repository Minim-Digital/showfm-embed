/**
 * Every string table, for the npm entries, tests and tools such as the
 * WordPress plugin's .pot generation: the player's strings, the episode
 * list's, the play button's and mini-player's, and the transcript's, per
 * language. The CDN script does not import this.
 */
import { EN, type Language, type Strings } from './strings.js';
import {
	LIST_EN,
	LIST_FACADE_EN,
	type ListFacadeStrings,
	type ListStrings
} from './list-strings.js';
import {
	PLAY_BUILDER_EN,
	PLAY_EN,
	type PlayBuilderStrings,
	type PlayStrings
} from './play-strings.js';
import { TRANSCRIPT_EN, type TranscriptStrings } from './transcript-strings.js';
import de from './locales/de.js';
import fr from './locales/fr.js';

export const STRING_TABLES: Readonly<
	Record<
		Language,
		Strings & ListStrings & ListFacadeStrings & PlayStrings & PlayBuilderStrings & TranscriptStrings
	>
> = {
	en: { ...EN, ...LIST_EN, ...LIST_FACADE_EN, ...PLAY_EN, ...PLAY_BUILDER_EN, ...TRANSCRIPT_EN },
	de,
	fr
};
