/**
 * The embed player's OWN host constants.
 *
 * The player is deliberately self-contained: it imports only `./` and svelte,
 * because it ships as a standalone bundle. The show.fm app keeps its own copy
 * of these hosts and asserts the two never drift, so a host change edits both
 * places together.
 */

/** Default API origin when the embedding page sets no `api` attribute. */
export const PLAYER_DEFAULT_API_URL = 'https://api.show.fm';

/** The "Powered by" link target in the player footer. */
export const MARKETING_APEX_URL = 'https://show.fm';

/**
 * Hosts that serve show.fm media: `m.cdn.media` and the older
 * `media.podcasterplus.com`. Audio anywhere else is external: it streams as
 * usual, but Download is hidden (the `?dl=` attachment parameter only works
 * on show.fm's media worker) and the transcript is never offered (no CORS,
 * and its timings may be stale).
 *
 * No other environment's host is built in. A page can add hosts with
 * `window.showfmMediaHosts = ['media.example.test']`, which is how staging
 * and development pages name their own media host.
 */
export const SHOWFM_MEDIA_HOSTS: readonly string[] = ['m.cdn.media', 'media.podcasterplus.com'];

/** The default hosts plus any the page added with `window.showfmMediaHosts`. */
export function mediaHosts(): readonly string[] {
	const extra =
		typeof window !== 'undefined'
			? (window as unknown as { showfmMediaHosts?: unknown }).showfmMediaHosts
			: undefined;
	if (!Array.isArray(extra)) return SHOWFM_MEDIA_HOSTS;
	return [
		...SHOWFM_MEDIA_HOSTS,
		...extra.filter((host): host is string => typeof host === 'string').map((h) => h.toLowerCase())
	];
}

/** Whether a URL is served from one of the show.fm media hosts. */
export function isShowfmMediaUrl(
	url: string | null | undefined,
	hosts: readonly string[] = SHOWFM_MEDIA_HOSTS
): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			(parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
			hosts.includes(parsed.hostname.toLowerCase())
		);
	} catch {
		return false;
	}
}

/**
 * Whether the follow-along transcript may be offered: only when the audio
 * AND the VTT are both on the show.fm media hosts (plan Q2).
 */
export function canOfferTranscript(
	audioUrl: string | null | undefined,
	transcriptUrl: string | null | undefined,
	hosts: readonly string[] = SHOWFM_MEDIA_HOSTS
): boolean {
	return isShowfmMediaUrl(audioUrl, hosts) && isShowfmMediaUrl(transcriptUrl, hosts);
}
