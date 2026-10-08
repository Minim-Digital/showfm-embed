<!--
	PlayerCore — the embeddable audio player UI (AudioPlayerRedesign spec).

	Layout: FULL = identity → waveform → transport → attribution rows;
	COMPACT = artwork + [title/time row over a single transport row] + footer,
	so nothing overlaps down to ~320px. Auto light/dark resolves in JS (the
	waveform canvas needs the resolved theme), host accent via the `accent`
	attribute, `wave={false}` falls back to a plain bar + knob.

	Constraints (this component compiles into the standalone custom element):
	- Scoped hand-written CSS ONLY. No Tailwind, no app CSS, no lucide imports —
	  in shadow DOM none of those reach the component, and every dependency
	  lands in the public player bundle. Geist is a font-stack preference, not
	  a shipped webfont.
	- The waveform canvas is purely visual: the seeking control is the
	  transparent native range input overlaid on it (keyboard + aria-valuetext
	  + focus ring preserved). Accessibility is the point of this player.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { PlayerEpisodeData, PlayerSize, PlayerTheme } from './types';
	import { createLook } from './look.svelte';
	import { genPeaks, drawWave } from './waveform';
	import { downloadFilename, downloadHref } from './download';
	import { MARKETING_APEX_URL, isShowfmMediaUrl, mediaHosts } from './hosts';
	import { formatString, languageFromTag, resolveStrings, type StringOverrides } from './strings';
	import { pageController } from './controller';
	import { safeUrl } from './fallback';
	import { loadChunk } from './lazy-element';

	let {
		episode,
		theme = 'auto',
		size = 'standard',
		accent = null,
		sourceTag = 'embed',
		wave = true,
		credit = null,
		headingLevel = null,
		lang = null,
		strings = undefined,
		transcript = null,
		currentTime = $bindable(0)
	}: {
		episode: PlayerEpisodeData;
		theme?: PlayerTheme;
		size?: PlayerSize;
		accent?: string | null;
		sourceTag?: string;
		wave?: boolean;
		/**
		 * Shows or hides the "Powered by show.fm" footer. Null follows the
		 * payload's branding.show_powered_by, as the player always has.
		 */
		credit?: boolean | null;
		/** Wraps the title link in an <h2> to <h6>. Null (the default) emits no heading. */
		headingLevel?: number | null;
		/** Language tag for strings and dates, such as `de-DE`. Null is English. */
		lang?: string | null;
		/** Overrides for individual strings (see strings.ts). */
		strings?: StringOverrides;
		/**
		 * The transcript option: `on` adds a Transcript button that opens the
		 * follow-along transcript under the player, `open` opens it at once.
		 * Only the standard size offers it, and only for audio and a VTT on
		 * show.fm's media hosts (design page 9). The transcript's code loads
		 * when it is first opened (a lazy chunk in v1.js, a dynamic import
		 * elsewhere), so it works from `@showfm/embed/svelte` too.
		 */
		transcript?: string | null;
		/**
		 * Playback position in seconds, readable by a parent. Bindable so the
		 * listen page's transcript reader can follow along and highlight the
		 * cue being spoken. Writing it from outside does NOT seek — use the
		 * exported seekTo() for that, so a seek is always an explicit act
		 * rather than a side effect of state syncing.
		 */
		currentTime?: number;
	} = $props();

	/**
	 * Seek the audio element and resync the UI. Exported for `bind:this`, so a
	 * parent (the transcript reader) can jump to a cue without owning the
	 * <audio> element. Keeping ONE element is the point: a second player
	 * instance would double the audio.
	 */
	export function seekTo(seconds: number) {
		const target = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
		if (audioEl) audioEl.currentTime = target;
		currentTime = target;
		scrubbing = false;
	}

	/**
	 * Start playback, as pressing Play does. Used by the element when a
	 * `load="click"` facade was pressed, so one press loads and plays.
	 */
	export function play() {
		if (!isPlaying) void togglePlay();
	}

	/** Move focus to the play button (after a facade swaps for the player). */
	export function focusPlay() {
		(playButtonEl ?? retryButtonEl)?.focus();
	}

	const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
	const s = $derived(resolveStrings(languageFromTag(lang), strings));
	const language = $derived(languageFromTag(lang));

	let audioEl = $state<HTMLAudioElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let playButtonEl = $state<HTMLButtonElement | null>(null);
	let retryButtonEl = $state<HTMLButtonElement | null>(null);
	// The card↔player swap destroys the button the visitor just pressed, and
	// browsers drop focus to the document when the focused element is removed
	// — stranding a keyboard user with the recovery path unreachable and
	// unannounced.
	//
	// INVARIANT: arm this ONLY immediately before the state write that causes
	// the swap, never speculatively around an action that MIGHT swap. An arm
	// that no swap consumes survives to the next remount and steals focus
	// there — `size` is a live prop in the embed builder's preview, so its
	// standard↔compact switch rebuilds this branch at any time, with the
	// visitor's focus still in the form. Every arm below is adjacent to its
	// own swap; that is what makes a stale flag impossible.
	//
	// Plain, not $state — it is read only inside the effect the button
	// bindings already drive.
	let swapFocus = false;
	let isPlaying = $state(false);
	let isBuffering = $state(false);
	let hasError = $state(false);
	// Blocked ≠ broken, and the two states are mutually exclusive: hasError
	// unmounts the <audio> element (media is unusable, retry restarts from 0),
	// while `blocked` keeps it mounted — the browser refused one play
	// attempt, and the listener's position and buffer must survive it. Both
	// render through the SAME card, which is the only height-safe surface
	// here: the embed heights (300/110) are baked into host pages at
	// copy-paste time, so a blocked-state row added to the live player
	// overflows them and clips its own recovery link. Keep this copy short
	// enough to stay on one line at the compact width — the card measures
	// 109px against a 110px compact iframe, so a second line clips.
	let blocked = $state(false);
	let metadataDuration = $state<number | null>(null);
	let rateIndex = $state(0);
	let muted = $state(false);
	let scrubbing = $state(false);
	let scrubValue = $state(0);
	let announcement = $state('');
	let shared = $state(false);
	let sharedResetTimer: ReturnType<typeof setTimeout> | null = null;
	let waveResizeTick = $state(0);

	const isCompact = $derived(size === 'compact');
	const duration = $derived(metadataDuration ?? episode.audio.duration_seconds ?? 0);
	const playbackRate = $derived(RATES[rateIndex]);
	const sliderValue = $derived(
		scrubbing ? scrubValue : Math.min(currentTime, duration || currentTime)
	);
	// Accent precedence: per-embed override attr → the host's --showfm-accent
	// → the show's player color setting → legacy brand_color → default purple
	// (inside resolvePalette). The host's other colour hooks apply too.
	let rootEl = $state<HTMLElement>();
	const look = createLook(
		() => rootEl,
		() => theme,
		() => accent,
		() => episode.podcast.player_color ?? episode.podcast.brand_color
	);
	const palette = $derived(look.palette);
	const peaks = $derived(genPeaks(`${episode.id}${episode.title}`));
	// Every URL from the API passes the http(s) allow-list before it reaches
	// an href or src: no javascript:, data:, relative or protocol-relative
	// values. A link that fails is dropped; the rest of the player still works.
	const listenUrl = $derived(safeUrl(episode.links.listen));
	const artworkUrl = $derived(safeUrl(episode.artwork.url));
	const audioSrc = $derived.by(() => {
		const url = safeUrl(episode.audio.url);
		if (!url) return null;
		const separator = url.includes('?') ? '&' : '?';
		return `${url}${separator}src=${encodeURIComponent(sourceTag)}`;
	});
	const downloadName = $derived(downloadFilename(episode.title, episode.audio.content_type));
	// Download only works on show.fm's media hosts (the ?dl= attachment
	// parameter is media-delivery's), so external audio offers none (design
	// page 9). It still streams.
	const hostedAudio = $derived(isShowfmMediaUrl(episode.audio.url, mediaHosts()));
	const downloadUrl = $derived(
		audioSrc && hostedAudio ? downloadHref(audioSrc, downloadName) : null
	);
	const showCredit = $derived(credit ?? episode.podcast.branding.show_powered_by);
	// Only for audio and a VTT on show.fm's media hosts (canOfferTranscript).
	const offerTranscript = $derived(
		(transcript === 'on' || transcript === 'open') &&
			hostedAudio &&
			isShowfmMediaUrl(episode.transcript?.url, mediaHosts())
	);
	// The visitor's toggle, once they have pressed the button.
	let toggled = $state<boolean | null>(null);
	const transcriptOpen = $derived(toggled ?? transcript === 'open');
	let transcriptEl = $state<HTMLElement | null>(null);

	// The transcript mounts into its own element under the controls, in a
	// shadow root of its own, following this player's audio and episode.
	$effect(() => {
		const target = transcriptEl;
		const current = episode;
		if (!target) return;
		let live = true;
		let connection: ((connected: boolean) => void) | undefined;
		loadChunk<typeof import('./transcript.svelte.js')>(import('./transcript.svelte.js')).then(
			(chunk) => {
				if (live)
					connection = chunk.mountTranscript(target, { audio: () => audioEl, episode: current });
			}
		);
		return () => {
			live = false;
			connection?.(false);
		};
	});
	const heading = $derived(
		headingLevel !== null &&
			Number.isInteger(headingLevel) &&
			headingLevel >= 2 &&
			headingLevel <= 6
			? `h${headingLevel}`
			: null
	);
	const publishedDate = $derived.by(() => {
		const parsed = new Date(episode.published_at);
		if (Number.isNaN(parsed.getTime())) return '';
		const options = { year: 'numeric', month: 'short', day: 'numeric' } as const;
		try {
			return parsed.toLocaleDateString(lang || undefined, options);
		} catch {
			// A page's lang can be any text; an invalid tag throws RangeError.
			return parsed.toLocaleDateString(undefined, options);
		}
	});
	const metaLine = $derived([episode.podcast.title, publishedDate].filter(Boolean).join('  ·  '));

	// Repaint the scrubber whenever progress, palette, layout, or width change
	$effect(() => {
		const canvas = canvasEl;
		if (!canvas) return;
		void waveResizeTick;
		drawWave(canvas, {
			progress: duration > 0 ? sliderValue / duration : 0,
			played: palette.wave,
			track: palette.waveTrack,
			knobRing: palette.bg,
			compact: isCompact,
			wave,
			peaks
		});
	});

	$effect(() => {
		const canvas = canvasEl;
		if (!canvas || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => {
			waveResizeTick += 1;
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	$effect(() => () => {
		if (sharedResetTimer) clearTimeout(sharedResetTimer);
	});

	// Applies mute + rate to the element on mount AND on every change. This
	// must stay declarative: retryPlayback remounts the <audio> element, and a
	// fresh element defaults to unmuted/1× — imperative writes in the toggle
	// handlers would silently desync it from the toolbar. defaultPlaybackRate
	// is set too because the media load algorithm resets playbackRate to it.
	$effect(() => {
		if (!audioEl) return;
		audioEl.muted = muted;
		audioEl.defaultPlaybackRate = RATES[rateIndex];
		audioEl.playbackRate = RATES[rateIndex];
	});

	// One plays at a time on the page: the controller pauses this audio when
	// another element starts, and tells subscribers what is playing. The
	// element is re-attached whenever retryPlayback remounts it.
	$effect(() => {
		const audio = audioEl;
		if (!audio) return;
		// The episode as the page's mini-player shows it, should it take this
		// audio over (<showfm-player mini-player="on">). Its looks are read
		// once: a change of theme must not re-attach a playing audio.
		return pageController().attach(audio, audio, {
			...episode,
			podcastTitle: episode.podcast.title,
			artworkUrl,
			...untrack(() => ({ accent: look.accent, theme, credit: showCredit }))
		});
	});

	// Moves focus onto whichever control replaced the pressed one. Runs on every
	// swap (the bindings are what change), but only acts when a user press set
	// the flag — and consumes it either way, so a press that DIDN'T swap can
	// never leak focus into a later, unrelated one.
	$effect(() => {
		const retry = retryButtonEl;
		const play = playButtonEl;
		if (!swapFocus) return;
		// Take whichever binding points at a LIVE element. A branch swap can
		// leave the outgoing one still referencing its detached button, and
		// focusing a detached node silently drops focus to the document —
		// indistinguishable from doing nothing. Both null means the swap is
		// still mid-flight: keep the flag armed and catch the next run.
		const target = [retry, play].find((el) => el?.isConnected);
		if (!target) return;
		swapFocus = false;
		// Focus the action, not the message: the aria-live region already
		// speaks the explanation, so landing on the control makes the recovery
		// reachable with no extra keystrokes.
		target.focus();
	});

	function formatTime(totalSeconds: number): string {
		if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
		const seconds = Math.floor(totalSeconds % 60);
		const minutes = Math.floor(totalSeconds / 60) % 60;
		const hours = Math.floor(totalSeconds / 3600);
		const mm = String(minutes).padStart(2, '0');
		const ss = String(seconds).padStart(2, '0');
		return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
	}

	/** "2 hours", "2 Stunden", "2 heures": the unit names come from Intl. */
	function spokenUnit(value: number, unit: 'hour' | 'minute' | 'second'): string {
		try {
			return new Intl.NumberFormat(language, {
				style: 'unit',
				unit,
				unitDisplay: 'long'
			}).format(value);
		} catch {
			return `${value} ${unit}${value === 1 ? '' : 's'}`;
		}
	}

	function spokenTime(totalSeconds: number): string {
		if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return spokenUnit(0, 'second');
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor(totalSeconds / 60) % 60;
		const seconds = Math.floor(totalSeconds % 60);
		const parts: string[] = [];
		if (hours) parts.push(spokenUnit(hours, 'hour'));
		if (minutes) parts.push(spokenUnit(minutes, 'minute'));
		if (seconds || parts.length === 0) parts.push(spokenUnit(seconds, 'second'));
		return parts.join(' ');
	}

	function setMediaSessionMetadata() {
		if (!('mediaSession' in navigator)) return;
		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: episode.title,
				artist: episode.podcast.title,
				artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512' }] : []
			});
		} catch {
			// Media Session is progressive enhancement only
		}
	}

	async function togglePlay() {
		if (!audioEl) return;
		if (isPlaying) {
			audioEl.pause();
			return;
		}
		try {
			await audioEl.play();
			setMediaSessionMetadata();
		} catch (err) {
			const name = (err as DOMException | undefined)?.name;
			// A pending play() rejects with AbortError when pause()/load()
			// interrupts it (routine on slow connections: click play, click
			// again before the media arrives) — not an error, stay silent.
			if (name === 'AbortError') return;
			// The browser hard-blocked this play attempt (per-site permission,
			// an extension, low-power mode). The media itself is fine, so this
			// must NOT latch hasError: that would unmount the <audio> element
			// and destroy the listener's position mid-episode. The card swaps
			// in over the still-mounted element, and its Try again re-attempts
			// play() in place — a successful retry resumes where they were. A
			// silent return would leave a dead Play button.
			if (name === 'NotAllowedError') {
				// Arm only when the card is about to REPLACE the pressed Play.
				// Already on the card (a retry that got blocked again) means
				// nothing swaps and focus is already on Try again.
				if (!blocked) swapFocus = true;
				blocked = true;
				// The card already shows the sentence; the live region speaks it
				// without the full stop, as it always has.
				announcement = s.blocked.replace(/\.$/, '');
				return;
			}
			swapFocus = true;
			blocked = false;
			hasError = true;
		}
	}

	// Remounts the <audio> element so a transient failure (network blip while
	// loading) isn't terminal. preload="none" means this costs nothing until
	// the visitor presses play again.
	function retryPlayback() {
		// Reached only from the error card's Try again — the button unmounts
		// with the card, so focus follows to the Play it is replaced by.
		swapFocus = true;
		hasError = false;
		blocked = false;
		isPlaying = false;
		isBuffering = false;
		currentTime = 0;
	}

	function skip(deltaSeconds: number) {
		if (!audioEl) return;
		const next = Math.min(Math.max(audioEl.currentTime + deltaSeconds, 0), duration || Infinity);
		audioEl.currentTime = next;
		currentTime = next;
	}

	function cycleRate() {
		rateIndex = (rateIndex + 1) % RATES.length;
		announcement = formatString(s.speedChanged, { rate: RATES[rateIndex] });
	}

	function toggleMute() {
		muted = !muted;
		announcement = muted ? s.muted : s.unmuted;
	}

	function onSeekInput(event: Event) {
		scrubbing = true;
		scrubValue = Number((event.currentTarget as HTMLInputElement).value);
	}

	function onSeekChange(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		scrubbing = false;
		if (audioEl) audioEl.currentTime = value;
		currentTime = value;
	}

	async function copyShareLink(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			shared = true;
			announcement = s.linkCopied;
			if (sharedResetTimer) clearTimeout(sharedResetTimer);
			sharedResetTimer = setTimeout(() => (shared = false), 2000);
		} catch {
			announcement = s.shareFailed;
		}
	}

	async function share() {
		const url = listenUrl;
		if (!url) return;
		const nav = navigator as Navigator & {
			share?: (data: { title: string; text: string; url: string }) => Promise<void>;
		};
		if (typeof nav.share === 'function') {
			try {
				await nav.share({ title: episode.title, text: episode.podcast.title, url });
				announcement = s.shared;
				return;
			} catch (err) {
				// AbortError = the visitor dismissed the sheet — done. Anything
				// else (NotAllowedError inside an iframe missing allow="web-share")
				// means the sheet never opened, so fall through to the clipboard.
				if ((err as DOMException | undefined)?.name === 'AbortError') return;
			}
		}
		await copyShareLink(url);
	}
