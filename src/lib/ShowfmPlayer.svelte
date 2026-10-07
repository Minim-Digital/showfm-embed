<svelte:options
	customElement={{
		tag: 'showfm-player',
		shadow: 'open',
		props: {
			episode: { attribute: 'episode' },
			podcast: { attribute: 'podcast' },
			theme: { attribute: 'theme' },
			size: { attribute: 'size' },
			accent: { attribute: 'accent' },
			wave: { attribute: 'wave' },
			api: { attribute: 'api' }
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

	This file is ONLY compiled as a custom element by the element builds
	(vite.cdn.config.ts and vite.esm.config.ts, customElement: true). Svelte
	apps import PlayerCore directly from @showfm/embed/svelte. The native <slot> below is intentional and required:
	the element's light-DOM children (the fallback link authored in the embed
	snippet) can only be projected through a real shadow-DOM slot — Svelte
	snippets do not cross the custom-element boundary.
-->
<script lang="ts">
	import PlayerCore from './PlayerCore.svelte';
	import type { PlayerEpisodeData, PlayerSize, PlayerTheme } from './types';
	import { PLAYER_DEFAULT_API_URL } from './hosts';

	let {
		episode = '',
		podcast = '',
		theme = '',
		size = 'standard',
		accent = '',
		wave = '',
		api = PLAYER_DEFAULT_API_URL
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
	} = $props();

	let data = $state<PlayerEpisodeData | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');

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

	$effect(() => {
		const endpoint = episode
			? `${api}/v1/episodes/${encodeURIComponent(episode)}`
			: podcast
				? `${api}/v1/podcasts/${encodeURIComponent(podcast)}/episodes/latest`
				: null;
		if (!endpoint) {
			status = 'error';
			return;
		}
		let cancelled = false;
		status = 'loading';
		fetch(endpoint)
			.then((response) =>
				response.ok
					? (response.json() as Promise<{ data: PlayerEpisodeData }>)
					: Promise.reject(new Error(String(response.status)))
			)
			.then((json) => {
				if (!cancelled) {
					data = json.data;
					status = 'ready';
				}
			})
			.catch(() => {
				if (!cancelled) status = 'error';
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if status === 'ready' && data}
	<PlayerCore
		episode={data}
		theme={resolvedTheme}
		{size}
		accent={accent || null}
		wave={waveEnabled}
		sourceTag="embed"
	/>
{:else if status === 'loading'}
	<!-- The payload (and with it any show theme default) isn't here yet, so an
	     unpinned skeleton behaves like auto: prefers-color-scheme via CSS. -->
	<div
		class="skeleton theme-{pinnedTheme ?? 'auto'}"
		class:sk-compact={size === 'compact'}
		role="status"
		aria-label="Loading audio player"
	>
		<span class="pulse artwork-slot" class:artwork-compact={size === 'compact'}></span>
		<span class="pulse line"></span>
	</div>
{:else}
	<div class="fallback">
		<p>This episode can’t be loaded right now.</p>
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
	@media (prefers-color-scheme: dark) {
		.skeleton.theme-auto {
			background: #17151f;
			border-color: rgba(255, 255, 255, 0.1);
		}
	}
	.skeleton.theme-dark {
		background: #17151f;
		border-color: rgba(255, 255, 255, 0.1);
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
		.pulse {
			animation: none;
		}
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
