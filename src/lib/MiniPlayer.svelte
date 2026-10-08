<!--
	<showfm-mini-player>: the page's one mini-player (design page 3.3, with
	the suspended states of page 5 and the external audio rule of page 9).

	Never written by hand: play-element.ts adds it to the end of the body
	the first time an element that wants it starts playing, and
	play.svelte.ts mounts this into it. It shows whatever the page's shared
	audio is doing, through the page audio controller, and drives that audio
	directly (seek, skip, speed).

	- Desktop: a bar along the bottom of the window. Collapse makes it a
	  pill in the left or right corner that keeps play, the time left and
	  the way back; Close stops playback and hides it until the next play.
	- Mobile (640px and under): a floating 64px bar with the title on one
	  line. Expand opens a sheet (a modal dialog) with the full controls.
	- The `--showfm-*` hooks apply, also when set on the element that opened it
	  (copied over). --showfm-bottom-offset lifts it above a cookie bar or chat
	  bubble.
	- Suspended mid-listen: playback stops, the title and artwork stay, the
	  controls give way to the message and only Close remains.
	- "Powered by show.fm" shows here when the page has no earlier embed
	  that shows it (only play buttons, say).
	- Transcript: a toggle next to the speed opens the follow-along
	  transcript (<showfm-transcript>, following the shared audio) in a
	  panel that rises from the bar on the right; on a phone it goes in the
	  sheet. Only for an episode whose audio and VTT are on show.fm's media
	  hosts: otherwise the waveform has its width (design page 9).
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		pageController,
		type AudioEntry,
		type ControllerEpisode,
		type CreditClaim,
		type PlaybackState,
		type SharedMessage
	} from './controller';
	import { MARKETING_APEX_URL, isShowfmMediaUrl, mediaHosts } from './hosts';
	import { createLook } from './look.svelte';
	import { STYLE_HOOKS } from './style-hooks';
	import { drawWave, genPeaks } from './waveform';
	import { formatString, languageFromTag, languageTagFor, resolveStrings } from './strings';
	import { loadLocale } from './locales/index';
	import { resolvePlayStrings } from './play-strings';
	import { clock, episodeLabel, minutesLeft, nextRate, parsePosition } from './play';
	import { safeUrl } from './fallback';

	let {
		host: hostProp,
		request
	}: {
		host: HTMLElement;
		/**
		 * Renewed by play.svelte.ts each time an element opens the mini-player.
		 * A player's request carries its own audio (`follow`): watched, not opened.
		 */
		request: { opener: Element | null; follow?: HTMLAudioElement | null; count: number };
	} = $props();

	const controller = pageController();
	/** The phone layouts, as the styles have them. */
	const PHONE = '(max-width: 640px)';
	const host = untrack(() => hostProp);

	let open = $state(false);
	let collapsed = $state(false);
	let sheet = $state(false);
	let localesLoaded = $state(0);
	let announcement = $state('');
	let creditClaim = $state<CreditClaim | null>(null);
	let creditGranted = $state(false);
	let opener = $state<Element | null>(null);

	// Raw: the controller hands the same object back on every event.
	let episode = $state.raw<ControllerEpisode | null>(null);
	let playback = $state<PlaybackState>('idle');
	let message = $state<SharedMessage | null>(null);
	let time = $state(0);
	let duration = $state(0);
	let rate = $state(1);
	let transcriptOpen = $state(false);

	let root = $state<HTMLElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let waveTick = $state(0);

	// Where focus goes back to when the mini-player closes: the control the
	// visitor pressed to open it, if it is still on the page.
	let returnTo: HTMLElement | null = null;

	/** The focused element, looking inside shadow roots. */
	function deepActive(): HTMLElement | null {
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		return active as HTMLElement | null;
	}

	// ── opening ────────────────────────────────────────────────────────
	$effect(() => {
		void request.count;
		untrack(() => (request.follow ? watch(request.opener!, request.follow) : show(request.opener)));
	});
	$effect(() => () => observer?.disconnect());

	/**
	 * A player's own audio that the mini-player has taken over, or null: then
	 * it shows the page's shared audio. The host says which, for the
	 * transcript inside it.
	 */
	let followed: AudioEntry | null = null;
	/** The player being watched, and the observer watching it. */
	let watched: Element | null = null;
	let observer: IntersectionObserver | undefined;

	/**
	 * <showfm-player mini-player="on"> started playing: once the player is
	 * out of the window while its audio plays, the mini-player opens on that
	 * same audio (nothing restarts or loads again). One player at a time.
	 * The attribute is read again then, so taking it away stops the hand-off.
	 */
	function watch(player: Element, media: HTMLAudioElement) {
		observer?.disconnect();
		if (typeof IntersectionObserver === 'undefined') return;
		watched = player;
		observer = new IntersectionObserver((entries) => {
			const entry = controller.audios().find((candidate) => candidate.audio === media);
			if (
				entries[entries.length - 1].isIntersecting ||
				media.paused ||
				!entry ||
				player.getAttribute('mini-player') !== 'on'
			) {
				return;
			}
			followed = entry;
			show(player);
		});
		observer.observe(player);
	}

	function show(from: Element | null) {
		opener = from;
		if (!open) {
			collapsed = false;
			sheet = false;
		}
		open = true;
		const active = deepActive();
		if (active && !host.contains(active) && !host.shadowRoot?.contains(active)) {
			returnTo = active;
		}
		// The hooks can be set on the element that opened it, not only on
		// the page: each opener's own, or none (not the last opener's). Only
		// where they differ from the page's, so a hook on :root that changes
		// later (a site's dark mode) still reaches the mini-player.
		for (const name of STYLE_HOOKS) host.style.removeProperty(name);
		if (from) {
			const page = getComputedStyle(host);
			const theirs = getComputedStyle(from);
			for (const name of STYLE_HOOKS) {
				const value = theirs.getPropertyValue(name);
				if (value !== page.getPropertyValue(name)) host.style.setProperty(name, value);
			}
		}
		sync();
	}

	// Spoken when the mini-player opens and when it moves to another episode
	// (not again when a locale arrives).
	$effect(() => {
		if (!open || !episode) return;
		const title = episode.title;
		untrack(() => (announcement = formatString(p.actionName, { verb: p.nowPlaying, title })));
	});

	const position = $derived(parsePosition(opener?.getAttribute('mini-player-position')));
	const languageTag = $derived(languageTagFor(opener));
	const language = $derived(languageFromTag(languageTag));
	// The opener's own overrides (`element.strings`) win, as on the opener.
	const overrides = $derived((opener as (Element & { strings?: unknown }) | null)?.strings);
	const s = $derived((void localesLoaded, resolveStrings(language, overrides)));
	const p = $derived((void localesLoaded, resolvePlayStrings(language, overrides)));

	// ── the shared audio ───────────────────────────────────────────────
	function sync() {
		// The shared audio playing (a list or a play button) takes the
		// mini-player back from a player, as does the player's audio going.
		const page = controller.sharedState();
		if (followed) {
			// The player went (removed, or its audio remounted): nothing of it
			// is left to show or drive, so the mini-player closes.
			const gone = !controller.audios().includes(followed);
			if (gone || page?.state === 'playing' || page?.state === 'loading') {
				if (gone) open = false;
				followed = null;
				observer?.disconnect();
			}
		}
		// A watched player that left the page before any hand-off: let it go.
		if (watched && !watched.isConnected) observer?.disconnect();
		(host as HTMLElement & { showfmFollowing?: AudioEntry | null }).showfmFollowing = followed;
		const shared = followed ?? page;
		if (!shared) return;
		const audio = shared.audio;
		episode = shared.episode;
		playback = shared.state;
		// Blocked is the pressed element's to show; the mini-player keeps play ready.
		const next = shared.message === 'blocked' ? null : (shared.message ?? null);
		if (open && next && next !== message) {
			announcement = next === 'suspended' ? s.suspended : s.error;
		}
		message = next;
		time = audio.currentTime || 0;
		duration = Number.isFinite(audio.duration) ? audio.duration : 0;
		rate = audio.playbackRate || 1;
		// A suspended show stops playback with the message (design page 5).
		if (message && !audio.paused) audio.pause();
	}
	$effect(() => controller.subscribe(() => untrack(sync)));

	const audio = () => (followed ?? controller.sharedState())?.audio;
	const playing = $derived(playback === 'playing' || playback === 'loading');
	const total = $derived(duration || episode?.audio?.duration_seconds || 0);
	// "38 min left", or nothing while the length is unknown.
	const minutes = $derived(minutesLeft(total, time, p));
	const left = $derived(minutes && formatString(p.remaining, { time: minutes }));
	const label = $derived(episode ? episodeLabel(episode, p) : { short: '', spoken: '' });
	const artwork = $derived(safeUrl(episode?.artworkUrl));
	const listen = $derived(safeUrl(episode?.links?.listen));
	const messageText = $derived(message === 'suspended' ? s.suspended : s.error);
	// canOfferTranscript, written out: v1.js has the host check already.
	const offerTranscript = $derived(
		isShowfmMediaUrl(episode?.audio?.url, mediaHosts()) &&
			isShowfmMediaUrl(episode?.transcript?.url, mediaHosts())
	);
	const playName = $derived(
		formatString(p.actionName, { verb: playing ? s.pause : s.play, title: episode?.title ?? '' })
	);

	function toggle() {
		const media = audio();
		if (!media) return;
		if (playing) {
			media.pause();
			announcement = s.paused;
		} else {
			// Said only if the shared audio still holds this episode when it plays.
			const pressed = episode;
			media.play().then(
				() => pressed === episode && (announcement = s.playing),
				() => {}
			);
		}
	}

	function skip(seconds: number) {
		const media = audio();
		if (!media) return;
		// The audio's timeupdate brings the bar up to date.
		media.currentTime = Math.max(0, Math.min(total || Infinity, media.currentTime + seconds));
	}

	function seek(event: Event) {
		const media = audio();
		if (!media) return;
		media.currentTime = Number((event.currentTarget as HTMLInputElement).value);
	}

	function changeRate() {
		const media = audio();
		if (!media) return;
		rate = nextRate(media.playbackRate);
		media.playbackRate = media.defaultPlaybackRate = rate;
		announcement = formatString(s.speedChanged, { rate });
	}

	// The Share button is in the phone sheet only, where the Web Share API is.
	function share() {
		navigator.share({ title: episode!.title, url: listen! }).catch(() => {});
	}

	/** Focus the first control matching `selector` once the DOM has caught up. */
	async function focus(selector: string) {
		await tick();
		root?.querySelector<HTMLElement>(selector)?.focus();
	}

	function collapse() {
		collapsed = true;
		sheet = false;
		void focus('[data-expand]');
	}

	function expand() {
		if (collapsed) {
			collapsed = false;
			// A phone's bar has Expand where the desktop bar has Collapse.
			void focus(matchMedia(PHONE).matches ? '[data-expand]' : '[data-collapse]');
		} else {
			sheet = true;
			void focus('[data-collapse]');
		}
	}

	function closeSheet() {
		sheet = false;
		void focus('[data-expand]');
	}

	function close() {
		const hadFocus = host.shadowRoot?.contains(deepActive()) ?? false;
		audio()?.pause();
		open = false;
		sheet = false;
		if (hadFocus && returnTo?.isConnected) returnTo.focus();
	}

	/** The sheet is modal: Tab stays inside it and Escape closes it. */
	function onSheetKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeSheet();
			return;
		}
		if (event.key !== 'Tab') return;
		const controls = [
			...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), a[href]'
			)
		];
		const first = controls[0];
		const last = controls[controls.length - 1];
		const active = host.shadowRoot?.activeElement;
		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// ── environment ────────────────────────────────────────────────────
	$effect(() => {
		let current = true;
		loadLocale(language).then((loaded) => {
			if (loaded && current) localesLoaded += 1;
		});
		return () => {
			current = false;
		};
	});
	// A pinned theme and the accent from the element that started the
	// episode (which already ranked its own --showfm-accent), else auto and
	// the hooks carried over from it.
	const look = createLook(
		() => root,
		() => episode?.theme,
		() => episode?.accent,
		() => undefined
	);
	const palette = $derived(look.palette);

	// "Powered by show.fm" once per page: the mini-player sits at the end of
	// the body, so any embed above it that shows the credit comes first.
	$effect(() => {
		const claim = controller.claimCredit(host, (granted) => (creditGranted = granted));
		creditClaim = claim;
		return () => {
			claim.release();
			creditClaim = null;
		};
	});
	$effect(() => {
		// Shown unless the element that started the episode said it need not be.
		creditClaim?.set(open && !!episode && episode.credit !== false);
	});

	// ── waveform ───────────────────────────────────────────────────────
	// Bar count from the real width, 3px bars with 2px gaps (compact), never
	// stretched (drawWave). One canvas: the sheet is the bar, restyled.
	$effect(() => {
		void waveTick;
		if (!canvas || !episode) return;
		drawWave(canvas, {
			progress: total > 0 ? time / total : 0,
			played: palette.wave,
			track: palette.waveTrack,
			knobRing: palette.bg,
			compact: true,
			wave: true,
			peaks: genPeaks(`${episode.id}${episode.title}`, 400)
		});
	});
	$effect(() => {
		if (!canvas || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => (waveTick += 1));
		observer.observe(canvas);
		return () => observer.disconnect();
	});
