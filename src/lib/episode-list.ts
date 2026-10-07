/**
 * The episode list's pure rules: its attributes, the API requests it makes,
 * the Auto layout rule and the labels in each row (design pages 1 and 2).
 * Kept apart from the component so they can be tested on their own, and so
 * the WordPress plugin and the app's builder can apply the same rules.
 *
 * Pure: no DOM work at import time. Only the list's chunk imports this, so
 * none of it lands in v1.js.
 */
import { formatString } from './strings.js';
import type { ListStrings } from './list-strings.js';

/** The two looks (design page 1). Tiles is not a style: Card's grid is. */
export type ListVariant = 'card' | 'minimal';
export type ListLayout = 'auto' | 'list' | 'grid' | 'compact';
/** What Auto resolves to, and what a forced layout can fall back to. */
export type ResolvedLayout = 'list' | 'grid' | 'compact';
export type EpisodeType = 'full' | 'trailer' | 'bonus';

/** One item of GET /v1/podcasts/{ref}/episodes (the public API's list payload). */
export interface ListEpisode {
	id: string;
	title: string;
	description?: string | null;
	season_number?: number | null;
	episode_number?: number | null;
	episode_type?: EpisodeType | string | null;
	explicit?: boolean;
	published_at: string;
	audio: { url: string | null; content_type?: string | null; duration_seconds: number | null };
	/** `own` is false when the episode borrows the show's artwork (API, APP-4). */
	artwork: { url: string | null; own?: boolean };
	links: { listen: string };
	transcript?: { url: string; type?: string } | null;
}

/** The fields of GET /v1/podcasts/{ref} the list reads. */
export interface ListPodcast {
	id?: string;
	slug?: string;
	title: string;
	brand_color?: string | null;
	player_color?: string | null;
	player_theme?: string | null;
	links?: { listen?: string };
	branding: { show_powered_by: boolean };
}

export interface ListPage {
	data: ListEpisode[];
	pagination?: { next_cursor: string | null };
}

/** Episodes per page: 10 unless set, at most 50 (the API's limit). */
export const DEFAULT_COUNT = 10;
export const MAX_COUNT = 50;
/** Auto shows a grid from this width of the element's own box (design page 1). */
export const AUTO_GRID_MIN_WIDTH = 900;
/** A grid narrower than this falls back to the list. */
export const GRID_MIN_WIDTH = 480;

export function parseVariant(value: string | null | undefined): ListVariant {
	return value?.trim().toLowerCase() === 'minimal' ? 'minimal' : 'card';
}

export function parseLayout(value: string | null | undefined): ListLayout {
	const layout = value?.trim().toLowerCase();
	return layout === 'list' || layout === 'grid' || layout === 'compact' ? layout : 'auto';
}

export function parseCount(value: string | number | null | undefined): number {
	const count = Number(String(value ?? '').trim() || NaN);
	return Number.isInteger(count) && count > 0 ? Math.min(count, MAX_COUNT) : DEFAULT_COUNT;
}

/** A season number, as the API accepts it, or null for every season. */
export function parseSeason(value: string | number | null | undefined): number | null {
	const season = String(value ?? '').trim();
	return /^\d{1,4}$/.test(season) ? Number(season) : null;
}

/** `hide="trailer,bonus"`: which episode types to leave out. */
export function parseHide(value: string | null | undefined): { trailer: boolean; bonus: boolean } {
	const hidden = (value ?? '').toLowerCase().split(/[\s,]+/);
	return { trailer: hidden.includes('trailer'), bonus: hidden.includes('bonus') };
}

/** `on` or `off`, else the default. */
export function parseSwitch(value: string | null | undefined, fallback: boolean): boolean {
	const switched = value?.trim().toLowerCase();
	return switched === 'on' ? true : switched === 'off' ? false : fallback;
}

/** The API's `type` filter for what `hide` leaves, or null for every type. */
export function episodeTypes(hide: { trailer: boolean; bonus: boolean }): string | null {
	if (!hide.trailer && !hide.bonus) return null;
	return ['bonus', 'full', 'trailer']
		.filter((type) => !(type === 'trailer' && hide.trailer) && !(type === 'bonus' && hide.bonus))
		.join(',');
}

