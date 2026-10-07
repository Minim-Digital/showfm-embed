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

/** What subscribers need to know about the episode that is playing. */
export interface ControllerEpisode {
	id: string;
	title: string;
	podcastTitle?: string;
	artworkUrl?: string | null;
}

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

interface Entry {
	owner: object;
	audio: HTMLAudioElement;
	episode: ControllerEpisode | null;
	state: PlaybackState;
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
	private entries = new Set<Entry>();
	private current: Entry | null = null;
	private listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
	private shared: Entry | null = null;
	private claims: Claim[] = [];

	/** Attach an element's own audio. Returns the function that detaches it. */
	attach(owner: object, audio: HTMLAudioElement, episode: ControllerEpisode | null = null) {
		const entry: Entry = { owner, audio, episode, state: 'idle' };
		const onEvent = (event: Event) => {
			const state = AUDIO_EVENTS[event.type];
			if (event.type === 'play') {
				// One at a time: whoever starts, everyone else stops.
				this.current = entry;
				this.pauseAll(audio);
			}
			// A 'pause' arriving after 'ended' keeps 'ended'.
			if (state && !(state === 'paused' && entry.state === 'ended')) entry.state = state;
			if (entry === this.current) this.emit();
		};
		for (const type in AUDIO_EVENTS) audio.addEventListener(type, onEvent);
		this.entries.add(entry);
		return () => {
			for (const type in AUDIO_EVENTS) audio.removeEventListener(type, onEvent);
			this.entries.delete(entry);
			if (this.current === entry) {
				this.current = null;
				this.emit();
			}
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
		this.shared!.owner = owner;
		this.shared!.episode = episode;
		if (audio.getAttribute('src') !== src) audio.src = src;
		await audio.play();
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

const KEY = Symbol.for('showfm.page-audio-controller.v1');

/** The page's controller, shared across every copy of the package on the page. */
export function pageController(): PageAudioController {
	const scope = globalThis as unknown as Record<symbol, PageAudioController | undefined>;
	return (scope[KEY] ??= new PageAudioController());
}
