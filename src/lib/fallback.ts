/**
 * The light-DOM fallback markup the elements upgrade (design page 7), and
 * optional PodcastEpisode JSON-LD.
 *
 * Builders and servers put this markup inside each element. It is what a
 * visitor without JavaScript sees, what shows before the script loads, and
 * the links search engines follow. On upgrade the element draws itself in
 * its shadow root; the links stay in the light DOM.
 *
 *   player and play button: a title link, then <audio controls preload="none">
 *   episode list:           <ul><li><a href>title</a></li>...</ul>
 *
 * Pure string functions with no DOM, exported from `@showfm/embed/server`.
 * The WordPress plugin's PHP port must produce the same bytes: the shared
 * cases are in `fixtures/fallback/` in the package.
 */

/** The fields the fallback and JSON-LD read. A public API episode payload fits. */
export interface FallbackEpisode {
	title: string;
	links: { listen: string };
	audio?: {
		url: string | null;
		content_type?: string | null;
		duration_seconds?: number | null;
	} | null;
	published_at?: string | null;
	description?: string | null;
	season_number?: number | null;
	episode_number?: number | null;
	artwork?: { url: string | null } | null;
	podcast?: { title: string; links?: { listen?: string } } | null;
}

/** The fields the list fallback reads from the podcast. */
export interface FallbackPodcast {
	title: string;
	links?: { listen?: string } | null;
}

export interface RenderEpisodeOptions {
	/**
	 * Appended to the audio URL as `src=`, as the player tags its plays.
	 * Absent leaves the URL as it is.
	 */
	sourceTag?: string;
}

export interface RenderEpisodeListOptions {
	/** Render at most this many episodes. */
	limit?: number;
}

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escapes text for HTML content and double-quoted attribute values. */
export function escapeHtml(value: string): string {
	return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** The URL when it is absolute http or https, else null. Blocks `javascript:` and friends. */
export function safeUrl(value: string | null | undefined): string | null {
	if (!value || typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!/^https?:\/\//i.test(trimmed)) return null;
	return trimmed;
}

function link(href: string | null | undefined, text: string): string {
	const url = safeUrl(href);
	return url ? `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>` : escapeHtml(text);
}

function tagged(url: string, sourceTag: string | undefined): string {
	if (!sourceTag) return url;
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}src=${encodeURIComponent(sourceTag)}`;
}

/**
 * Fallback for `<showfm-player>` and `<showfm-play>`: the title linked to
 * the listen page, then a plain audio control when the episode has audio.
 */
export function renderEpisodeHTML(
	episode: FallbackEpisode,
	options: RenderEpisodeOptions = {}
): string {
	const audio = safeUrl(episode.audio?.url);
	const control = audio
		? `<audio controls preload="none" src="${escapeHtml(tagged(audio, options.sourceTag))}"></audio>`
		: '';
	return link(episode.links?.listen, episode.title) + control;
}

/**
 * Fallback for `<showfm-episodes>`: a list of title links. With no episodes
 * it is the show's title, linked to its listen page.
 */
export function renderEpisodeListHTML(
	podcast: FallbackPodcast,
	episodes: readonly FallbackEpisode[],
	options: RenderEpisodeListOptions = {}
): string {
	const limit = options.limit ?? episodes.length;
	const shown = episodes.slice(0, Math.max(0, limit));
	if (shown.length === 0) return link(podcast.links?.listen, podcast.title);
	return `<ul>${shown.map((episode) => `<li>${link(episode.links?.listen, episode.title)}</li>`).join('')}</ul>`;
}

/** Seconds as an ISO 8601 duration: 1843 → `PT30M43S`. */
export function isoDuration(totalSeconds: number): string {
	const seconds = Math.max(0, Math.round(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = seconds % 60;
	return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest || seconds === 0 ? `${rest}S` : ''}`;
}

/**
 * schema.org `PodcastEpisode` for one episode. Optional for a page to use.
 * Serialise it with `serializeJsonLd` before putting it in a script tag.
 */
export function episodeJsonLd(episode: FallbackEpisode): Record<string, unknown> {
	const data: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'PodcastEpisode',
		name: episode.title
	};
	const url = safeUrl(episode.links?.listen);
	if (url) data.url = url;
	const published = episode.published_at ? new Date(episode.published_at) : null;
	if (published && !Number.isNaN(published.getTime())) {
		data.datePublished = published.toISOString();
	}
	if (episode.description) data.description = episode.description;
	const duration = episode.audio?.duration_seconds;
	if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
		data.duration = isoDuration(duration);
	}
	const image = safeUrl(episode.artwork?.url);
	if (image) data.image = image;
	if (typeof episode.episode_number === 'number') data.episodeNumber = episode.episode_number;
	if (typeof episode.season_number === 'number') {
		data.partOfSeason = { '@type': 'PodcastSeason', seasonNumber: episode.season_number };
	}
	if (episode.podcast?.title) {
		const series: Record<string, unknown> = {
			'@type': 'PodcastSeries',
			name: episode.podcast.title
		};
		const seriesUrl = safeUrl(episode.podcast.links?.listen);
		if (seriesUrl) series.url = seriesUrl;
		data.partOfSeries = series;
	}
	const audio = safeUrl(episode.audio?.url);
	if (audio) {
		const media: Record<string, unknown> = { '@type': 'MediaObject', contentUrl: audio };
		if (episode.audio?.content_type) media.encodingFormat = episode.audio.content_type;
		data.associatedMedia = media;
	}
	return data;
}

/**
 * JSON for a `<script type="application/ld+json">` body. `<`, `>` and `&`
 * are escaped so a title cannot close the script tag.
 */
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
