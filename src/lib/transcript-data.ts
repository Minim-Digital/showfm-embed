/**
 * Loads an episode's transcript for `<showfm-transcript>`: the episode from
 * the public API when it is needed, then the WebVTT from show.fm's media
 * host, parsed with the shared parser.
 *
 * The follow-along transcript is offered only when the audio AND the VTT
 * are on show.fm's media hosts (plan Q2): a third-party host sends no CORS
 * headers, and its timings may not match the audio.
 *
 * Ready transcripts are kept for the page's life, so a transcript that
 * follows a list does not fetch an episode again when it comes back to it.
 */
import { apiGet, episodeEndpoint } from './api.js';
import type { ControllerEpisode } from './controller.js';
import { isShowfmMediaUrl, mediaHosts } from './hosts.js';
import type { PlayerEpisodeData } from './types.js';
import { parseVtt, type VttCue } from './vtt.js';

export type TranscriptStatus =
	/** Nothing to show yet: the transcript follows the page and nothing has played. */
	| 'idle'
	| 'loading'
	| 'ready'
	/** The VTT or the episode could not be loaded. Try again. */
	| 'error'
	/** The show is suspended (API 403). No actions. */
	| 'suspended'
	/** No transcript to follow: none published, empty, or audio hosted elsewhere. */
	| 'none'
	/** The API answered 404: scheduled, unpublished, deleted or unknown. */
	| 'gone';

export interface LoadedTranscript {
	status: TranscriptStatus;
	cues?: VttCue[];
	/** The episode payload, when it was asked for (colours, duration). */
	episode?: PlayerEpisodeData | null;
	/**
	 * The VTT itself failed. The element asks the API whether the show has
	 * been suspended since (it knows whether the answer is still news).
	 */
	vttFailed?: boolean;
}

const ready = new Map<string, Promise<LoadedTranscript>>();

/**
 * Loads the transcript of episode `id`. `known` is what the element playing
 * it told the page controller; when it carries the transcript and `payload`
 * is false, the API is not asked.
 */
export function loadTranscript(
	id: string,
	known: ControllerEpisode | null,
	api: string,
	payload: boolean
): Promise<LoadedTranscript> {
	const key = `${api} ${id} ${payload ? '' : (known?.transcript?.url ?? '?')}`;
	let pending = ready.get(key);
	if (!pending) {
		pending = fetchTranscript(id, known, api, payload);
		ready.set(key, pending);
		// Only a settled answer is kept: an error can be tried again.
		void pending.then((result) => {
			if (result.status !== 'ready' && result.status !== 'none') ready.delete(key);
		});
	}
	return pending;
}

async function fetchTranscript(
	id: string,
	known: ControllerEpisode | null,
	api: string,
	payload: boolean
): Promise<LoadedTranscript> {
	let episode: PlayerEpisodeData | null = null;
	let audio = known?.audio?.url;
	let vtt = known?.transcript?.url;
	if (payload || !known || !('transcript' in known)) {
		const result = await apiGet<PlayerEpisodeData>(episodeEndpoint(api, id));
		if (result.status !== 'ok') {
			return {
				status:
					result.status === 'not-found'
						? 'gone'
						: result.status === 'unavailable'
							? 'suspended'
							: 'error'
			};
		}
		episode = result.data;
		audio = episode.audio?.url;
		vtt = episode.transcript?.url;
	}
	// canOfferTranscript, which accepts only http(s) URLs on the media hosts.
	// (Written out: v1.js's player no longer uses the helper, so calling it
	// here would move all of it into v1.js for this chunk.)
	const hosts = mediaHosts();
	if (!vtt || !isShowfmMediaUrl(audio, hosts) || !isShowfmMediaUrl(vtt, hosts)) {
		return { status: 'none', episode };
	}
	try {
		const response = await fetch(vtt);
		if (!response.ok) throw new Error(String(response.status));
		const cues = parseVtt(await response.text());
		return { status: cues.length ? 'ready' : 'none', cues, episode };
	} catch {
		return { status: 'error', episode, vttFailed: true };
	}
}

/** Forgets every kept transcript (tests). */
export function clearTranscripts() {
	ready.clear();
}
