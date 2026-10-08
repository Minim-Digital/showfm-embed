<!--
	<showfm-play>: the standalone play button (design pages 3.4, 5, 6 and 8).

	Mounted into the element's shadow root by play.svelte.ts, which hands it
	the host and the element's attributes. It lives in the play chunk with
	the mini-player, so nothing here lands in v1.js.

	Three variants (icon, label, link) in two sizes. Every button plays on
	the page's shared audio through the page audio controller, so pressing
	one pauses any other show.fm embed on the page and the reverse. Buttons
	for the same episode show the same state. With mini-player on (the
	default) the first play brings up the page's mini-player.

	States: idle, loading, playing, paused, can't be played (Try again),
	blocked by the browser (play stays ready), suspended (a message line, no
	actions), collapsed (404: nothing renders and the reserved line goes).
	The host keeps one line of the same height in every state; only its
	width changes.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { elementGet, episodeEndpoint, latestEpisodeEndpoint } from './api';
	import {
		creditWanted,
		pageController,
		type ControllerEpisode,
		type SharedMessage
	} from './controller';
	import { MARKETING_APEX_URL, PLAYER_DEFAULT_API_URL } from './hosts';
	import { createLook } from './look.svelte';
	import { formatString, languageFromTag, languageTagFor, resolveStrings } from './strings';
	import { loadLocale } from './locales/index';
	import { resolvePlayStrings } from './play-strings';
	import {
		buttonLabel,
		embedSource,
		minutesLabel,
		minutesLeft,
		parsePlaySize,
		parsePlayVariant,
		readPlayEpisode,
		switchOn,
		type ButtonState
	} from './play';
	import type { PlayerEpisodeData } from './types';

	let {
		host: hostProp,
		attrs,
		strings = undefined
	}: {
		host: HTMLElement;
		/** The element's attributes, kept current by play.svelte.ts. */
		attrs: Record<string, string | null>;
		strings?: unknown;
	} = $props();

	type Status = 'loading' | 'ready' | 'error' | 'unavailable' | 'collapsed';

	const controller = pageController();
	// The element never changes for a mounted button.
	const host = untrack(() => hostProp);

	// A load="click" button is here because its facade was pressed (or
	// showfm.load() ran). "play" plays as soon as the episode is here; focus
	// stays on the button when the facade had it. The facade goes.
	let playWhenReady = host.getAttribute('data-showfm-activated') === 'play';
	let focusWhenReady = host.hasAttribute('data-showfm-focus');
	host.removeAttribute('data-showfm-activated');
	host.removeAttribute('data-showfm-focus');
	host.querySelector(':scope > [data-showfm-facade-ui]')?.remove();

	let status = $state<Status>('loading');
	let data = $state.raw<PlayerEpisodeData | null>(null);
	let reload = $state(0);
	let message = $state<SharedMessage | null>(null);
	let phase = $state<ButtonState>('idle');
	let time = $state(0);
	let duration = $state(0);
	let localesLoaded = $state(0);
	let announcement = $state('');
	let root = $state<HTMLElement | null>(null);

	const attr = (name: string) => attrs[name]?.trim() ?? '';
	const variant = $derived(parsePlayVariant(attr('variant')));
	const size = $derived(parsePlaySize(attr('size')));
	const miniPlayer = $derived(switchOn(attr('mini-player'), true));
	const api = $derived(attr('api') || PLAYER_DEFAULT_API_URL);
	const endpoint = $derived(
		attr('episode')
			? episodeEndpoint(api, attr('episode'))
			: attr('podcast')
				? latestEpisodeEndpoint(api, attr('podcast'))
				: null
	);

	// The element's lang, else <html lang>: play.svelte.ts renews attrs when
	// either changes.
	const languageTag = $derived((void attrs, languageTagFor(host)));
	const language = $derived(languageFromTag(languageTag));
	const s = $derived((void localesLoaded, resolveStrings(language, strings)));
	const p = $derived((void localesLoaded, resolvePlayStrings(language, strings)));

	// A pinned theme, else the show's player theme, else auto.
	const theme = $derived(
		[attr('theme'), data?.podcast.player_theme].find(
			(value) => value === 'light' || value === 'dark' || value === 'auto'
		) ?? 'auto'
	);
	// `0ea5e9` and `#0ea5e9` both work; anything else follows the host's
	// --showfm-accent, then the show. The button has no card: it sits on the
	// page, so --showfm-background is its surface.
	const look = createLook(
		() => root,
		() => theme,
		() => attr('accent'),
		() => data?.podcast.player_color ?? data?.podcast.brand_color,
		() => true
	);

	// The credit rides with the episode to the mini-player, which shows it
	// when no earlier embed on the page does. Only the show's branding can
	// allow hiding it (creditWanted).
	const wantsCredit = $derived(
		creditWanted(attr('credit'), data?.podcast.branding, attr('platform'))
	);
	// mini-player="off": no mini-player will carry it, so the button claims
	// the page's one credit itself and shows it beside itself (decision 3:
	// the first embed on the page that shows it). Held while loading; with
	// no payload (an error) it is shown, as on the player.
	let credited = $state(false);
	$effect(() => {
		if (miniPlayer) return;
		const claim = controller.claimCredit(host, (granted) => (credited = granted));
		claim.set(
			status === 'loading' ? null : (status === 'ready' || status === 'error') && wantsCredit
		);
		return () => {
			claim.release();
			credited = false;
		};
	});

	// ── generations ────────────────────────────────────────────────────
	// Every async result belongs to one load of one episode, and within it
	// to one play. `generation` counts both: a load and a press each start a
	// new one, and an API answer, a failure recheck, a report or a message
	// only lands while the generation it started in is still current. So a
	// late answer about episode A never shows on, or is reported for, the B
	// the button holds now, nor on A started again since.
	let generation = 0;
	let checking = false;
	// The audio's error event can arrive before play() rejects: a press in
	// either path moves focus once the message is here.
	let focusMessage = false;

	/** Forgets everything about the episode the button had: one place, for every load. */
	function reset() {
		generation += 1;
		data = null;
		message = null;
		checking = focusMessage = false;
		phase = 'idle';
		time = duration = 0;
		announcement = '';
	}

	// ── data ───────────────────────────────────────────────────────────
	$effect(() => {
		const url = endpoint;
		void reload;
		untrack(reset);
		if (!url) {
			status = 'error';
			return;
		}
		const load = generation;
		if (untrack(() => status) !== 'collapsed') status = 'loading';
		elementGet<PlayerEpisodeData>(url).then((result) => {
			if (load !== generation) return;
			if (result.status === 'ok') {
				data = readPlayEpisode(result.data);
				status = 'ready';
			} else {
				status =
					result.status === 'not-found'
						? 'collapsed'
						: result.status === 'unavailable'
							? 'unavailable'
							: 'error';
			}
		});
	});

	// Collapse releases the reserved line (the host style in play.svelte.ts).
	$effect(() => {
		host.toggleAttribute('data-showfm-collapsed', status === 'collapsed');
	});

	// A press that came before the episode (the facade's, or an early one).
	$effect(() => {
		if (status === 'loading') return;
		untrack(() => {
			if (focusWhenReady) {
				focusWhenReady = false;
				void focusControl();
			}
			if (playWhenReady) {
				playWhenReady = false;
				if (status === 'ready') void start();
			}
		});
	});

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

	// ── playback ───────────────────────────────────────────────────────
	// The button follows the page's shared audio whenever it holds this
	// button's episode, whoever started it: two buttons for one episode, or
	// a list row and a button, show the same state.
	function sync() {
		const shared = controller.sharedState();
		// Read in the subscribing effect, so it subscribes again once the episode is here.
		const episode = data;
		if (!episode || !shared || shared.episode?.id !== episode.id) {
			phase = 'idle';
			return;
		}
		const audio = shared.audio;
		const now = audio.currentTime || 0;
		const playback = shared.state;
		time = now;
		duration = Number.isFinite(audio.duration) ? audio.duration : 0;
		phase =
			playback === 'playing'
				? 'playing'
				: playback === 'loading'
					? 'loading'
					: playback === 'paused' && now > 0
						? 'paused'
						: 'idle';
		// The audio failed while this button owned it: find out why, once.
		if (playback === 'error' && shared.owner === host) void failed(false);
	}
	$effect(() => controller.subscribe(sync));

	async function toggle() {
		if (!data) {
			// Pressed before the episode is here: play when it is.
			playWhenReady = true;
			phase = 'loading';
			return;
		}
		if (phase === 'playing' || phase === 'loading') {
			controller.sharedState()?.audio.pause();
			return;
		}
		await start();
	}

	async function start(reloadAudio = false) {
		const episode = data!;
		const src = embedSource(episode.audio.url);
		if (!src) return;
		const play = ++generation;
		message = null;
		checking = focusMessage = false;
		phase = 'loading';
		const audio = controller.sharedAudio();
		if (reloadAudio && audio.getAttribute('src') === src) audio.removeAttribute('src');
		try {
			const shared: ControllerEpisode = {
				...episode,
				podcastTitle: episode.podcast.title,
				artworkUrl: episode.artwork.url,
				accent: look.accent,
				theme,
				credit: wantsCredit
			};
			await controller.playShared(host, shared, src);
			if (miniPlayer && play === generation) {
				host.dispatchEvent(
					new CustomEvent('showfm:mini-player', { bubbles: true, composed: true })
				);
			}
		} catch (error) {
			const name = (error as DOMException | undefined)?.name;
			// A pause() or another element's play interrupted this one: not an error.
			if (
				name === 'AbortError' ||
				play !== generation ||
				controller.sharedState()?.owner !== host
			) {
				return;
			}
			if (name === 'NotAllowedError') {
				// The browser refused (often a facade press that took too long):
				// the audio is fine, so play stays ready beside the message.
				phase = 'idle';
				await showMessage('blocked', false, episode.id);
				return;
			}
			await failed(true);
		}
	}

	/**
	 * The audio failed. The show may have been suspended since the button
	 * loaded, so the API is asked once: 403 shows the suspended message,
	 * anything else the error.
	 */
	async function failed(moveFocus: boolean) {
		focusMessage ||= moveFocus;
		if (checking || !data) return;
		checking = true;
		const { id } = data;
		const failedIn = generation;
		const applies = controller.failure(host, id);
		const result = await elementGet(episodeEndpoint(api, id));
		// Not news if, since: this button loaded or pressed again, or the
		// episode started anywhere on the page, or another element took over.
		if (failedIn !== generation || !applies()) return;
		await showMessage(result.status === 'unavailable' ? 'suspended' : 'error', focusMessage, id);
	}

	/** Shows, speaks and reports why episode `id` cannot play. */
	async function showMessage(kind: SharedMessage, moveFocus: boolean, id: string) {
		message = kind;
		controller.report(host, id, kind);
		// Spoken here unless a status line shows it: the icon variant has no
		// room for one, and the blocked note sits beside a button that stays.
		if (variant === 'icon' || kind === 'blocked') announcement = messageText(kind);
		// Focus follows only a press: the button it was on may have gone.
		if (moveFocus) await focusControl();
	}

	async function retry() {
		if (status === 'error') {
			reload += 1;
		} else {
			void start(message === 'error');
		}
		await focusControl();
	}

	/** Focus the play button, else Try again, else the message, once the DOM has caught up. */
	async function focusControl() {
		await tick();
		for (const selector of ['[data-play]', '[data-retry]', '[data-message]']) {
			const target = root?.querySelector<HTMLElement>(selector);
			if (target) return target.focus();
		}
	}

	const messageText = (kind: SharedMessage | null) =>
		kind === 'suspended' ? s.suspended : kind === 'blocked' ? s.blocked : s.error;

	// What the visitor sees instead of the button, or beside it: the show is
	// suspended, the episode could not load or play, it has no audio, or the
	// browser blocked playback.
	const shown = $derived<SharedMessage | null>(
		status === 'unavailable'
			? 'suspended'
			: status === 'error'
				? 'error'
				: (message ?? (data && !data.audio.url ? 'error' : null))
	);
	const canRetry = $derived(shown === 'error' && (status === 'error' || !!data?.audio.url));
	// The icon variant has room for a mark, not a sentence: its Try again is
	// the button itself, quiet, with the message as its description.
	const quietRetry = $derived(variant === 'icon' && canRetry);
	const total = $derived(duration || data?.audio.duration_seconds || 0);
	const label = $derived(
		quietRetry
			? ''
			: buttonLabel(
					variant,
					size,
					phase,
					minutesLabel(data?.audio.duration_seconds, p),
					minutesLeft(total, time, p),
					{ ...p, play: s.play }
				)
	);
	const title = $derived(data?.title ?? '');
	const verb = $derived(
		quietRetry ? s.retry : label || (phase === 'playing' || phase === 'loading' ? s.pause : s.play)
	);
	const name = $derived(title ? formatString(p.actionName, { verb, title }) : verb);
