/**
 * Public API payloads for the episode list: GET /v1/podcasts/{ref} → data
 * and GET /v1/podcasts/{ref}/episodes → { data, pagination }. The episodes
 * cover the row states in the design (page 2): a long title, a long
 * description, no artwork of its own, a trailer, a bonus episode, explicit,
 * and audio hosted outside show.fm.
 */
export const PODCAST_ID = '99999999-8888-4777-8666-555555555555';
export const HOSTED_AUDIO = 'https://m.cdn.media/test-signal/audio.mp3';
export const EXTERNAL_AUDIO = 'https://media.example.test/audio.mp3';
export const ARTWORK = 'https://media.example.test/cover.png';
/** A published WebVTT on show.fm's media host. */
export const TRANSCRIPT = 'https://m.cdn.media/test-signal/transcript.vtt';

export function podcastPayload({ branded = true, theme = null as string | null } = {}) {
	return {
		id: PODCAST_ID,
		slug: 'the-long-table',
		title: 'The Long Table',
		brand_color: '#7E22CE',
		player_color: null,
		player_theme: theme,
		links: { listen: 'https://show.fm/the-long-table' },
		branding: { show_powered_by: branded }
	};
}

export interface EpisodeOptions {
	index: number;
	season?: number | null;
	number?: number | null;
	type?: 'full' | 'trailer' | 'bonus';
	title?: string;
	description?: string | null;
	own?: boolean;
	artwork?: string | null;
	audio?: string | null;
	explicit?: boolean;
	duration?: number | null;
	/** The episode's WebVTT, or none (the default). */
	transcript?: string | null;
}

/** One list item; the id is a UUID made from the index. */
export function episodeItem(options: EpisodeOptions) {
	const { index } = options;
	const id = `${String(index).padStart(8, '0')}-1111-4222-8333-444444444444`;
	return {
		id,
		slug: `episode-${index}`,
		title: options.title ?? `Episode ${index}`,
		description:
			options.description === undefined ? `What happens in episode ${index}.` : options.description,
		season_number: options.season === undefined ? 1 : options.season,
		episode_number: options.number === undefined ? index : options.number,
		episode_type: options.type ?? 'full',
		explicit: options.explicit ?? false,
		published_at: new Date(Date.UTC(2026, 8, 30 - index)).toISOString(),
		audio: {
			url: options.audio === undefined ? HOSTED_AUDIO : options.audio,
			content_type: 'audio/mpeg',
			duration_seconds: options.duration === undefined ? 3138 : options.duration,
			size_bytes: null
		},
		artwork: {
			url: options.artwork === undefined ? ARTWORK : options.artwork,
			own: options.own ?? true
		},
		links: {
			listen: `https://show.fm/the-long-table/e/episode-${index}`,
			embed: `https://embed.cdn.media/ep/${id}`
		},
		people: [],
		transcript: (options.transcript ? { url: options.transcript, type: 'text/vtt' } : null) as {
			url: string;
			type?: string;
		} | null
	};
}

export type EpisodeItem = ReturnType<typeof episodeItem>;

/** The design's sample list (embeds design page 2), newest first. */
export function sampleEpisodes(): EpisodeItem[] {
	return [
		episodeItem({
			index: 1,
			season: 2,
			number: 4,
			title: 'Sourdough, salt and the slow return of the village bakery',
			description:
				'Tom Reyes left a software job to reopen the bakery his great-grandfather ran in a town of 900 people. He talks about starter cultures, 4 a.m. shifts, and why the whole village now queues for bread on Saturday mornings.'
		}),
		episodeItem({
			index: 2,
			season: 2,
			number: 3,
			title:
				'Why everyone’s grandmother made the same casserole: a very long conversation about church-basement cookbooks, regional potlucks, and the women who wrote them all down',
			duration: 6012
		}),
		episodeItem({ index: 3, season: 2, number: null, type: 'bonus', title: 'Listener questions' }),
		episodeItem({ index: 4, season: 2, number: 2, title: 'Knives', explicit: true }),
		episodeItem({
			index: 5,
			season: 2,
			number: 1,
			title: 'Breakfast for dinner',
			artwork: null,
			own: false
		}),
		episodeItem({
			index: 6,
			season: 1,
			number: 1,
			title: 'Leftovers',
			audio: EXTERNAL_AUDIO
		}),
		episodeItem({ index: 7, season: 1, number: null, type: 'trailer', title: 'Welcome' })
	];
}

/** A page of the list endpoint. */
export function listPage(items: EpisodeItem[], nextCursor: string | null = null) {
	return { data: items, pagination: { next_cursor: nextCursor } };
}
