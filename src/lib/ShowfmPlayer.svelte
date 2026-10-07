<svelte:options
	customElement={{
		shadow: 'open',
		props: {
			episode: { attribute: 'episode' },
			podcast: { attribute: 'podcast' },
			theme: { attribute: 'theme' },
			size: { attribute: 'size' },
			accent: { attribute: 'accent' },
			wave: { attribute: 'wave' },
			api: { attribute: 'api' },
			headingLevel: { attribute: 'heading-level' },
			credit: { attribute: 'credit' },
			load: { attribute: 'load' },
			strings: { attribute: 'strings', type: 'Object' }
		}
	}}
/>

<!--
	<showfm-player> — the custom-element wrapper around PlayerCore.

	Attributes:
	  episode="uuid"      play one episode (wins over podcast)
	  podcast="slug"      latest-episode mode (always plays the newest release)
	  theme="auto|light|dark"  pin this embed's theme; absent = follow the
	                      show's player_theme setting from the payload
	  size="standard|compact"  absent = standard (geometry is baked into the
	                      snippet's reserved heights, never payload-driven)
	  accent="#hex"       pin this embed's accent; absent = follow the show
	  wave="true|false"   pin the waveform on/off; absent = follow the show's
	                      player_waveform setting from the payload
	  api                 endpoint override — dev/testing only
	  heading-level="2-6" wrap the title link in a heading; absent = none
	  credit="auto|on|off" the "Powered by" footer; auto follows the payload.
	                      Shown once per page, on the first embed that shows it
	  load="click"        draw a facade and request nothing until pressed
	  strings (property)  overrides for any visible string (strings.ts)

	States: facade (load="click", nothing requested) → loading → ready, or
	  - collapsed: the API answered 404. Scheduled, unpublished, deleted and
	    unknown episodes all look the same (nothing renders, the reserved
	    height and the light-DOM fallback go), so a schedule cannot leak. One
	    re-check when the tab becomes visible again catches a publish.
	  - unavailable: 403, the show is suspended. A message, no actions.
	  - error: anything else. The error line plus the light-DOM fallback.

	This file is ONLY compiled as a custom element by the element builds
	(vite.cdn.config.ts and vite.esm.config.ts, customElement: true). Svelte
	apps import PlayerCore directly from @showfm/embed/svelte. The native <slot> below is intentional and required:
	the element's light-DOM children (the fallback link authored in the embed
	snippet) can only be projected through a real shadow-DOM slot — Svelte
	snippets do not cross the custom-element boundary. $host() is undefined
	when the file is compiled as an ordinary component (unit tests), so every
	use of it is guarded.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import PlayerCore from './PlayerCore.svelte';
	import type { PlayerEpisodeData, PlayerSize, PlayerTheme } from './types';
	import { PLAYER_DEFAULT_API_URL } from './hosts';
	import { apiGet, episodeEndpoint, latestEpisodeEndpoint } from './api';
	import { pageController, type CreditClaim } from './controller';
	import { DEFAULT_ACCENT, onAccentColor, parseHex } from './contrast';
	import { languageFromTag, languageTagFor, resolveStrings, type StringOverrides } from './strings';
	import { loadLocale } from './locales/index';

	let {
		episode = '',
		podcast = '',
		theme = '',
		size = 'standard',
		accent = '',
		wave = '',
		api = PLAYER_DEFAULT_API_URL,
		headingLevel = '',
		credit = 'auto',
		load = '',
		strings = undefined
	}: {
		episode?: string;
		podcast?: string;
		/** Attribute string: ''/absent = follow the show's player_theme setting */
		theme?: string;
		size?: PlayerSize;
		accent?: string;
		/** Attribute string: ''/absent = follow the show's player_waveform setting */
		wave?: string | boolean;
		api?: string;
		/** Attribute string '2' to '6'; anything else emits no heading */
		headingLevel?: string | number;
		credit?: string;
		load?: string;
		strings?: StringOverrides;
	} = $props();

	const hostElement: HTMLElement | undefined = $host();

	type Status = 'facade' | 'loading' | 'ready' | 'error' | 'collapsed' | 'unavailable';

	let data = $state<PlayerEpisodeData | null>(null);
	let status = $state<Status>('loading');
	let recheck = $state(0);
	let languageTag = $state<string | null>(languageTagFor(hostElement));
	let core = $state<ReturnType<typeof PlayerCore> | null>(null);
	let facadeButton = $state<HTMLButtonElement | null>(null);
	let creditClaim = $state<CreditClaim | null>(null);
	let creditGranted = $state(false);

	// The inline click loader (dist/cdn/click-loader.js) draws a facade in the
	// light DOM before this script loads. When it was pressed, it marks the
	// element: "play" loads and plays, "load" only loads (showfm.load()). Read
	// once and cleared, so moving the element later does not replay it.
	const initialActivation = hostElement?.getAttribute('data-showfm-activated');
	let activated = $state<'play' | 'load' | null>(
		initialActivation === 'play' || initialActivation === 'load' ? initialActivation : null
	);
	let restoreFocus = hostElement?.hasAttribute('data-showfm-focus') ?? false;
	hostElement?.removeAttribute('data-showfm-activated');
	hostElement?.removeAttribute('data-showfm-focus');
	hostElement?.querySelector(':scope > [data-showfm-facade-ui]')?.remove();

	// German and French arrive as a locale chunk in the CDN build: render in
	// English until it is here, then again in the language (bumps this).
	let localesLoaded = $state(0);
	const language = $derived(languageFromTag(languageTag));
	const s = $derived((void localesLoaded, resolveStrings(language, strings)));
	$effect(() => {
		let current = true;
		loadLocale(language).then((loaded) => {
			if (loaded && current) localesLoaded += 1;
		});
		return () => {
			current = false;
		};
	});
	const deferred = $derived(load === 'click' && !activated);

	// Attribute pins; anything else follows the show settings in the payload.
	// Old cached payloads may lack the fields — fall back to auto / waveform-on.
	const pinnedTheme = $derived<PlayerTheme | null>(
		theme === 'auto' || theme === 'light' || theme === 'dark' ? theme : null
	);
	const pinnedWave = $derived<boolean | null>(
		wave === false || String(wave) === 'false'
			? false
			: wave === true || String(wave) === 'true'
				? true
				: null
	);
	const resolvedTheme = $derived<PlayerTheme>(
		pinnedTheme ??
			(data?.podcast.player_theme === 'light' || data?.podcast.player_theme === 'dark'
				? data.podcast.player_theme
				: 'auto')
	);
	const waveEnabled = $derived(pinnedWave ?? data?.podcast.player_waveform ?? true);
	const level = $derived(Number(headingLevel));
	// Validated before it reaches the style attribute; `0ea5e9` gains its `#`.
	const facadeAccent = $derived(
		parseHex(accent) ? `#${accent.trim().replace(/^#/, '')}` : DEFAULT_ACCENT
	);

	// What this element wants for the page's one credit: null while it may
	// still want it (loading), so a later embed does not take it meanwhile.
	const wantsCredit = $derived<boolean | null>(
		status === 'ready' && data
			? credit === 'on' || (credit !== 'off' && data.podcast.branding.show_powered_by)
			: status === 'loading'
				? null
				: false
	);

	$effect(() => {
		if (deferred) {
			status = 'facade';
			return;
		}
		const endpoint = episode
			? episodeEndpoint(api, episode)
			: podcast
				? latestEpisodeEndpoint(api, podcast)
				: null;
		void recheck;
		if (!endpoint) {
			status = 'error';
			return;
		}
		let cancelled = false;
		// A re-check from the collapsed state stays collapsed until it is answered.
		if (untrack(() => status) !== 'collapsed') status = 'loading';
		apiGet<PlayerEpisodeData>(endpoint).then((result) => {
			if (cancelled) return;
			if (result.status === 'ok') {
				data = result.data;
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
		return () => {
			cancelled = true;
		};
	});

	// Collapse releases the reserved height and hides the light-DOM fallback,
	// so it acts on the host (see :host([data-showfm-collapsed])).
	$effect(() => {
		hostElement?.toggleAttribute('data-showfm-collapsed', status === 'collapsed');
	});

	// One re-check when the tab comes back into view, never a poll.
	let rechecked = false;
	$effect(() => {
		if (status !== 'collapsed' || rechecked || typeof document === 'undefined') return;
		let wasHidden = document.visibilityState === 'hidden';
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				wasHidden = true;
			} else if (wasHidden && !rechecked) {
				rechecked = true;
				recheck += 1;
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	// The element's lang, else <html lang>, is read live.
	$effect(() => {
		if (!hostElement || typeof MutationObserver === 'undefined') return;
		const observer = new MutationObserver(() => (languageTag = languageTagFor(hostElement)));
		observer.observe(hostElement, { attributes: true, attributeFilter: ['lang'] });
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
		return () => observer.disconnect();
	});

	// "Powered by show.fm" once per page (page audio controller).
	$effect(() => {
		if (!hostElement) return;
		const claim = pageController().claimCredit(hostElement, (granted) => (creditGranted = granted));
		creditClaim = claim;
		return () => {
			claim.release();
			creditClaim = null;
		};
	});
	$effect(() => {
		creditClaim?.set(wantsCredit);
	});

	// showfm.load() upgrades every facade on the page at once (consent tools).
	$effect(() => {
		if (!deferred || typeof document === 'undefined') return;
		const onLoad = () => (activated = 'load');
		document.addEventListener('showfm:load', onLoad);
		return () => document.removeEventListener('showfm:load', onLoad);
	});

	// The facade the loader drew had focus: keep it on this element's facade.
	$effect(() => {
		if (restoreFocus && facadeButton) {
			restoreFocus = false;
			facadeButton.focus();
		}
	});

	// Before the player replaces a pressed facade, note whether the facade
	// had focus; the swap would otherwise drop it to the document.
	let focusPlayer = false;
	$effect.pre(() => {
		if (status !== 'ready') return;
		untrack(() => {
			if (facadeButton?.matches(':focus')) focusPlayer = true;
		});
	});

	// A pressed facade: once the player is here, focus follows to its play
	// button and "play" starts playback. If the browser no longer counts the
	// press as a user activation, the player shows its blocked state.
	let handedOff = false;
	$effect(() => {
		if (!core || handedOff || !activated) return;
		handedOff = true;
		untrack(() => {
			if (focusPlayer) core?.focusPlay();
			if (activated === 'play') core?.play();
		});
	});

	function activate() {
		activated = 'play';
	}
</script>

{#if status === 'ready' && data}
	<PlayerCore
		bind:this={core}
		episode={data}
		theme={resolvedTheme}
		{size}
		accent={accent || null}
		wave={waveEnabled}
		credit={hostElement ? creditGranted : wantsCredit}
		headingLevel={Number.isInteger(level) ? level : null}
		lang={languageTag}
		strings={s}
		sourceTag="embed"
	/>
{:else if status === 'facade' || (status === 'loading' && activated)}
	<!-- load="click": nothing has been requested. The facade knows only the
	     accent, the size and the reserved height. Pressed, it stays in place
	     (with a ring) until the player replaces it, so focus is never lost. -->
	<div
		class="facade theme-{pinnedTheme ?? 'auto'}"
		class:facade-compact={size === 'compact'}
		style="--facade-accent:{facadeAccent};--facade-on-accent:{onAccentColor(facadeAccent)}"
	>
		<div class="facade-row">
			<button
				bind:this={facadeButton}
				type="button"
				class="facade-play"
				aria-label={s.facadeTitle}
				aria-describedby="facade-meta"
				aria-busy={status === 'loading'}
				onclick={activate}
				part="play"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M8 5.5v13l11-6.5z" fill="currentColor"></path>
				</svg>
			</button>
			<span class="facade-text">
				<span class="facade-title" aria-hidden="true">{s.facadeTitle}</span>
				<span class="facade-meta" id="facade-meta">{s.facadeMeta}</span>
			</span>
		</div>
		<span class="facade-bar" aria-hidden="true"></span>
	</div>
{:else if status === 'loading'}
	<!-- The payload (and with it any show theme default) isn't here yet, so an
	     unpinned skeleton behaves like auto: prefers-color-scheme via CSS. -->
	<div
		class="skeleton theme-{pinnedTheme ?? 'auto'}"
		class:sk-compact={size === 'compact'}
		role="status"
		aria-label={s.loading}
	>
		<span class="pulse artwork-slot" class:artwork-compact={size === 'compact'}></span>
		<span class="pulse line"></span>
	</div>
{:else if status === 'unavailable'}
	<!-- A suspended show: one message, no actions, and visitors are never
	     told why (design page 5). The light-DOM fallback is not projected. -->
	<div
		class="notice theme-{pinnedTheme ?? 'auto'}"
		class:notice-compact={size === 'compact'}
		role="status"
		part="error"
	>
		<p>{s.suspended}</p>
	</div>
{:else if status === 'error'}
	<div class="fallback">
		<p>{s.error}</p>
		<!-- Deliberate native <slot> (exception to the no-slots rule): this file
		     compiles as a custom element (vite.cdn.config.ts), and a shadow-DOM
		     slot is the only mechanism that can project the host page's light-DOM
		     children — the snippet's <a>Listen on show.fm</a> fallback link.
		     Svelte snippets cannot render light-DOM content. -->
		<slot></slot>
	</div>
{/if}

<style>
	:host {
		display: block;
		width: 100%;
	}
	/* 404: render nothing and give back the snippet's reserved height. The
	   snippet sets display inline, which only !important outranks. */
	:host([data-showfm-collapsed]) {
		display: none !important;
	}
	/* Skeleton min-heights = the UNBRANDED player heights (252/83 — the
	   smaller variant), so the skeleton never exceeds the min-height the
	   embed snippet reserves on the host element: no layout shift on load. */
	.skeleton {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		border: 1px solid #e7e5ec;
		border-radius: 14px;
		padding: 20px 22px;
		background: #ffffff;
		min-height: 252px;
	}
	.skeleton.sk-compact {
		padding: 12px 14px;
		min-height: 83px;
		border-radius: 14px;
	}
	/* The facade and the suspended notice use the skeleton's box. */
	.facade,
	.notice {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		border: 1px solid #e7e5ec;
		border-radius: 14px;
		padding: 20px 22px;
		background: #ffffff;
		min-height: 252px;
		font-family:
			'Geist',
			ui-sans-serif,
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		font-size: 14px;
		line-height: 1.4;
		color: #2b2833;
	}
	.facade.facade-compact,
	.notice.notice-compact {
		padding: 12px 14px;
		min-height: 83px;
	}
	@media (prefers-color-scheme: dark) {
		.skeleton.theme-auto,
		.theme-auto {
			background: #17151f;
			border-color: rgba(255, 255, 255, 0.1);
			color: #ecebf0;
		}
	}
	.skeleton.theme-dark,
	.theme-dark {
		background: #17151f;
		border-color: rgba(255, 255, 255, 0.1);
		color: #ecebf0;
	}
	.pulse {
		background: rgba(128, 128, 128, 0.2);
		border-radius: 8px;
		animation: pp-pulse 1.2s ease-in-out infinite;
	}
	.artwork-slot {
		width: 64px;
		height: 64px;
		flex-shrink: 0;
		align-self: flex-start;
	}
	.artwork-slot.artwork-compact {
		width: 46px;
		height: 46px;
		align-self: center;
	}
	.line {
		height: 12px;
		flex: 1;
	}
	@keyframes pp-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse,
		.facade-play[aria-busy='true']::after {
			animation: none;
		}
	}

	/* ── load="click" facade ─────────────────── */
	.facade {
		flex-direction: column;
		align-items: stretch;
		justify-content: space-between;
	}
	.facade-row {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.facade-play {
		position: relative;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		margin: 0;
		padding: 0 0 0 2px;
		border: 0;
		border-radius: 9999px;
		background: var(--facade-accent);
		color: var(--facade-on-accent);
		cursor: pointer;
	}
	.facade-compact .facade-play {
		width: 34px;
		height: 34px;
	}
	.facade-play:focus-visible {
		outline: 2px solid var(--facade-accent);
		outline-offset: 2px;
	}
	.facade-play[aria-busy='true']::after {
		content: '';
		position: absolute;
		inset: -4px;
		border: 2px solid transparent;
		border-top-color: var(--facade-accent);
		border-radius: 9999px;
		animation: facade-spin 0.9s linear infinite;
	}
	@keyframes facade-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.facade-text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.facade-title,
	.facade-meta {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.facade-title {
		font-weight: 700;
		font-size: 16px;
		line-height: 1.3;
	}
	.facade-compact .facade-title {
		font-size: 14px;
		line-height: 1.25;
	}
	.facade-meta {
		font-size: 13px;
		opacity: 0.75;
	}
	.facade-compact .facade-meta {
		font-size: 11.5px;
	}
	/* The flat waveform: the bar rule the player draws before any peaks. */
	.facade-bar {
		height: 3px;
		border-radius: 3px;
		background: currentColor;
		opacity: 0.15;
	}

	/* ── suspended show ──────────────────────── */
	.notice p {
		margin: 0;
		opacity: 0.75;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fallback {
		font-family: system-ui, sans-serif;
		font-size: 14px;
		color: #61646b;
	}
	.fallback p {
		margin: 0 0 4px;
	}
</style>