</script>

{#snippet info()}
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		aria-hidden="true"
		><circle cx="12" cy="12" r="9.5"></circle><path d="M12 16v-5M12 8h.01"></path></svg
	>
{/snippet}

<span class="root v-{variant} s-{size}" class:credited style={look.vars} bind:this={root}>
	{#if shown && shown !== 'blocked' && !quietRetry}
		<!-- The message in the button's place: a status line in the host's
		     font and colour, or for the icon a quiet mark that is not a tab stop. -->
		<span
			class={`${variant === 'icon' ? 'btn quiet' : 'msg'}`}
			role={variant === 'icon' ? 'img' : 'status'}
			aria-label={variant === 'icon' ? messageText(shown) : undefined}
			tabindex="-1"
			data-message
			part="error"
			>{@render info()}{#if variant !== 'icon'}<span>{messageText(shown)}</span>{/if}</span
		>
		{#if canRetry}
			<button type="button" class="retry" data-retry onclick={retry}>{s.retry}</button>
		{/if}
	{:else if status !== 'collapsed'}
		<button
			type="button"
			class="btn"
			class:quiet={quietRetry}
			class:busy={phase === 'loading' && variant !== 'link'}
			data-play
			aria-label={name}
			aria-describedby={shown ? 'message' : undefined}
			title={quietRetry ? messageText(shown) : undefined}
			onclick={quietRetry ? retry : toggle}
			part="play"
		>
			{#if quietRetry}{@render info()}{:else}<svg
					viewBox="0 0 24 24"
					class:tri={phase === 'idle' || phase === 'paused'}
					aria-hidden="true"
					><path
						d={phase === 'playing' || phase === 'loading'
							? 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z'
							: 'M8 5.5v13l11-6.5z'}
						fill="currentColor"
					></path></svg
				>{/if}{#if label}<span>{label}</span>{/if}
		</button>
		{#if shown}
			<span class={`${variant === 'icon' ? 'vh' : 'note'}`} id="message">{messageText(shown)}</span>
		{/if}
	{/if}
	{#if credited}
		<!-- In the button's line, whatever the room: "Powered by show.fm", else
		     "show.fm" (cut short at worst), always named in full (the styles). -->
		<a
			class="credit"
			href="{MARKETING_APEX_URL}/?ref=player"
			target="_blank"
			rel="noopener"
			aria-label="{s.poweredBy} show.fm"><span>{s.poweredBy}</span><b>show.fm</b></a
		>
	{/if}
	<span class="vh" role="status" aria-live="polite">{announcement}</span>
</span>
