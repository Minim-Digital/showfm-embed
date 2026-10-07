<!--
	<showfm-episodes>: the episode list (design pages 1, 2, 5 and 6).

	Mounted into the element's shadow root by episodes.svelte.ts, which hands
	it the host and the element's attributes. It lives in the list's lazy
	chunk, so nothing here lands in v1.js.

	Two styles (Card, Minimal), each as a list, a grid or a compact list.
	Auto picks list or grid from the width of the element's own box
	(episode-list.ts). Rows play on the page's shared audio element through
	the page audio controller, so starting a row pauses any other show.fm
	embed on the page and the reverse.

	Whole-list states: loading skeleton, no episodes, couldn't load,
	suspended (403), collapsed (404: nothing renders and the reserved height
	goes, so a schedule cannot leak). The load="click" facade is the inline
	loader's (click-loader.ts); the list mounts once it is pressed. Row states: playing,
	paused, loading, can't be played, blocked by the browser, suspended.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { apiGet, episodeEndpoint } from './api';
	import { pageController, type CreditClaim, type PlaybackSnapshot } from './controller';
	import { MARKETING_APEX_URL, PLAYER_DEFAULT_API_URL } from './hosts';
	import { paletteVars, resolvePalette } from './palette';
	import { accessibleAccent, DEFAULT_ACCENT, mixHex, parseHex } from './contrast';
	import { drawWave, genPeaks } from './waveform';
	import { formatString, languageFromTag, languageTagFor, resolveStrings } from './strings';
	import { loadLocale } from './locales/index';
	import { resolveListStrings } from './list-strings';
	import {
		DESCRIPTION_MORE_AFTER,
		dateLabel,
		durationLabel,
		episodeNumberLabel,
		episodeTypes,
		episodesEndpoint,
		ownArtworkShare,
		parseCount,
		parseHide,
		parseLayout,
		parseSeason,
		parseSwitch,
		parseVariant,
		podcastEndpoint,
		resolveLayout,
		type ListEpisode,
		type ListPodcast
	} from './episode-list';

	let {
		host: hostProp,
		attrs,
		strings = undefined
	}: {
		host: HTMLElement;
		/** The element's attributes, kept current by episodes.svelte.ts. */
		attrs: Record<string, string | null>;
		strings?: unknown;
	} = $props();

	type Status = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable' | 'collapsed';
	type RowMessage = 'error' | 'blocked' | 'suspended';
	type RowState = 'idle' | 'loading' | 'playing' | 'paused';

	const controller = pageController();
	// The element never changes for a mounted list.
	const host = untrack(() => hostProp);

	// What the element was given before it upgraded: the fallback list sizes
	// the skeleton. A load="click" list is here because its facade was
	// pressed (episodes-element.ts waits for that): the facade goes, and once
	// the list is here a polite status says so and, when the facade had
	// focus, focus moves to the first episode. Loading does not play.
	const fallbackRows = host.querySelectorAll(':scope > ul > li').length;
	let fromFacade = host.hasAttribute('data-showfm-activated');
	let focusAfterLoad = host.hasAttribute('data-showfm-focus');
	host.removeAttribute('data-showfm-activated');
	host.removeAttribute('data-showfm-focus');
	host.querySelector(':scope > [data-showfm-facade-ui]')?.remove();

	let status = $state<Status>('loading');
	let podcastData = $state<ListPodcast | null>(null);
	let episodes = $state<ListEpisode[]>([]);
	let cursor = $state<string | null>(null);
	let pages = $state(0);
	let more = $state<'idle' | 'loading'>('idle');
	let ownShare = $state(0);
	let reload = $state(0);
	let width = $state(0);
	let systemDark = $state(false);
	let localesLoaded = $state(0);
	let announcement = $state('');
	let expanded = $state<Record<string, boolean>>({});
	let messages = $state<Record<string, RowMessage>>({});
	let playback = $state<{ id: string | null; state: RowState; time: number; duration: number }>({
		id: null,
		state: 'idle',
		time: 0,
		duration: 0
	});
	let creditClaim = $state<CreditClaim | null>(null);
	let creditGranted = $state(false);
	let container = $state<HTMLElement | null>(null);

	const attr = (name: string) => attrs[name] ?? '';
	const variant = $derived(parseVariant(attr('variant') || attr('style')));
	const layoutAttr = $derived(parseLayout(attr('layout')));
	const query = $derived({
		podcast: attr('podcast').trim(),
		api: attr('api') || PLAYER_DEFAULT_API_URL,
		limit: parseCount(attr('count')),
		season: parseSeason(attr('season')),
		types: episodeTypes(parseHide(attr('hide')))
	});
	const descriptions = $derived(parseSwitch(attr('descriptions'), true));
	const miniPlayer = $derived(parseSwitch(attr('mini-player'), false));
	const level = $derived(Number(attr('heading-level')));
	const heading = $derived(
		Number.isInteger(level) && level >= 2 && level <= 6 ? `h${level}` : null
	);
	// An unmeasured box (jsdom, or not laid out yet) keeps a forced layout.
	const layout = $derived(
		resolveLayout(layoutAttr, variant, width || (layoutAttr === 'auto' ? 0 : Infinity), ownShare)
	);
	const minimal = $derived(variant === 'minimal');

	// The element's lang, else <html lang>: episodes.svelte.ts renews attrs
	// when either changes.
	const languageTag = $derived((void attrs, languageTagFor(host)));
	const language = $derived(languageFromTag(languageTag));
	const s = $derived((void localesLoaded, resolveStrings(language, strings)));
	const l = $derived((void localesLoaded, resolveListStrings(language, strings)));

	// A pinned theme, else the show's player theme, else auto.
	const theme = $derived(
		[attr('theme'), podcastData?.player_theme].find(
			(value) => value === 'light' || value === 'dark' || value === 'auto'
		) ?? 'auto'
	);
	const dark = $derived(theme === 'dark' || (theme === 'auto' && systemDark));
	// `0ea5e9` and `#0ea5e9` both work; anything else follows the show.
	const palette = $derived(
		resolvePalette(
			(parseHex(attr('accent')) ? attr('accent') : null) ??
				podcastData?.player_color ??
				podcastData?.brand_color ??
				DEFAULT_ACCENT,
			dark ? 'dark' : 'light'
		)
	);
	// Text in the accent reaches 4.5:1 on the tint, the darkest surface it sits on.
	const accentText = $derived(
		accessibleAccent(palette.accent, dark ? mixHex('#ffffff', palette.bg, 0.07) : palette.tint, 4.5)
	);
	const cssVars = $derived(
		`${paletteVars(palette)};--pp-accent-text:${accentText};--pp-wave-track:${palette.waveTrack}`
	);
	const showTitle = $derived(podcastData?.title ?? '');

	const wantsCredit = $derived<boolean | null>(
		status === 'ready' || status === 'empty'
			? attr('credit') === 'on' ||
					(attr('credit') !== 'off' && !!podcastData?.branding.show_powered_by)
			: status === 'loading'
				? null
				: false
	);

	// ── data ───────────────────────────────────────────────────────────
	// Each load of the first page starts a new generation. A "Load more"
	// answer for an earlier one (the query changed, or Retry ran) is dropped.
	let generation = 0;
	$effect(() => {
		const { podcast, api, limit, season, types } = query;
		void reload;
		generation += 1;
		more = 'idle';
		if (!podcast) {
			status = 'error';
			return;
		}
		let cancelled = false;
		if (untrack(() => status) !== 'collapsed') status = 'loading';
		Promise.all([
			apiGet<ListPodcast>(podcastEndpoint(api, podcast)),
			apiGet<ListEpisode[]>(episodesEndpoint(api, podcast, { limit, season, types }))
		]).then(([show, page]) => {
			if (cancelled) return;
			if (show.status === 'unavailable' || page.status === 'unavailable') {
				status = 'unavailable';
			} else if (show.status === 'not-found' || page.status === 'not-found') {
				status = 'collapsed';
			} else if (show.status !== 'ok' || page.status !== 'ok') {
				status = 'error';
			} else {
				podcastData = show.data;
				episodes = Array.isArray(page.data) ? page.data : [];
				cursor = page.nextCursor;
				pages = 1;
				ownShare = ownArtworkShare(episodes);
				status = episodes.length ? 'ready' : 'empty';
			}
		});
		return () => {
			cancelled = true;
		};
	});

	async function loadMore() {
		if (!cursor || more === 'loading') return;
		more = 'loading';
		const { podcast, api, limit, season, types } = query;
		const asked = generation;
		const firstNew = episodes.length;
		const page = await apiGet<ListEpisode[]>(
			episodesEndpoint(api, podcast, { limit, season, types, cursor })
		);
		if (asked !== generation) return;
		if (page.status === 'ok') {
			episodes = [...episodes, ...(Array.isArray(page.data) ? page.data : [])];
			cursor = page.nextCursor;
			pages += 1;
			more = 'idle';
			// Focus moves to the first new episode, so keyboard users carry on
			// where the list grew instead of at the end of it.
			await focusIn(episodes[firstNew]?.id, '[data-play]', 'a');
		} else if (page.status === 'unavailable') {
			status = 'unavailable';
		} else {
			// The button stays for another try; the live region says why.
			more = 'idle';
			announcement = l.listError;
		}
	}

	// Collapse releases the reserved height (see the host style in
	// episodes.svelte.ts).
	$effect(() => {
		host.toggleAttribute('data-showfm-collapsed', status === 'collapsed');
	});

	$effect(() => {
		if (!fromFacade || status === 'loading') return;
		fromFacade = false;
		if (status !== 'ready') return;
		announcement = l.episodesLoaded;
		if (focusAfterLoad) void focusIn(episodes[0].id, '[data-play]', 'a');
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
	$effect(() => {
		if (theme !== 'auto' || !window.matchMedia) return;
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		systemDark = query.matches;
		const onChange = (event: MediaQueryListEvent) => (systemDark = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});
	// Auto and the narrow fallback read the element's own width.
	$effect(() => {
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver((entries) => {
			width = Math.round(entries[entries.length - 1].contentRect.width);
		});
		observer.observe(host);
		return () => observer.disconnect();
	});

	// "Powered by show.fm" once per page (page audio controller).
	$effect(() => {
		const claim = controller.claimCredit(host, (granted) => (creditGranted = granted));
		creditClaim = claim;
		return () => {
			claim.release();
			creditClaim = null;
		};
	});
	$effect(() => {
		creditClaim?.set(wantsCredit);
	});

	// ── playback ───────────────────────────────────────────────────────
	// The episode this list last started on the page's shared audio. It stays
	// "ours" while the shared audio still holds it, so a row another embed
	// paused shows as paused; once another element loads something else
	// there, the row goes back to its resting state.
	let mine: { id: string; src: string } | null = null;
	let pressed: string | null = null;

	function sync(snapshot: PlaybackSnapshot) {
		if (!mine) return;
		const audio = controller.sharedAudio();
		const owner = snapshot.owner === host;
		if (audio.getAttribute('src') !== mine.src || (!owner && !audio.paused)) {
			mine = null;
			playback = { id: null, state: 'idle', time: 0, duration: 0 };
			return;
		}
		const id = mine.id;
		const state = owner ? snapshot.state : 'paused';
		if (state === 'error') {
			playback = { id: null, state: 'idle', time: 0, duration: 0 };
			mine = null;
			void failed(id, pressed === id);
			return;
		}
		const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
		playback = {
			id: state === 'ended' || state === 'idle' ? null : id,
			state: state === 'loading' ? 'loading' : state === 'playing' ? 'playing' : 'paused',
			time: audio.currentTime || 0,
			duration
		};
	}
	$effect(() => controller.subscribe(sync));

	function rowState(episode: ListEpisode): RowState {
		return playback.id === episode.id ? playback.state : 'idle';
	}

	function audioSrc(episode: ListEpisode): string | null {
		const url = episode.audio?.url;
		if (!url) return null;
		return `${url}${url.includes('?') ? '&' : '?'}src=embed`;
	}

	async function toggle(episode: ListEpisode) {
		const state = rowState(episode);
		if (state === 'playing' || state === 'loading') {
			controller.sharedAudio().pause();
			return;
		}
		await start(episode);
	}

	async function start(episode: ListEpisode, reloadAudio = false) {
		const src = audioSrc(episode);
		if (!src) return;
		delete messages[episode.id];
		pressed = episode.id;
		mine = { id: episode.id, src };
		const audio = controller.sharedAudio();
		if (reloadAudio && audio.getAttribute('src') === src) audio.removeAttribute('src');
		try {
			await controller.playShared(
				host,
				{
					id: episode.id,
					title: episode.title,
					podcastTitle: podcastData?.title,
					artworkUrl: episode.artwork?.url ?? null
				},
				src
			);
			// Playing: a later failure was not caused by a press.
			if (pressed === episode.id) pressed = null;
			// The shared mini-player (EMB-4) shows only when the list asks for it.
			if (miniPlayer) {
				host.dispatchEvent(
					new CustomEvent('showfm:mini-player', { bubbles: true, composed: true })
				);
			}
		} catch (error) {
			const name = (error as DOMException | undefined)?.name;
			// A pause() or a new source interrupted the play: not an error. And
			// if the audio's error event got here first, it has been dealt with.
			if (name === 'AbortError' || mine?.id !== episode.id) return;
			mine = null;
			playback = { id: null, state: 'idle', time: 0, duration: 0 };
			if (name === 'NotAllowedError') {
				// The browser refused: the audio is fine, so Try again resumes.
				mine = { id: episode.id, src };
				await showMessage(episode.id, 'blocked', true);
				return;
			}
			await failed(episode.id, true);
		}
	}

	/**
	 * The audio failed. The show may have been suspended since the list
	 * loaded, so the API is asked once: 403 shows the suspended message,
	 * anything else the error.
	 */
	async function failed(id: string, moveFocus: boolean) {
		const result = await apiGet(episodeEndpoint(query.api, id));
		await showMessage(id, result.status === 'unavailable' ? 'suspended' : 'error', moveFocus);
	}

	async function showMessage(id: string, message: RowMessage, moveFocus: boolean) {
		messages[id] = message;
		if (pressed === id) pressed = null;
		// Focus follows only a press: the play button it was on has gone.
		if (moveFocus) await focusIn(id, '[data-retry]', '[data-message]');
	}

	async function retry(episode: ListEpisode) {
		void start(episode, messages[episode.id] === 'error');
		// The message has gone, and with it the button that was pressed.
		await focusIn(episode.id, '[data-play]');
	}

	/**
	 * Focus a control in an episode's row once the DOM has caught up: the
	 * first of `selectors` that is there (ids are UUIDs: no escaping).
	 */
	async function focusIn(id: string | undefined, ...selectors: string[]) {
		await tick();
		const row = container?.querySelector(`[data-row="${id}"]`);
		for (const selector of selectors) {
			const target = row?.querySelector<HTMLElement>(selector);
			if (target) return target.focus();
		}
	}

	/** "32 min left", from the episode's length until the audio knows its own. */
	function remainingLabel(episode: ListEpisode): string {
		const total = playback.duration || episode.audio?.duration_seconds || 0;
		const left = Math.max(60, total - playback.time);
		return formatString(l.remaining, { time: durationLabel(left, l) });
	}

	function statusText(episode: ListEpisode, state: RowState): string {
		if (state === 'loading') return l.loadingAudio;
		return formatString(l.statusLine, {
			status: state === 'playing' ? l.nowPlaying : s.paused,
			remaining: remainingLabel(episode)
		});
	}

	function pillText(episode: ListEpisode, state: RowState): string {
		if (state === 'loading') return l.loadingAudio;
		const remaining = remainingLabel(episode);
		if (state === 'playing') return formatString(l.pillPause, { remaining });
		if (state === 'paused') return formatString(l.pillResume, { remaining });
		const duration = durationLabel(episode.audio?.duration_seconds, l);
		return duration ? formatString(l.pillPlay, { duration }) : s.play;
	}

	const typeLabel = (episode: ListEpisode) =>
		episode.episode_type === 'trailer'
			? l.trailer
			: episode.episode_type === 'bonus'
				? l.bonus
				: '';

	/**
	 * The meta line as [class, text, hidden from screen readers]: "S2 · E4"
	 * shows while "Season 2, episode 4" is read, then the date or length and
	 * the badges. Items with the class "item" get the dots between them.
	 */
	function metaItems(episode: ListEpisode, state: RowState, live: boolean) {
		const items: [string, string, boolean?][] = [];
		const label = episodeNumberLabel(episode, l);
		const date = dateLabel(episode.published_at, languageTag);
		const duration = durationLabel(episode.audio?.duration_seconds, l);
		const type = typeLabel(episode);
		if (live && layout === 'compact') {
			items.push([
				`item status-text${state === 'playing' ? ' now' : ''}`,
				statusText(episode, state)
			]);
		}
		if (label.short) {
			// Minimal shows the number in its own column.
			if (!minimal) items.push(['item num', label.short, true]);
			items.push(['vh', label.spoken]);
		}
		if (date && !gridCard) items.push(['item', date]);
		if (duration && (gridCard || (minimal && layout === 'list'))) items.push(['item', duration]);
		if (type) items.push([minimal && layout !== 'compact' ? 'vh' : 'badge', type]);
		if (episode.explicit) items.push(['badge outline', l.explicit]);
		return items;
	}

	/** Minimal's number column: the season, the number or the episode type. */
	function indexItems(episode: ListEpisode) {
		const items: [string, string][] = [];
		const season = episode.season_number;
		const type = typeLabel(episode);
		if (layout === 'list' && season != null) {
			items.push(['tag', formatString(l.seasonOnly, { season })]);
		}
		// Compact keeps the column to a number; its badge says the type.
		if (type && layout !== 'compact') items.push(['tag accent', type]);
		else if (!type && episode.episode_number != null) {
			items.push(['big', String(episode.episode_number).padStart(2, '0')]);
		} else if (layout === 'compact') items.push(['', '—']);
		if (layout === 'grid' && !type && season != null) {
			items.push(['tag', formatString(l.seasonOnlySpoken, { season })]);
		}
		return items;
	}

	function messageText(message: RowMessage): string {
		return message === 'suspended' ? s.suspended : message === 'blocked' ? s.blocked : s.error;
	}

	// Rows without audio cannot be played at all.
	const rowMessage = (episode: ListEpisode): RowMessage | null =>
		messages[episode.id] ?? (episode.audio?.url ? null : 'error');

	// ── waveform ───────────────────────────────────────────────────────
	// Bar count from the real width, 3.5px bars with 2.5px gaps, never
	// stretched (drawWave). One canvas at most: the row that is playing.
	let waveCanvas = $state<HTMLCanvasElement | null>(null);
	let waveTick = $state(0);
	const playingEpisode = $derived(episodes.find((episode) => episode.id === playback.id));
	$effect(() => {
		const canvas = waveCanvas;
		if (!canvas || !playingEpisode) return;
		void waveTick;
		drawWave(canvas, {
			progress: playback.duration > 0 ? playback.time / playback.duration : 0,
			played: palette.accent,
			track: palette.waveTrack,
			knobRing: palette.bg,
			compact: false,
			wave: true,
			peaks: genPeaks(`${playingEpisode.id}${playingEpisode.title}`, 400)
		});
	});
	$effect(() => {
		const canvas = waveCanvas;
		if (!canvas || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => (waveTick += 1));
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	const skeletonRows = $derived(Math.max(1, Math.min(query.limit, fallbackRows || 3)));
	const gridCard = $derived(layout === 'grid' && !minimal);
</script>

<!-- The player's mic tile, sized by its box (the styles). -->
{#snippet mic()}
	<svg
		class="mic"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		><rect x="9" y="2" width="6" height="12" rx="3"></rect><path
			d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M8 21h8"
		></path></svg
	>
{/snippet}

{#snippet footer()}
	{#if creditGranted}
		<div class="footer" part="footer">
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

<!-- One row markup for every style and layout; the grid areas in the
     styles place its parts (artwork, number column, text, play, length). -->
{#snippet row(episode: ListEpisode)}
	{@const state = rowState(episode)}
	{@const kind = rowMessage(episode)}
	{@const live = state !== 'idle' && !kind}
	{@const duration = durationLabel(episode.audio?.duration_seconds, l)}
	{@const open = expanded[episode.id]}
	<article class="row" class:live data-row={episode.id} part="card">
		{#if layout !== 'compact'}
			<div class="art">
				{#if episode.artwork?.url}
					<img class="img" src={episode.artwork.url} alt="" loading="lazy" />
				{:else}
					<span class="img tile">{@render mic()}</span>
				{/if}
			</div>
		{/if}
		{#if minimal}
			<!-- The spoken season and number are in the meta line. -->
			<div class="idx" aria-hidden="true">
				{#each indexItems(episode) as [className, text], index (index)}<span class={className}
						>{text}</span
					>{/each}
			</div>
		{/if}
		<div class="main">
			<div class="meta">
				{#each metaItems(episode, state, live) as [className, text, hidden], index (index)}<span
						class={className}
						aria-hidden={hidden ? 'true' : undefined}>{text}</span
					>{/each}
			</div>
			<!-- A heading only when heading-level is set. -->
			<svelte:element this={heading ?? 'div'} class="title">
				<a href={episode.links.listen} target="_blank" rel="noopener noreferrer" part="title"
					>{episode.title}</a
				>
			</svelte:element>
			{#if kind}
				<div class="msg" role="status" tabindex="-1" data-message>
					<p>{messageText(kind)}</p>
					{#if kind !== 'suspended'}
						<div class="msg-actions">
							{#if episode.audio?.url}
								<button type="button" class="link" data-retry onclick={() => retry(episode)}
									>{s.retry}</button
								>
							{/if}
							<a class="link" href={episode.links.listen} target="_blank" rel="noopener noreferrer"
								>{s.listenOnShowfm}</a
							>
						</div>
					{/if}
				</div>
			{:else if descriptions && episode.description && layout !== 'compact'}
				<p class="desc" class:open id="desc-{episode.id}">{episode.description}</p>
				<!-- "More" past the length the two-line clamp cuts (design page 2).
				     Grid cells clamp with no "More" (design page 1). -->
				{#if layout === 'list' && episode.description.length > DESCRIPTION_MORE_AFTER}
					<button
						type="button"
						class="link more"
						aria-expanded={open ? 'true' : 'false'}
						aria-controls="desc-{episode.id}"
						onclick={() => (expanded[episode.id] = !open)}>{open ? l.less : l.more}</button
					>
				{/if}
			{/if}
			{#if live && layout === 'list'}
				<div class="progress">
					<span class="status" class:now={state === 'playing'}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
							><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"></path></svg
						>{statusText(episode, state)}
					</span>
					<canvas class="wave" bind:this={waveCanvas} aria-hidden="true"></canvas>
				</div>
			{/if}
			{#if gridCard}<div class="date">{dateLabel(episode.published_at, languageTag)}</div>{/if}
		</div>
		{#if !kind}
			{@const pill = minimal && layout !== 'compact'}
			<button
				type="button"
				class={pill ? 'pill' : 'play'}
				class:on={state === 'playing'}
				class:busy={state === 'loading'}
				data-play
				aria-label={formatString(l.actionName, {
					verb: pill
						? pillText(episode, state)
						: state === 'playing' || state === 'loading'
							? s.pause
							: s.play,
					title: episode.title
				})}
				onclick={() => toggle(episode)}
				part="play"
			>
				<svg
					viewBox="0 0 24 24"
					class:tri={state === 'idle' || state === 'paused'}
					aria-hidden="true"
					><path
						d={state === 'idle' || state === 'paused'
							? 'M8 5.5v13l11-6.5z'
							: 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z'}
						fill="currentColor"
					></path></svg
				>
				{#if pill}<span>{pillText(episode, state)}</span>{/if}
			</button>
		{/if}
		{#if gridCard && live}<span class="chip" class:now={state === 'playing'}
				>{state === 'playing' ? l.nowPlaying : s.paused}</span
			>{/if}
		<!-- Grid cards and Minimal's list show the length in the meta line. -->
		{#if duration && !live}<span class="dur">{duration}</span>{/if}
	</article>
{/snippet}

<div
	class="list v-{variant} l-{layout}"
	class:narrow={width > 0 && width < 480}
	style={cssVars}
	bind:this={container}
>
	{#if status === 'loading'}
		<!-- At the real row height, one row per fallback item. -->
		<div class="box skeleton" role="status" aria-label={l.loadingEpisodes}>
			{#each { length: skeletonRows }, index (index)}
				<div class="sk-row">
					<span class="sk sk-art"></span>
					<span class="sk-lines">
						<span class="sk" style="width:30%"></span>
						<span class="sk"></span>
						<span class="sk" style="width:85%"></span>
					</span>
					<span class="sk sk-play"></span>
				</div>
			{/each}
		</div>
	{:else if status === 'empty'}
		<div class="box notice">
			<span class="badge-icon muted">{@render mic()}</span>
			<p class="notice-title">{l.noEpisodes}</p>
			<p class="notice-note">{formatString(l.noEpisodesNote, { show: showTitle })}</p>
			{@render footer()}
		</div>
	{:else if status === 'error' || status === 'unavailable'}
		<!-- Suspended (403): the message only, no titles, artwork or actions,
		     and visitors are never told why (design page 5). -->
		<div class="box message-card" role={status === 'error' ? 'alert' : 'status'} part="error">
			<p>{status === 'error' ? l.listError : s.suspended}</p>
			{#if status === 'error'}
				<button type="button" class="link" onclick={() => (reload += 1)}>{s.retry}</button>
				{#if podcastData?.links?.listen}
					<a class="link" href={podcastData.links.listen} target="_blank" rel="noopener noreferrer"
						>{s.listenOnShowfm}</a
					>
				{/if}
			{/if}
		</div>
	{:else if status === 'ready'}
		<div class="frame">
			<div class="rows">
				{#each episodes as episode (episode.id)}
					{@render row(episode)}
				{/each}
			</div>
			{#if cursor}
				<div class="more-row">
					<button
						type="button"
						class="secondary"
						aria-disabled={more === 'loading' ? 'true' : undefined}
						aria-busy={more === 'loading' ? 'true' : undefined}
						onclick={loadMore}
					>
						{#if more === 'loading'}<span class="spinner" aria-hidden="true"></span>{/if}
						{more === 'loading' ? l.loadingMore : l.loadMore}
					</button>
				</div>
			{:else if pages > 1}
				<p class="end">{formatString(l.endOfList, { show: showTitle })}</p>
			{/if}
			{@render footer()}
		</div>
	{/if}
	<p class="vh" role="status" aria-live="polite">{announcement}</p>
</div>