</script>

{#snippet artworkTile(px: number, radius: number)}
	{#if artworkUrl}
		<img
			class="artwork"
			style="width:{px}px;height:{px}px;--ar:{radius / 0.7}px"
			src={artworkUrl}
			alt=""
			loading="lazy"
			part="artwork"
		/>
	{:else}
		<div
			class="artwork tile"
			style="width:{px}px;height:{px}px;--ar:{radius / 0.7}px"
			aria-hidden="true"
		>
			<svg
				width={Math.round(px * 0.42)}
				height={Math.round(px * 0.42)}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="9" y="2" width="6" height="12" rx="3"></rect>
				<path d="M5 10v1a7 7 0 0 0 14 0v-1"></path>
				<path d="M12 18v3"></path>
				<path d="M8 21h8"></path>
			</svg>
		</div>
	{/if}
{/snippet}

{#snippet skipBackIcon(px: number)}
	<svg
		width={px}
		height={px}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
		<path d="M3 3v5h5"></path>
		<text x="12.5" y="15.6" class="skip-num" text-anchor="middle" fill="currentColor" stroke="none"
			>15</text
		>
	</svg>
{/snippet}

{#snippet skipFwdIcon(px: number)}
	<svg
		width={px}
		height={px}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
		<path d="M21 3v5h-5"></path>
		<text x="11.5" y="15.6" class="skip-num" text-anchor="middle" fill="currentColor" stroke="none"
			>30</text
		>
	</svg>
{/snippet}

{#snippet playPauseIcon(px: number)}
	{#if isPlaying}
		<svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
			<rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor"></rect>
			<rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor"></rect>
		</svg>
	{:else}
		<svg width={px} height={px} viewBox="0 0 24 24" style="margin-left:2px" aria-hidden="true">
			<path d="M8 5.5v13l11-6.5z" fill="currentColor"></path>
		</svg>
	{/if}
{/snippet}

{#snippet muteIcon(px: number)}
	{#if muted}
		<svg
			width={px}
			height={px}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M11 5 6 9H2v6h4l5 4z"></path>
			<path d="m22 9-6 6"></path>
			<path d="m16 9 6 6"></path>
		</svg>
	{:else}
		<svg
			width={px}
			height={px}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M11 5 6 9H2v6h4l5 4z"></path>
			<path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
			<path d="M19.5 5a9 9 0 0 1 0 14"></path>
		</svg>
	{/if}
{/snippet}

{#snippet scrubber()}
	<div class="wave" class:wave-compact={isCompact}>
		<canvas bind:this={canvasEl} aria-hidden="true"></canvas>
		<input
			class="seek"
			type="range"
			min="0"
			max={duration > 0 ? duration : 0}
			step="1"
			value={sliderValue}
			disabled={duration <= 0}
			oninput={onSeekInput}
			onchange={onSeekChange}
			aria-label={s.seek}
			aria-valuetext={formatString(s.seekValue, {
				current: spokenTime(sliderValue),
				total: spokenTime(duration)
			})}
		/>
	</div>
{/snippet}

{#snippet titleLink(className: string)}
	<a class={`${className}`} href={listenUrl} target="_blank" rel="noopener noreferrer" part="title">
		{episode.title}
	</a>
{/snippet}

{#snippet messageCard(message: string, onRetry: (() => unknown) | null)}
	<!-- The one height-safe surface for a non-playable state: it REPLACES the
	     player body rather than adding to it, so it stays inside the embed
	     heights host pages baked in at copy-paste time. Measured 109px in
	     every variant (vs 300 standard / 110 compact iframes). -->
	<div class="body body-error" class:body-error-compact={isCompact} part="error">
		<p>{message}</p>
		{#if onRetry}
			<button bind:this={retryButtonEl} type="button" class="error-retry" onclick={onRetry}>
				{s.retry}
			</button>
		{/if}
		{#if listenUrl}
			<a href={listenUrl} target="_blank" rel="noopener noreferrer">
				{s.listenOnShowfm}
			</a>
		{/if}
	</div>
{/snippet}

{#snippet poweredBy()}
	{#if showCredit}
		<div class="footer" class:footer-full={!isCompact} part="footer">
			<a
				class="powered-by"
				href="{MARKETING_APEX_URL}/?ref=player"
				target="_blank"
				rel="noopener noreferrer"
			>
				{s.poweredBy} <span class="brand-a">show</span><span class="brand-b">.fm</span>
			</a>
		</div>
	{/if}
{/snippet}

<div
	bind:this={rootEl}
	class="player"
	style={look.vars}
	role="group"
	aria-label={formatString(s.playerLabel, { title: episode.title })}
	part="container"
>
	<!-- Mounted independently of which body renders: the blocked card must NOT
	     unmount it, or the listener's position and buffer die with it. Only a
	     genuine media error (hasError) unmounts, because retryPlayback's whole
	     job is to remount and reload. -->
	{#if audioSrc && !hasError}
		<audio
			bind:this={audioEl}
			src={audioSrc}
			preload="none"
			onplay={() => {
				isPlaying = true;
				// Playing out of the blocked card unmounts the Try again that
				// was just pressed, so focus follows to the Play replacing it.
				// Armed HERE, next to the line that causes the swap, rather
				// than before play(): a plain success from the normal player
				// only relabels Play→Pause, swaps nothing, and must not arm.
				if (blocked) swapFocus = true;
				blocked = false;
				announcement = s.playing;
				// For <showfm-player mini-player="on">: the page's mini-player
				// (play-element.ts) may take this audio over once the player
				// scrolls out of view. It ignores players without the attribute.
				rootEl!.dispatchEvent(
					new CustomEvent('showfm:mini-player', {
						bubbles: true,
						composed: true,
						detail: audioEl
					})
				);
			}}
			onpause={() => {
				isPlaying = false;
				announcement = s.paused;
			}}
			onended={() => {
				isPlaying = false;
				announcement = s.finished;
			}}
			ontimeupdate={() => {
				if (audioEl && !scrubbing) currentTime = audioEl.currentTime;
			}}
			onloadedmetadata={() => {
				if (audioEl && Number.isFinite(audioEl.duration)) metadataDuration = audioEl.duration;
			}}
			onwaiting={() => (isBuffering = true)}
			onplaying={() => (isBuffering = false)}
			oncanplay={() => (isBuffering = false)}
			onerror={() => {
				// Arrives on its own (a failed load, a dropped connection), with
				// no press behind it — moving focus here would yank it from
				// wherever the visitor actually is on the host page.
				swapFocus = false;
				blocked = false;
				hasError = true;
				isPlaying = false;
			}}
		></audio>
	{/if}

	<!-- Exactly one body renders. Order encodes precedence: a broken media
	     element outranks a refused play attempt (the two states are already
	     kept mutually exclusive in script, this makes it structural). -->
	{#if !audioSrc || hasError}
		{@render messageCard(s.error, audioSrc ? retryPlayback : null)}
	{:else if blocked}
		<!-- Try again re-attempts play() on the still-mounted element rather
		     than remounting, so a lifted block resumes at the same position. -->
		{@render messageCard(s.blocked, togglePlay)}
	{:else if !isCompact}
		<div class="body body-full">
			<div class="identity">
				{@render artworkTile(64, 12)}
				<div class="titles">
					{#if heading}
						<svelte:element this={heading} class="heading">
							{@render titleLink('title')}
						</svelte:element>
					{:else}
						{@render titleLink('title')}
					{/if}
					<span class="meta" part="subtitle">{metaLine}</span>
				</div>
				<div class="actions">
					{#if downloadUrl}
						<a
							class="icon-btn action-btn"
							href={downloadUrl}
							download={downloadName}
							aria-label={s.download}
							part="download"
						>
							<svg
								width="19"
								height="19"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M12 3v13"></path>
								<path d="m7 11 5 5 5-5"></path>
								<path d="M5 20h14"></path>
							</svg>
						</a>
					{/if}
					<!-- Share needs the listen page; with no safe URL there is nothing to share. -->
					{#if listenUrl}
						<button
							type="button"
							class="icon-btn action-btn"
							onclick={share}
							aria-label={s.share}
							part="share"
						>
							{#if shared}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M20 6 9 17l-5-5"></path>
								</svg>
							{:else}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<circle cx="18" cy="5" r="2.6"></circle>
									<circle cx="6" cy="12" r="2.6"></circle>
									<circle cx="18" cy="19" r="2.6"></circle>
									<path d="m8.3 13.4 7.4 4.2"></path>
									<path d="m15.7 6.4-7.4 4.2"></path>
								</svg>
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<div class="wave-block" part="seek">
				{@render scrubber()}
				<div class="times" aria-hidden="true">
					<span>{formatTime(sliderValue)}</span><span>{formatTime(duration)}</span>
				</div>
			</div>

			<div class="transport" part="controls">
				<button
					type="button"
					class="icon-btn transport-btn"
					onclick={() => skip(-15)}
					aria-label={s.back15}
				>
					{@render skipBackIcon(23)}
				</button>
				<button
					bind:this={playButtonEl}
					type="button"
					class="play-btn play-full"
					class:buffering={isBuffering}
					onclick={togglePlay}
					aria-label={isPlaying ? s.pause : s.play}
					part="play"
				>
					{@render playPauseIcon(22)}
				</button>
				<button
					type="button"
					class="icon-btn transport-btn"
					onclick={() => skip(30)}
					aria-label={s.forward30}
				>
					{@render skipFwdIcon(23)}
				</button>
				<div class="spacer"></div>
				{#if offerTranscript}
					<!-- A disclosure: the transcript opens under the player, which
					     grows downwards (design page 3.1 A). -->
					<button
						type="button"
						class="rate-btn tr-btn"
						aria-expanded={transcriptOpen}
						onclick={() => (toggled = !transcriptOpen)}
						part="transcript"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M17 6.1H3M21 12.1H3M15.1 18H3"></path>
						</svg>
						{s.transcript}
					</button>
				{/if}
				<button
					type="button"
					class="rate-btn"
					onclick={cycleRate}
					aria-label={formatString(s.speed, { rate: playbackRate })}
					part="rate"
				>
					{playbackRate === 1 ? '1' : playbackRate}×
				</button>
				<button
					type="button"
					class="icon-btn transport-btn"
					onclick={toggleMute}
					aria-label={muted ? s.unmute : s.mute}
					part="mute"
				>
					{@render muteIcon(20)}
				</button>
			</div>

			{#if offerTranscript && transcriptOpen}
				<!-- The player grows downwards and "Powered by" moves under the
				     transcript (mounted by the effect above). -->
				<div class="tr" {lang} bind:this={transcriptEl}></div>
			{/if}
			{@render poweredBy()}
		</div>
	{:else}
		<div class="body body-compact">
			<div class="compact-row">
				{@render artworkTile(46, 10)}
				<div class="compact-col">
					<div class="compact-head">
						{#if heading}
							<svelte:element this={heading} class="heading heading-compact">
								{@render titleLink('title title-compact')}
							</svelte:element>
						{:else}
							{@render titleLink('title title-compact')}
						{/if}
						<span class="time-inline" aria-hidden="true"
							>{formatTime(sliderValue)} / {formatTime(duration)}</span
						>
					</div>
					<div class="compact-controls" part="controls">
						<button
							type="button"
							class="icon-btn compact-btn"
							onclick={() => skip(-15)}
							aria-label={s.back15}
						>
							{@render skipBackIcon(18)}
						</button>
						<button
							bind:this={playButtonEl}
							type="button"
							class="play-btn play-compact"
							class:buffering={isBuffering}
							onclick={togglePlay}
							aria-label={isPlaying ? s.pause : s.play}
							part="play"
						>
							{@render playPauseIcon(16)}
						</button>
						<button
							type="button"
							class="icon-btn compact-btn"
							onclick={() => skip(30)}
							aria-label={s.forward30}
						>
							{@render skipFwdIcon(18)}
						</button>
						{@render scrubber()}
						<button
							type="button"
							class="rate-btn rate-compact"
							onclick={cycleRate}
							aria-label={formatString(s.speed, { rate: playbackRate })}
							part="rate"
						>
							{playbackRate === 1 ? '1' : playbackRate}×
						</button>
						<button
							type="button"
							class="icon-btn compact-btn"
							onclick={toggleMute}
							aria-label={muted ? s.unmute : s.mute}
							part="mute"
						>
							{@render muteIcon(17)}
						</button>
					</div>
				</div>
			</div>
			{@render poweredBy()}
		</div>
	{/if}

	<span class="visually-hidden" role="status" aria-live="polite">{announcement}</span>
</div>

<style>
	/* The host's font unless --showfm-font sets one; nothing is downloaded.
	   --showfm-radius is held to 0-28px, and the artwork follows at 70%;
	   unset, the card is 14px and the artwork its design radius (--ar, set
	   on it as that radius / 0.7). */
	.player {
		box-sizing: border-box;
		width: 100%;
		font-family: var(--showfm-font, inherit);
		font-size: 14px;
		line-height: 1.4;
		color: var(--pp-fg);
		background: var(--pp-bg);
		border: 1px solid var(--pp-border);
		border-radius: clamp(0px, var(--showfm-radius, 14px), 28px);
		box-shadow: var(--pp-shadow);
		overflow: hidden;
		-webkit-font-smoothing: antialiased;
	}
	.player *,
	.player *::before,
	.player *::after {
		box-sizing: inherit;
	}

	.body-full {
		display: flex;
		flex-direction: column;
		gap: 15px;
		padding: 20px 22px 15px;
	}
	.body-compact {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px 9px;
	}

	/* ── identity ─────────────────────────────── */
	.identity {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.artwork {
		flex: none;
		object-fit: cover;
		border-radius: calc(clamp(0px, var(--showfm-radius, var(--ar)), 28px) * 0.7);
	}
	.artwork.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--pp-tint);
		color: var(--pp-accent);
	}
	.artwork.tile svg {
		opacity: 0.92;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		flex: 1;
	}
	.title {
		font-family: var(--showfm-font-title, inherit);
		font-weight: 700;
		font-size: 16px;
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: var(--pp-fg-strong);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title:hover {
		text-decoration: underline;
	}
	/* heading-level wraps the title link. The heading adds no box of its own
	   to the layout, so every contract height stays as it is. */
	.heading {
		display: flex;
		min-width: 0;
		margin: 0;
		font: inherit;
		letter-spacing: inherit;
	}
	.heading > .title {
		flex: 1;
		min-width: 0;
	}
	.heading-compact {
		flex: 1;
	}
	.meta {
		font-weight: 400;
		font-size: 13px;
		color: var(--pp-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.actions {
		display: flex;
		gap: 6px;
		flex: none;
	}

	/* ── buttons ──────────────────────────────── */
	:where(.player) button,
	.icon-btn {
		appearance: none;
		border: none;
		margin: 0;
		padding: 0;
		background: transparent;
		cursor: pointer;
		font: inherit;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
	:where(.player) button:focus-visible,
	:where(.player) a:focus-visible,
	:where(.player) input:focus-visible {
		outline: 2px solid var(--pp-focus);
		outline-offset: 2px;
		border-radius: 6px;
	}
	.action-btn {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		color: var(--pp-muted);
		transition:
			background 0.15s,
			color 0.15s;
	}
	.action-btn:hover {
		background: var(--pp-ctrl-hover);
		color: var(--pp-fg-strong);
	}
	.transport-btn {
		width: 42px;
		height: 42px;
		border-radius: 10px;
		color: var(--pp-fg);
		flex: none;
		transition: background 0.15s;
	}
	.transport-btn:hover {
		background: var(--pp-ctrl-hover);
	}
	.compact-btn {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		color: var(--pp-fg);
		flex: none;
		transition: background 0.15s;
	}
	.compact-btn:hover {
		background: var(--pp-ctrl-hover);
	}
	.skip-num {
		font-size: 8px;
		font-weight: 700;
		font-family: inherit;
	}

	.play-btn {
		border-radius: 9999px;
		background: var(--pp-accent);
		color: var(--pp-accent-fg);
		box-shadow: var(--pp-play-shadow);
		flex: none;
		position: relative;
		transition: filter 0.15s;
	}
	.play-btn:hover {
		filter: brightness(1.07);
	}
	.play-full {
		width: 56px;
		height: 56px;
	}
	.play-compact {
		width: 34px;
		height: 34px;
	}
	.play-btn.buffering::after {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		border: 2px solid transparent;
		border-top-color: var(--pp-accent);
		animation: pp-spin 800ms linear infinite;
	}
	@keyframes pp-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.rate-btn {
		min-width: 42px;
		height: 34px;
		padding: 0 11px;
		font-weight: 600;
		font-size: 13px;
		line-height: 1;
		color: var(--pp-fg);
		background: var(--pp-ctrl-bg);
		border: 1px solid var(--pp-ctrl-border);
		border-radius: 8px;
		font-variant-numeric: tabular-nums;
		flex: none;
		transition: background 0.15s;
	}
	.rate-btn:hover {
		background: var(--pp-ctrl-hover);
	}
	.rate-compact {
		min-width: 34px;
		height: 28px;
		padding: 0 8px;
		font-size: 11.5px;
		border-radius: 7px;
	}

	/* ── scrubber ─────────────────────────────── */
	.wave-block {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.wave {
		position: relative;
		height: 46px;
		border-radius: 6px;
	}
	.wave-compact {
		flex: 1;
		min-width: 44px;
		height: 26px;
	}
	.wave canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.seek {
		appearance: none;
		-webkit-appearance: none;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		background: transparent;
		opacity: 0;
		cursor: pointer;
	}
	.seek:disabled {
		cursor: default;
	}
	.wave:has(.seek:focus-visible) {
		outline: 2px solid var(--pp-focus);
		outline-offset: 3px;
	}
	.times {
		display: flex;
		justify-content: space-between;
		font-weight: 500;
		font-size: 12px;
		line-height: 1;
		color: var(--pp-muted);
		font-variant-numeric: tabular-nums;
	}

	/* ── transport (full) ─────────────────────── */
	.transport {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.spacer {
		flex: 1;
	}

	/* ── compact rows ─────────────────────────── */
	.compact-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.compact-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.compact-head {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.title-compact {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		line-height: 1.25;
	}
	.time-inline {
		flex: none;
		font-weight: 500;
		font-size: 11.5px;
		line-height: 1;
		color: var(--pp-muted);
		font-variant-numeric: tabular-nums;
	}
	.compact-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	/* ── attribution ──────────────────────────── */
	.footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
	}
	.footer-full {
		border-top: 1px solid var(--pp-border);
		margin-top: 1px;
		padding-top: 11px;
	}
	.powered-by {
		font-weight: 500;
		font-size: 11px;
		line-height: 1;
		letter-spacing: 0.01em;
		color: var(--pp-muted);
		text-decoration: none;
	}
	.body-compact .powered-by {
		font-size: 10px;
	}
	.powered-by:hover {
		text-decoration: underline;
		text-decoration-color: var(--pp-muted);
	}
	.brand-a {
		color: var(--pp-fg-strong);
		font-weight: 700;
	}
	/* Wordmark accent, NOT the host accent: purple in light, white in dark */
	.brand-b {
		color: var(--pp-logo);
		font-weight: 700;
	}

	/* ── transcript option ────────────────────── */
	.body-full {
		container-type: inline-size;
	}
	.tr-btn {
		gap: 6px;
	}
	.tr-btn[aria-expanded='true'] {
		color: var(--pp-fg-strong);
		background: var(--pp-tint);
		border-color: var(--pp-accent);
	}
	/* Edge to edge, 18px under the controls, the footer's rule on its foot. */
	.tr {
		margin: 3px -22px -16px;
		border-top: 1px solid var(--pp-border);
	}
	/* A narrow player keeps every control on its row: the button keeps its
	   name but shows only its icon, and the row tightens. */
	@container (max-width: 400px) {
		.tr-btn {
			gap: 0;
			font-size: 0;
		}
		.transport:has(.tr-btn) {
			gap: 4px;
		}
		.transport:has(.tr-btn) .transport-btn {
			width: 36px;
		}
	}

	/* ── error / blocked card ─────────────────── */
	.body-error {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 20px 22px;
	}
	.body-error p {
		margin: 0;
		color: var(--pp-muted);
	}
	/* The compact iframe has 1px to spare: a second line would clip, so a
	   message too long for one line (an override) ends in an ellipsis. */
	.body-error-compact p {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.body-error a,
	.error-retry {
		color: var(--pp-accent-text);
		font-weight: 600;
		text-decoration: none;
	}
	.error-retry {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		width: fit-content;
	}
	.body-error a:hover,
	.error-retry:hover {
		text-decoration: underline;
	}

	@media (prefers-reduced-motion: reduce) {
		.player,
		.player * {
			transition: none !important;
			animation: none !important;
		}
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