</script>

<!-- One path, several subpaths: an {#each} here would share Svelte's list
     code with the episode list's chunk, which needs a third file. -->
{#snippet stroke(d: string, label = '')}
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		><path {d}></path>{#if label}<text
				x="12"
				y="15.6"
				text-anchor="middle"
				fill="currentColor"
				stroke="none">{label}</text
			>{/if}</svg
	>
{/snippet}

<!--
	One surface for every layout; the styles show each one's parts:
	  desktop bar   art, title and show, transport, waveform, speed,
	                Collapse and Close
	  phone bar     (640px and under) a progress line, art, title and time left,
	                play and Expand
	  pill          (.pill) play, title (not on phones) and time left, Expand;
	                suspended: an info mark, the message and Close
	  sheet         (.sheet, phones) a modal dialog with everything, the
	                waveform above the transport, Share and Close
	A message (suspended, can't be played) takes the transport's place and
	leaves only Close.
-->
<div class="mini pos-{position}" style={look.vars} lang={languageTag ?? undefined} bind:this={root}>
	{#if open && episode}
		{#if sheet}
			<!-- A pointer's way out; Escape is the keyboard's (onSheetKey). -->
			<div class="backdrop" aria-hidden="true" onclick={closeSheet}></div>
		{/if}
		<section
			class="bar"
			class:pill={collapsed}
			class:sheet
			class:msg={message}
			role={sheet ? 'dialog' : 'region'}
			aria-modal={sheet ? 'true' : undefined}
			aria-label={sheet ? formatString(s.playerLabel, { title: episode.title }) : p.nowPlaying}
			onkeydown={sheet ? onSheetKey : undefined}
			part="mini-player"
		>
			<span class="line" aria-hidden="true"
				><span style="width:{total > 0 ? Math.min(100, (time / total) * 100) : 0}%"></span></span
			>
			{#if artwork}
				<img class="art" src={artwork} alt="" />
			{:else}
				<span class="art tile"
					>{@render stroke(
						'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M8 21h8'
					)}</span
				>
			{/if}
			<span class="play info" role="img" aria-label={messageText}
				><svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					><circle cx="12" cy="12" r="9.5"></circle><path d="M12 16v-5M12 8h.01"></path></svg
				></span
			>
			<span class="text">
				<span class="title">{episode.title}</span>
				<span class="sub"
					>{episode.podcastTitle ?? ''}{#if label.short}{episode.podcastTitle ? ' · ' : ''}<span
							aria-hidden="true">{label.short}</span
						><span class="vh">{label.spoken}</span>{/if}</span
				>
				<span class="time">{message ? messageText : left}</span>
				{#if creditGranted}
					<a
						class="credit"
						href="{MARKETING_APEX_URL}/?ref=player"
						target="_blank"
						rel="noopener noreferrer"
						>{s.poweredBy} <span class="brand-a">show</span><span class="brand-b">.fm</span></a
					>
				{/if}
			</span>
			{#if message}
				<p class="message">{messageText}</p>
			{:else}
				<span class="transport">
					<button type="button" class="icon" aria-label={s.back15} onclick={() => skip(-15)}
						>{@render stroke(
							'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
							'15'
						)}</button
					>
					<button
						type="button"
						class="play"
						class:busy={playback === 'loading'}
						data-play
						aria-label={playName}
						onclick={toggle}
						><svg viewBox="0 0 24 24" class:tri={!playing} aria-hidden="true"
							><path
								d={playing ? 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z' : 'M8 5.5v13l11-6.5z'}
								fill="currentColor"
							></path></svg
						></button
					>
					<button type="button" class="icon" aria-label={s.forward30} onclick={() => skip(30)}
						>{@render stroke(
							'M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5',
							'30'
						)}</button
					>
				</span>
				<span class="times">
					<span>{clock(time)}</span>
					<span class="scrub">
						<canvas bind:this={canvas} aria-hidden="true"></canvas>
						<input
							type="range"
							min="0"
							max={total > 0 ? total : 0}
							step="1"
							value={Math.min(time, total)}
							disabled={total <= 0}
							oninput={seek}
							aria-label={s.seek}
							aria-valuetext={formatString(s.seekValue, {
								current: clock(time),
								total: clock(total)
							})}
						/>
					</span>
					<span>{clock(total)}</span>
				</span>
				<button
					type="button"
					class="ctrl"
					aria-label={formatString(s.speed, { rate })}
					onclick={changeRate}>{rate}×</button
				>
				{#if offerTranscript}
					<button
						type="button"
						class="ctrl tr"
						aria-expanded={transcriptOpen}
						onclick={() => (transcriptOpen = !transcriptOpen)}
						>{@render stroke('M17 6.1H3M21 12.1H3M15.1 18H3')}{s.transcript}</button
					>
					{#if transcriptOpen && !collapsed}
						<!-- It follows the shared audio, whoever started it. -->
						<showfm-transcript class={`panel${sheet ? ' in-sheet' : ''}`} height="300"
						></showfm-transcript>
					{/if}
				{/if}
			{/if}
			<span class="end">
				{#if !message}
					<button type="button" data-collapse aria-label={p.collapsePlayer} onclick={collapse}
						>{@render stroke('m6 9 6 6 6-6')}</button
					>
					<button type="button" data-expand aria-label={p.expandPlayer} onclick={expand}
						>{@render stroke('m18 15-6-6-6 6')}</button
					>
					{#if listen && 'share' in navigator}
						<button type="button" data-share aria-label={s.share} onclick={share}
							>{@render stroke(
								'M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 7.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M6 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M18 21.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2'
							)}</button
						>
					{/if}
				{/if}
				<button type="button" class="close" aria-label={p.closePlayer} onclick={close}
					>{@render stroke('M18 6 6 18M6 6l12 12')}</button
				>
			</span>
		</section>
	{/if}
	<p class="vh" role="status" aria-live="polite">{announcement}</p>
</div>
