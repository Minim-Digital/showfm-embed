/**
 * Types for the custom elements as a host page sees them: the attributes an
 * author can write and the element instance (`document.querySelector`).
 * The JSX typings in src/jsx/ build on these.
 */

import type { StringKey } from './strings.js';

/** Attributes of <showfm-player> (and its alias <podcasterplus-player>). */
export interface ShowfmPlayerAttributes {
	/** Episode UUID. Plays that one episode and wins over `podcast`. */
	episode?: string;
	/** Podcast slug or UUID. Plays the latest released episode. */
	podcast?: string;
	/** Pins the theme. Absent follows the show's player theme setting. */
	theme?: 'auto' | 'light' | 'dark';
	/** Player size. Absent is `standard`. */
	size?: 'standard' | 'compact';
	/** Accent colour as a hex value. Absent follows the show's player colour. */
	accent?: string;
	/** Pins the waveform on or off. Absent follows the show's setting. */
	wave?: 'true' | 'false' | boolean;
	/** API origin override, for development and testing only. */
	api?: string;
	/** Wraps the title in a heading of this level. Absent emits no heading. */
	'heading-level'?: '2' | '3' | '4' | '5' | '6' | 2 | 3 | 4 | 5 | 6;
	/** "Powered by show.fm": `auto` (the default) follows the show's plan. Once per page. */
	credit?: 'auto' | 'on' | 'off';
	/** `click`: draw a facade and request nothing until it is pressed. */
	load?: 'click';
	/** The element's language for its strings. Absent follows `<html lang>`. */
	lang?: string;
}

/** A <showfm-player> element. Each attribute is also a property. */
export interface ShowfmPlayerElement extends HTMLElement {
	episode: string;
	podcast: string;
	theme: string;
	size: 'standard' | 'compact';
	accent: string;
	wave: string | boolean;
	api: string;
	headingLevel: string | number;
	credit: 'auto' | 'on' | 'off' | string;
	load: string;
	/** Overrides for visible strings, by key (see the README). */
	strings: Partial<Record<StringKey, string>> | undefined;
}

declare global {
	interface HTMLElementTagNameMap {
		'showfm-player': ShowfmPlayerElement;
		'podcasterplus-player': ShowfmPlayerElement;
	}
}
