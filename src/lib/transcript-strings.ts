/**
 * The transcript's strings (design page 3, "Follow-along transcript" and
 * "Transcript states"). English is here, in the transcript's own chunk, so
 * v1.js does not carry it; German and French are in locales/de.ts and
 * locales/fr.ts with the player's, so the CDN build loads them with the same
 * locale chunk. The transcript also uses the player's shared strings
 * (`transcript`, `suspended`, `retry`).
 *
 * The rules are the player's (strings.ts): `{name}` placeholders, and
 * `window.showfmStrings` or `element.strings` override any key.
 *
 * Pure: no DOM work at import time.
 */

export const TRANSCRIPT_EN = {
	/** The scrolling text's accessible name. */
	transcriptText: 'Transcript text',
	searchTranscript: 'Search transcript',
	/** "3 of 12": the search match the visitor is on. */
	matchCount: '{n} of {total}',
	noMatches: 'No matches',
	previousMatch: 'Previous match',
	nextMatch: 'Next match',
	clearSearch: 'Clear search',
	/** The skeleton's accessible name. */
	loadingTranscript: 'Loading transcript',
	/** The VTT could not load. Playback is not affected (80 max, it wraps). */
	transcriptError: 'The transcript can’t be loaded right now. The episode keeps playing.',
	/** Following the page and nothing has played yet. */
	transcriptIdle: 'Play an episode to follow its transcript here.',
	/** Following the page, and the episode playing has no transcript. */
	transcriptNone: 'There’s no transcript for this episode.',
	/** A line's timestamp button: "Jump to 14 minutes 2 seconds, Tom". */
	jumpTo: 'Jump to {time}, {speaker}',
	jumpToTime: 'Jump to {time}',
	/** Shown when the visitor scrolls away from the line being spoken (30 max, time included). */
	backToNow: 'Back to now · {time}'
};

export type TranscriptStrings = typeof TRANSCRIPT_EN;
export type TranscriptStringKey = keyof TranscriptStrings;

/** The longest each string may be, in characters, with placeholders filled. */
export const TRANSCRIPT_STRING_MAX_LENGTHS: Readonly<Partial<Record<TranscriptStringKey, number>>> =
	{
		transcriptError: 80,
		transcriptIdle: 60,
		transcriptNone: 60,
		searchTranscript: 34,
		noMatches: 16,
		backToNow: 30
	};
