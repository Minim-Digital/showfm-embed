/**
 * Types for the custom elements as a host page sees them: the attributes an
 * author can write and the element instance (`document.querySelector`).
 * The JSX typings in src/jsx/ build on these.
 */

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
}

declare global {
	interface HTMLElementTagNameMap {
		'showfm-player': ShowfmPlayerElement;
		'podcasterplus-player': ShowfmPlayerElement;
	}
}