/** GET /v1/podcasts/{ref} */
export function podcastEndpoint(api: string, podcast: string): string {
	return `${api}/v1/podcasts/${encodeURIComponent(podcast)}`;
}

export interface EpisodesQuery {
	limit: number;
	season?: number | null;
	types?: string | null;
	cursor?: string | null;
}

/** GET /v1/podcasts/{ref}/episodes with the page size, filters and keyset cursor. */
export function episodesEndpoint(api: string, podcast: string, query: EpisodesQuery): string {
	const params = new URLSearchParams({ limit: String(query.limit) });
	if (query.season != null) params.set('season', String(query.season));
	if (query.types) params.set('type', query.types);
	if (query.cursor) params.set('cursor', query.cursor);
	return `${podcastEndpoint(api, podcast)}/episodes?${params}`;
}

/** The share of episodes with artwork of their own (API `artwork.own`). */
export function ownArtworkShare(episodes: readonly ListEpisode[]): number {
	if (!episodes.length) return 0;
	return episodes.filter((episode) => episode.artwork.own === true).length / episodes.length;
}

/**
 * The layout the list draws (design page 1).
 *
 * - Auto reads the width of the element's own box: a list under 900px, a
 *   grid from 900px. Card only goes to the grid when at least half the
 *   listed episodes have artwork of their own; Minimal goes on width alone.
 * - A grid under 480px, forced or not, falls back to the list.
 * - Compact stays compact at every width.
 */
export function resolveLayout(
	layout: ListLayout,
	variant: ListVariant,
	width: number,
	ownShare: number
): ResolvedLayout {
	let resolved: ResolvedLayout =
		layout === 'auto'
			? width >= AUTO_GRID_MIN_WIDTH && (variant === 'minimal' || ownShare >= 0.5)
				? 'grid'
				: 'list'
			: layout;
	if (resolved === 'grid' && width < GRID_MIN_WIDTH) resolved = 'list';
	return resolved;
}

/** One entry of the light-DOM fallback list (renderEpisodeListHTML). */
export interface FallbackItem {
	title: string;
	href: string | null;
}

/** Reads the fallback list the element was given, before it is replaced. */
export function readFallbackList(host: Element): FallbackItem[] {
	return [...host.querySelectorAll(':scope > ul > li')].map((item) => {
		const link = item.querySelector('a');
		return {
			title: (item.textContent ?? '').trim(),
			href: link?.getAttribute('href') ?? null
		};
	});
}

/** "S2 · E4", with the spoken form "Season 2, episode 4". Empty when neither is known. */
export function episodeNumberLabel(
	episode: Pick<ListEpisode, 'season_number' | 'episode_number' | 'episode_type'>,
	strings: ListStrings
): { short: string; spoken: string } {
	const season = episode.season_number;
	// Trailers and bonus episodes carry their badge instead of a number.
	const number =
		episode.episode_type === 'trailer' || episode.episode_type === 'bonus'
			? null
			: episode.episode_number;
	const key =
		season != null
			? number != null
				? 'seasonEpisode'
				: 'seasonOnly'
			: number != null
				? 'episodeOnly'
				: null;
	if (!key) return { short: '', spoken: '' };
	const values = { season: season ?? '', episode: number ?? '' };
	return {
		short: formatString(strings[key], values),
		spoken: formatString(strings[`${key}Spoken`], values)
	};
}

/** "52 min", "1 hr 40 min" (rounded to the minute, at least 1). Empty when unknown. */
export function durationLabel(seconds: number | null | undefined, strings: ListStrings): string {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
	const minutes = Math.max(1, Math.round(seconds / 60));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h ? formatString(strings.hoursMinutes, { h, m }) : formatString(strings.minutes, { n: m });
}

/** The publish date in the element's language, "Sep 24, 2026". */
export function dateLabel(iso: string, lang: string | null): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const options = { year: 'numeric', month: 'short', day: 'numeric' } as const;
	try {
		return date.toLocaleDateString(lang || undefined, options);
	} catch {
		// A page's lang can be any text; an invalid tag throws RangeError.
		return date.toLocaleDateString(undefined, options);
	}
}

/** The description clamps to two lines; "More" shows only past this length. */
export const DESCRIPTION_MORE_AFTER = 150;
