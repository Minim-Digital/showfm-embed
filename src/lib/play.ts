/**
 * The play button's and mini-player's pure rules: their attributes, the
 * episode as they keep it, and the labels they show (design pages 3.3, 3.4,
 * 5 and 8). Kept apart from the components so they can be tested on their
 * own, and so the app's builder and the WordPress plugin can apply them.
 *
 * Pure: no DOM work at import time. Only the play chunk imports this, so
 * none of it lands in v1.js. It must not import the episode list's modules:
 * code the two chunks shared would need a third file.
 */
import { safeUrl } from './fallback.js';
import { formatString } from './strings.js';
import type { PlayerEpisodeData } from './types.js';
import type { PlayStrings } from './play-strings.js';

/** Icon only, icon and label, or a text link inside a sentence (design page 3.4). */
export type PlayVariant = 'icon' | 'label' | 'link';
export type PlaySize = 'sm' | 'lg';
/** Which bottom corner the collapsed mini-player sits in. */
export type MiniPlayerPosition = 'left' | 'right';

export function parsePlayVariant(value: string | null | undefined): PlayVariant {
	const variant = value?.trim().toLowerCase();
	return variant === 'icon' || variant === 'link' ? variant : 'label';
}

export function parsePlaySize(value: string | null | undefined): PlaySize {
	return value?.trim().toLowerCase() === 'lg' ? 'lg' : 'sm';
}

export function parsePosition(value: string | null | undefined): MiniPlayerPosition {
	return value?.trim().toLowerCase() === 'left' ? 'left' : 'right';
}

/** `on` or `off`, else the default. */
export function switchOn(value: string | null | undefined, fallback: boolean): boolean {
	const switched = value?.trim().toLowerCase();
	return switched === 'on' ? true : switched === 'off' ? false : fallback;
}

/**
 * The episode payload as the button keeps it. The audio it plays and the
 * listen link it hands on pass the http(s) allow-list; one that fails
 * becomes null (or empty), so the rest still works. The mini-player checks
 * the artwork itself, as it does for a list's.
 */
export function readPlayEpisode(data: PlayerEpisodeData): PlayerEpisodeData {
	return {
		...data,
		audio: { ...data.audio, url: safeUrl(data.audio?.url) },
		links: { ...data.links, listen: safeUrl(data.links?.listen) ?? '' }
	};
}

/** The audio URL tagged as an embed play, as the player tags it. */
export function embedSource(url: string | null | undefined): string | null {
	if (!url) return null;
	return `${url}${url.includes('?') ? '&' : '?'}src=embed`;
}

/** "52 min", "1 hr 40 min" (rounded to the minute, at least 1). Empty when unknown. */
export function minutesLabel(seconds: number | null | undefined, strings: PlayStrings): string {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
	const minutes = Math.max(1, Math.round(seconds / 60));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h ? formatString(strings.hoursMinutes, { h, m }) : formatString(strings.minutes, { n: m });
}

/** "38 min" left of `total` at `time`, never under a minute. Empty when the length is unknown. */
export function minutesLeft(total: number, time: number, strings: PlayStrings): string {
	if (!(total > 0)) return '';
	return minutesLabel(Math.max(60, total - time), strings);
}

/** "4:05", "1:02:09": the clock the mini-player shows. */
export function clock(seconds: number): string {
	const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	const h = Math.floor(total / 3600);
	const m = Math.floor(total / 60) % 60;
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export type ButtonState = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * The visible label of a play button (design pages 3.4 and 8): nothing for
 * the icon; "Play", "Play episode · 52 min" or "Listen · 52 min" at rest;
 * "Loading…"; "Pause · 38 min left"; "Resume · 38 min left".
 */
export function buttonLabel(
	variant: PlayVariant,
	size: PlaySize,
	state: ButtonState,
	duration: string,
	remaining: string,
	strings: PlayStrings & { play: string }
): string {
	if (variant === 'icon') return '';
	if (state === 'loading') return strings.loadingAudio;
	if ((state === 'playing' || state === 'paused') && remaining) {
		return formatString(state === 'playing' ? strings.pauseRemaining : strings.resumeRemaining, {
			remaining
		});
	}
	if (variant === 'link') {
		return duration ? formatString(strings.listen, { duration }) : strings.listenPlain;
	}
	if (size === 'lg') {
		return duration ? formatString(strings.playEpisode, { duration }) : strings.playEpisodePlain;
	}
	return strings.play;
}

/** "S2 · E4", with the spoken form "Season 2, episode 4"; a trailer or bonus says so. */
export function episodeLabel(
	episode: {
		season_number?: number | null;
		episode_number?: number | null;
		episode_type?: string | null;
	},
	strings: PlayStrings
): { short: string; spoken: string } {
	const type = episode.episode_type;
	if (type === 'trailer' || type === 'bonus') {
		const text = strings[type];
		return { short: text, spoken: text };
	}
	const season = episode.season_number;
	const number = episode.episode_number;
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

/** The playback rates the speed button steps through, as in the player. */
export const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

/** The next rate after `rate`; an unknown rate goes back to 1. */
export function nextRate(rate: number): number {
	const index = RATES.indexOf(rate);
	return RATES[(index + 1) % RATES.length];
}
