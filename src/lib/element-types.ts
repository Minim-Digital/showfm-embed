/**
 * Types for the custom elements as a host page sees them: the attributes an
 * author can write and the element instance (`document.querySelector`).
 * The JSX typings in src/jsx/ build on these.
 */

import type { ListStringKey } from './list-strings.js';
import type { PlayStringKey } from './play-strings.js';
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

/** Attributes of <showfm-episodes>. */
export interface ShowfmEpisodesAttributes {
	/** Podcast UUID (preferred, it survives a slug change) or slug. */
	podcast?: string;
	/** `card` (the default) or `minimal`. */
	variant?: 'card' | 'minimal';
	/**
	 * `auto` (the default) is a grid from 900px wide (for Card, when at least
	 * half the episodes have their own artwork), else a list. A grid under
	 * 480px wide shows as a list.
	 */
	layout?: 'auto' | 'list' | 'grid' | 'compact';
	/** Episodes per page, 1 to 50. Absent is 10. "Load more" fetches the next page. */
	count?: string | number;
	/** Only this season. */
	season?: string | number;
	/** Episode types to leave out: `trailer`, `bonus` or both, comma separated. */
	hide?: string;
	/** Episode descriptions. Absent is `on`. */
	descriptions?: 'on' | 'off';
	/** `on`: playing a row opens the page's mini-player. Absent is `off`. */
	'mini-player'?: 'on' | 'off';
	/** The corner the collapsed mini-player sits in. Absent is `right`. */
	'mini-player-position'?: 'left' | 'right';
	/** Wraps each episode title in a heading of this level. Absent emits no headings. */
	'heading-level'?: '2' | '3' | '4' | '5' | '6' | 2 | 3 | 4 | 5 | 6;
	/** "Powered by show.fm": `auto` (the default) follows the show's plan. Once per page. */
	credit?: 'auto' | 'on' | 'off';
	/** `click`: request nothing, not even the list's code, until the facade is pressed. */
	load?: 'click';
	/** Pins the theme. Absent follows the show's player theme setting. */
	theme?: 'auto' | 'light' | 'dark';
	/** Accent colour as a hex value. Absent follows the show's player colour. */
	accent?: string;
	/** API origin override, for development and testing only. */
	api?: string;
	/** The element's language for its strings. Absent follows `<html lang>`. */
	lang?: string;
}

/** A <showfm-episodes> element. Its attributes are read live. */
export interface ShowfmEpisodesElement extends HTMLElement {
	/** Overrides for visible strings, by key (see the README). */
	strings: Partial<Record<StringKey | ListStringKey, string>> | undefined;
}

/** Attributes of <showfm-play>. */
export interface ShowfmPlayAttributes {
	/** Episode UUID. Plays that one episode and wins over `podcast`. */
	episode?: string;
	/** Podcast slug or UUID. Plays the latest released episode. */
	podcast?: string;
	/** `icon` (a round button), `label` (the default, icon and text) or `link` (text in a sentence). */
	variant?: 'icon' | 'label' | 'link';
	/** `sm` (the default, a 40px line) or `lg`. The link ignores it. */
	size?: 'sm' | 'lg';
	/**
	 * `on` (the default): the first play opens the page's mini-player, with
	 * seek, skip, speed and the time left. `off`: visitors can only play and pause.
	 */
	'mini-player'?: 'on' | 'off';
	/** The corner the collapsed mini-player sits in. Absent is `right`. */
	'mini-player-position'?: 'left' | 'right';
	/** "Powered by show.fm" in the mini-player: `auto` (the default) follows the show's plan. Once per page. */
	credit?: 'auto' | 'on' | 'off';
	/** `click`: request nothing, not even the button's code, until the facade is pressed. */
	load?: 'click';
	/** Pins the theme. Absent follows the show's player theme setting. */
	theme?: 'auto' | 'light' | 'dark';
	/** Accent colour as a hex value. Absent follows the show's player colour. */
	accent?: string;
	/** API origin override, for development and testing only. */
	api?: string;
	/** The element's language for its strings. Absent follows `<html lang>`. */
	lang?: string;
}

/** A <showfm-play> element. Its attributes are read live. */
export interface ShowfmPlayElement extends HTMLElement {
	/** Overrides for visible strings, by key (see the README). */
	strings: Partial<Record<StringKey | PlayStringKey, string>> | undefined;
}

declare global {
	interface HTMLElementTagNameMap {
		'showfm-player': ShowfmPlayerElement;
		'podcasterplus-player': ShowfmPlayerElement;
		'showfm-episodes': ShowfmEpisodesElement;
		'showfm-play': ShowfmPlayElement;
	}
}
