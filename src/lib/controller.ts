/**
 * The page audio controller: one per page, shared by every show.fm element.
 *
 * - **One plays at a time.** Every element's audio is attached here. When
 *   one starts playing, the controller pauses all the others.
 * - **One shared audio element.** Elements that have no `<audio>` of their
 *   own (the play button and the episode list, EMB-3 and EMB-4) play through
 *   `playShared`, which drives a single `HTMLAudioElement` for the page. The
 *   single player keeps its own `<audio>`, as it always has, so a page with
 *   one player behaves exactly as before.
 * - **State for subscribers.** The current episode, time, duration and
 *   playback state, for the mini-player and the transcript.
 * - **What can be followed.** Every attached audio and its episode
 *   (`audios()`), so a transcript can follow a given player, a list or
 *   whatever plays. Attaching one tells subscribers, so a transcript finds a
 *   player that loads after it.
 * - **"Powered by show.fm" once per page**, on the first embed that shows it
 *   (decisions 3 and 9). Elements claim the credit; the first claimant in
 *   document order that wants it gets it, and an earlier element still
 *   loading holds the decision so the credit never jumps on load.
 *
 * The instance lives on `globalThis` under a registered symbol, so the CDN
 * script and an npm copy on the same page share one controller.
 *
 * No DOM work at import time; the shared element is created on first use.
 */

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * What subscribers need to know about the episode that is playing. The
 * optional fields are for the mini-player and the transcript; they take
 * the public API's names, so an element can spread an episode payload in.
 */
export interface ControllerEpisode {
	id: string;
	title: string;
	podcastTitle?: string;
	artworkUrl?: string | null;
	season_number?: number | null;
	episode_number?: number | null;
	episode_type?: string | null;
	audio?: { url?: string | null; duration_seconds?: number | null } | null;
	links?: { listen?: string | null } | null;
	/** The accent the element resolved (its attribute, else the show's colour). */
	accent?: string | null;
	/** The element's theme: `light`, `dark` or `auto`. */
	theme?: string | null;
	/** Whether the element wants the page's "Powered by" credit. */
	credit?: boolean | null;
	/**
	 * The published WebVTT. Absent when the element does not say; the
	 * transcript then asks the public API for the episode.
	 */
	transcript?: { url?: string | null } | null;
}

/** A message the shared audio's owner reports when its episode cannot play. */
export type SharedMessage = 'error' | 'blocked' | 'suspended';

export interface PlaybackSnapshot {
	/** The element (or other object) whose audio is current, or null. */
	owner: object | null;
	episode: ControllerEpisode | null;
	currentTime: number;
	duration: number;
	state: PlaybackState;
}

export interface CreditClaim {
	/** true: wants the credit; false: does not; null: not decided yet (loading). */
	set(wants: boolean | null): void;
	release(): void;
}

/** One attached audio and what the controller knows about it. */
export interface AudioEntry {
	owner: object;
	audio: HTMLAudioElement;
	episode: ControllerEpisode | null;
	state: PlaybackState;
	message?: SharedMessage | null;
}

interface Claim {
	host: Element;
	wants: boolean | null;
	granted: boolean;
	notify: (granted: boolean) => void;
}

/** Media events that change what subscribers see, and the state each one means. */
const AUDIO_EVENTS: Record<string, PlaybackState | null> = {
	play: 'playing',
	playing: 'playing',
	pause: 'paused',
	ended: 'ended',
	waiting: 'loading',
	error: 'error',
	timeupdate: null,
	durationchange: null
};

export class PageAudioController {
	private entries = new Set<AudioEntry>();
	private current: AudioEntry | null = null;
	private listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
	private shared: AudioEntry | null = null;
	private claims: Claim[] = [];
	/**
	 * How often each episode has been asked to play, or started or resumed
	 * playing, on any audio: a failure's recheck is stale once this moves
	 * (the transcript reads it for the same reason).
	 */
	readonly starts: Readonly<Record<string, number>> = {};

	private started(id: string | undefined) {
		if (id) (this.starts as Record<string, number>)[id] = (this.starts[id] ?? 0) + 1;
	}

	/** Attach an element's own audio. Returns the function that detaches it. */
	attach(owner: object, audio: HTMLAudioElement, episode: ControllerEpisode | null = null) {
		const entry: AudioEntry = { owner, audio, episode, state: 'idle' };
		const onEvent = (event: Event) => {
			const state = AUDIO_EVENTS[event.type];
			// `play` comes first; `playing` can wait while the audio buffers.
			if (event.type === 'play' || event.type === 'playing') this.started(entry.episode?.id);
			if (event.type === 'play') {
				// One at a time: whoever starts, everyone else stops.
				this.current = entry;
				this.pauseAll(audio);
			}
			// A 'pause' arriving after 'ended' keeps 'ended'.
			if (state && !(state === 'paused' && entry.state === 'ended')) entry.state = state;
			// The shared audio is news even when it is not current: a player
			// starting pauses it, and the mini-player and buttons show that.
			if (entry === this.current || entry === this.shared) this.emit();
		};
		for (const type in AUDIO_EVENTS) audio.addEventListener(type, onEvent);
		this.entries.add(entry);
		// Not for the shared audio: it is attached while it is being created.
		if (owner !== this) this.emit();
		return () => {
			for (const type in AUDIO_EVENTS) audio.removeEventListener(type, onEvent);
			this.entries.delete(entry);
			if (this.current === entry) this.current = null;
			// As on attach: anyone following this audio (a transcript) looks again.
			this.emit();
		};
	}

	/** The page's shared audio element, created on first use. */
	sharedAudio(): HTMLAudioElement {
		if (!this.shared) {
			const audio = document.createElement('audio');
			audio.preload = 'none';
			this.attach(this, audio);
			this.shared = [...this.entries].pop()!;
		}
		return this.shared.audio;
	}

	/**
	 * Play an episode on the shared audio element for an element that has no
	 * audio of its own. Pauses everything else. Rejects as `audio.play()` does,
	 * so the caller can show the blocked state.
	 */
	async playShared(owner: object, episode: ControllerEpisode, src: string): Promise<void> {
		const audio = this.sharedAudio();
		Object.assign(this.shared!, { owner, episode, message: null });
		// The request itself, before any event: it may yet buffer or fail.
		this.started(episode.id);
		if (audio.getAttribute('src') !== src) audio.src = src;
		await audio.play();
	}

	/**
	 * The shared audio's owner, episode and message, whichever element is
	 * current: what the mini-player shows. Null until something plays there.
	 */
	sharedState(): Readonly<AudioEntry> | null {
		return this.shared?.episode ? this.shared : null;
	}

	/**
	 * For an owner about to ask the API why episode `id` failed on the shared
	 * audio. The test it returns stays true only while the answer still
	 * applies: the owner still holds the shared audio with that episode, and
	 * the episode has not been asked to play, started or resumed anywhere on
	 * the page since (on this element, another element, or a player's own
	 * audio).
	 */
	failure(owner: object, id: string): () => boolean {
		const starts = this.starts[id];
		return () =>
			this.starts[id] === starts && this.shared?.owner === owner && this.shared.episode?.id === id;
	}

	/**
	 * The shared audio's owner says why episode `id` cannot play (or null
	 * once it can), so the mini-player shows the same message. A report is
	 * about the play that failed: it is dropped when the shared audio has
	 * moved to another episode, or started again, since (one list owns many
	 * episodes, and the owner asks the API why before it reports).
	 */
	report(owner: object, id: string, message: SharedMessage | null) {
		const shared = this.shared;
		if (
			shared?.owner !== owner ||
			shared.episode?.id !== id ||
			shared.state === 'playing' ||
			shared.state === 'loading'
		) {
			return;
		}
		shared.message = message;
		this.emit();
	}

	/** Pause every attached audio, or every one except `keep`. */
	pauseAll(keep?: HTMLAudioElement) {
		for (const { audio } of this.entries) {
			if (audio !== keep && !audio.paused) audio.pause();
		}
	}

	snapshot(): PlaybackSnapshot {
		const entry = this.current;
		const duration = entry?.audio.duration ?? 0;
		return {
			owner: entry?.owner ?? null,
			episode: entry?.episode ?? null,
			currentTime: entry?.audio.currentTime || 0,
			duration: Number.isFinite(duration) ? duration : 0,
			state: entry?.state ?? 'idle'
		};
	}

	/** Every attached audio, the current one first: what a transcript can follow. */
	audios(): AudioEntry[] {
		return [...this.entries].sort((a, b) => +(b === this.current) - +(a === this.current));
	}

	/** Called with the snapshot now and on every change. Returns the unsubscribe function. */
	subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => this.listeners.delete(listener);
	}

	/**
	 * Claim the page's one "Powered by show.fm" credit for an element.
	 * `notify` is called whenever the element gains or loses it.
	 */
	claimCredit(host: Element, notify: (granted: boolean) => void): CreditClaim {
		const claim: Claim = { host, wants: null, granted: false, notify };
		this.claims.push(claim);
		this.electCredit();
		return {
			set: (wants) => {
				claim.wants = wants;
				this.electCredit();
			},
			release: () => {
				this.claims = this.claims.filter((other) => other !== claim);
				this.electCredit();
			}
		};
	}

	private electCredit() {
		this.claims.sort((a, b) =>
			// 2 is Node.DOCUMENT_POSITION_PRECEDING: b comes before a.
			a.host.compareDocumentPosition(b.host) & 2 ? 1 : -1
		);
		// The first claimant that wants it. An earlier one still loading (null)
		// may yet want it, so nobody gets it until that one decides: granting a
		// later embed now would move the credit when the earlier one loads.
		const winner = this.claims.find((claim) => claim.wants !== false);
		for (const claim of this.claims) {
			const granted = claim === winner && claim.wants === true;
			if (claim.granted !== granted) {
				claim.granted = granted;
				claim.notify(granted);
			}
		}
	}

	private emit() {
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}

/**
 * Whether an element wants "Powered by show.fm", from its `credit` and
 * `platform` attributes and the show's branding as the public API resolves
 * it (`show_powered_by` is false only for a show whose plan includes
 * branding removal and that has turned the credit off).
 *
 * - `on` always shows it.
 * - Otherwise it shows unless the payload allows hiding it: `credit="off"`
 *   on a show without branding removal still shows it, and so does a
 *   missing payload (or one cached before the field shipped).
 * - The one exception is the WordPress plugin, which passes
 *   `platform="wordpress"`: a credit that ships in plugin code must be
 *   opt-in (WordPress.org guideline 10), so there `credit="off"` hides it
 *   for any show.
 */
export function creditWanted(
	credit: string | null | undefined,
	branding: { show_powered_by?: boolean } | null | undefined,
	platform: string | null | undefined
): boolean {
	return (
		credit === 'on' ||
		(branding?.show_powered_by !== false && (credit !== 'off' || platform !== 'wordpress'))
	);
}

const KEY = Symbol.for('showfm.page-audio-controller.v1');

/** The page's controller, shared across every copy of the package on the page. */
export function pageController(): PageAudioController {
	const scope = globalThis as unknown as Record<symbol, PageAudioController | undefined>;
	return (scope[KEY] ??= new PageAudioController());
}
