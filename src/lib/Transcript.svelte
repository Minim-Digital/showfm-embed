<!--
	<showfm-transcript>: the follow-along transcript (embeds design page 3),
	mounted into the element's shadow root by transcript.svelte.ts.

	What it follows, in order:
	  episode="uuid"  that episode's transcript. It follows along whenever an
	                  element on the page plays that episode (the one named by
	                  `for`, if set), and reads as plain text otherwise.
	  for="id"        the player or list with that id: whatever it plays.
	  inside a player its own player (the player's transcript option).
	  neither         whatever plays on the page.

	States: idle (following, nothing played yet), loading, ready, error (Try
	again), suspended (the show's message, no actions), none (no transcript:
	none published, or audio hosted outside show.fm). With `episode`, none and
	a 404 collapse the element instead, so nothing leaks.

	The text area keeps its height in every state (`height`, 320 by default),
	so nothing on the host page moves. Only the lines near the one being
	spoken, plus the search match, the spoken line and the focused line, are
	in the DOM: a 15,000-word transcript stays under a hundred lines.

	Screen readers: nothing here is a live region except the search count.
	The spoken line is marked with aria-current, and only its timestamp is a
	button, so the transcript is not hundreds of tab stops.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { pageController, type AudioEntry, type ControllerEpisode } from './controller';
	import { PLAYER_DEFAULT_API_URL } from './hosts';
	import { apiGet, episodeEndpoint } from './api';
	import { DEFAULT_ACCENT, accessibleAccent, contrastRatio, mixHex, parseHex } from './contrast';
	import { paletteVars, resolvePalette } from './palette';
	import { formatString, languageFromTag, languageTagFor, resolveStrings } from './strings';
	import { loadLocale } from './locales/index';
	import { TRANSCRIPT_EN } from './transcript-strings';
	import { activeCueIndex, activeWordIndex } from './vtt';
	import { loadTranscript, type LoadedTranscript } from './transcript-data';
	import type { TranscriptEmbed } from './transcript.svelte';
	import {
		buildLines,
		clock,
		estimateHeight,
		findMatches,
		layoutOffsets,
		lineAt,
		spokenTime,
		visibleLines,
		wordTimingsUsable,
		type TranscriptLine,
		type TranscriptMatch
	} from './transcript';

	let {
		host: hostProp,
		attrs,
		strings = undefined,
		embed: embedProp = undefined
	}: {
		host: HTMLElement;
		attrs: Record<string, string | null>;
		strings?: unknown;
		/** Set by the player that mounts the transcript inside itself (transcript.svelte.ts). */
		embed?: TranscriptEmbed;
	} = $props();

	/** The scroll area's top padding: line `i` starts at PAD + offsets[i]. */
	const PAD = 8;
	const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];

	const controller = pageController();
	// The element never changes for a mounted transcript.
	const host = untrack(() => hostProp);
	// Inside a show.fm element's shadow root (the player's or the
	// mini-player's transcript option), that element is the one to follow,
	// and its colours are inherited.
	const rootNode = host.getRootNode();
	const embedHost =
		rootNode instanceof ShadowRoot && /^(SHOWFM|PODCASTERPLUS)-/.test(rootNode.host.tagName)
			? (rootNode.host as HTMLElement)
			: null;
	// Mounted by the player itself: it says which audio and episode, and the
	// transcript takes its colours from the player, as inside an element.
	const embed = untrack(() => embedProp) ?? null;
	const inside = !!(embed || embedHost);

	const attr = (name: string) => attrs[name]?.trim() || null;
	const episodeAttr = $derived(attr('episode'));
	const forId = $derived(attr('for'));
	const viewHeight = $derived(Math.min(2000, Math.max(120, Number(attr('height')) || 320)));
	const level = $derived(Number(attr('heading-level')));
	const heading = $derived(Number.isInteger(level) && level >= 2 && level <= 6);

	// ── strings ────────────────────────────────────────────────────────
	let localesLoaded = $state(0);
	const languageTag = $derived((void attrs, languageTagFor(host)));
	const language = $derived(languageFromTag(languageTag));
	const s = $derived((void localesLoaded, resolveStrings(language, strings)));
	const t = $derived((void localesLoaded, resolveStrings(language, strings, TRANSCRIPT_EN)));
	$effect(() => {
		let live = true;
		loadLocale(language).then((loaded) => {
			if (loaded && live) localesLoaded += 1;
		});
		return () => {
			live = false;
		};
	});

	// ── what to follow ─────────────────────────────────────────────────
	/** The audio being followed, or null (then the text reads without seeking). */
	let source = $state.raw<AudioEntry | null>(null);
	/** The followed audio's owner said the show is suspended (mid-listen, design page 5). */
	let suspendedNow = $state(false);
	/** The episode shown. It stays when its audio moves on, until another plays. */
	let shown = $state.raw<{ id: string; known: ControllerEpisode | null } | null>(null);

	function target(): Element | null {
		return forId ? document.getElementById(forId) : embedHost;
	}

	/**
	 * Counts the times the shown episode is heard playing (or asked to) on the
	 * page. A late answer about the episode (the API saying its show is
	 * suspended) is stale once the episode has played since it was asked.
	 */
	let heard = 0;

	function pick() {
		if (embed) {
			const audio = embed.audio();
			const next = (audio && controller.audios().find((entry) => entry.audio === audio)) || null;
			if (next !== source) source = next;
			suspendedNow = next?.message === 'suspended';
			if (shown?.id !== embed.episode.id) shown = { id: embed.episode.id, known: embed.episode };
			return;
		}
		const owner = target();
		const snapshot = controller.snapshot();
		const audios = controller.audios();
		// `for` names an element that is not on the page (yet, or any more):
		// nothing to follow, but a fixed `episode` still shows, and the
		// transcript follows the element once it is here and plays.
		const next =
			forId && !owner
				? null
				: (audios.find(
						(entry) =>
							entry.episode &&
							(!episodeAttr || entry.episode.id === episodeAttr) &&
							(owner
								? entry.owner === owner ||
									(entry.audio.getRootNode() as ShadowRoot).host === owner ||
									// The mini-player shows the page's shared audio, whoever started it.
									(owner.localName === 'showfm-mini-player' && entry === controller.sharedState())
								: // Following the page: only what is current.
									episodeAttr ||
									(entry.owner === snapshot.owner && entry.episode === snapshot.episode))
					) ?? null);
		if (next !== source) source = next;
		suspendedNow = next?.message === 'suspended';
		if (
			shown &&
			audios.some(
				(entry) =>
					entry.episode?.id === shown!.id &&
					(entry.state === 'playing' || entry.state === 'loading')
			)
		) {
			heard += 1;
		}
		const id = next?.episode?.id ?? episodeAttr ?? shown?.id ?? null;
		if (id && id !== shown?.id) shown = { id, known: next?.episode ?? null };
		else if (!id && shown) shown = null;
	}

	$effect(() => {
		void forId;
		void episodeAttr;
		// A new selector starts afresh: the episode the old one showed stays
		// only while the selector that found it does (a removed `episode`, or
		// a `for` naming an element that has not played, shows nothing old).
		untrack(() => {
			source = null;
			shown = null;
		});
		return controller.subscribe(() => untrack(pick));
	});

	// ── loading ────────────────────────────────────────────────────────
	let loaded = $state.raw<LoadedTranscript>({ status: 'idle' });
	let attempt = $state(0);
	const api = $derived(
		attr('api') ||
			target()?.getAttribute('api') ||
			embedHost?.getAttribute('api') ||
			PLAYER_DEFAULT_API_URL
	);

	/**
	 * Every async result belongs to one load of one episode. A new episode,
	 * a retry or an unmount starts a new generation, and a load, a recheck,
	 * or a scroll waiting for the DOM lands only in the generation it
	 * started in. So nothing about episode A ever shows on B.
	 */
	let generation = 0;

	$effect(() => {
		const episode = shown;
		void attempt;
		const load = ++generation;
		if (!episode) {
			loaded = { status: 'idle' };
			return;
		}
		// The API origin is live too: a new one is a new load.
		const origin = api;
		loaded = { status: 'loading' };
		loadTranscript(episode.id, episode.known, origin, !inside).then((result) => {
			if (load !== generation) return;
			if (!result.vttFailed) {
				loaded = result;
				return;
			}
			// The VTT failed. The show may have been suspended since: ask the API
			// once, as the list does when a row's audio fails. Not news if the
			// episode has played since the question was asked.
			const asked = heard;
			apiGet(episodeEndpoint(origin, episode.id)).then((check) => {
				if (load !== generation) return;
				loaded =
					check.status === 'unavailable' && heard === asked
						? { status: 'suspended', episode: result.episode }
						: result;
			});
		});
		return () => {
			generation += 1;
		};
	});

	// Suspended mid-listen: the text goes with the audio.
	const status = $derived(suspendedNow ? 'suspended' : loaded.status);
	const ready = $derived(status === 'ready');
	// With `episode`, a 404 and "no transcript" collapse the element: a
	// scheduled episode looks like any unknown one.
	const collapsed = $derived(!!episodeAttr && (status === 'gone' || status === 'none'));
	$effect(() => {
		host.toggleAttribute('data-showfm-collapsed', collapsed);
	});

	// ── colours (a standalone transcript; inside a player they are inherited) ──
	let systemDark = $state(false);
	$effect(() => {
		const query = window.matchMedia?.('(prefers-color-scheme: dark)');
		if (!query) return;
		systemDark = query.matches;
		const onChange = (event: MediaQueryListEvent) => (systemDark = event.matches);
		query.addEventListener?.('change', onChange);
		return () => query.removeEventListener?.('change', onChange);
	});
	// Inside an element that sets no 4.5:1 accent for text (the player), make
	// one from the colours it passes down, read once they have settled.
	let inherited = $state<string | undefined>(undefined);
	$effect(() => {
		void systemDark;
		if (!inside) return;
		const frame = requestAnimationFrame(() => {
			const style = getComputedStyle(host);
			const accent = style.getPropertyValue('--pp-accent').trim();
			const bg = style.getPropertyValue('--pp-bg').trim();
			if (style.getPropertyValue('--pp-accent-text').trim() || !parseHex(accent) || !parseHex(bg))
				return;
			const dark = contrastRatio(bg, '#ffffff') > contrastRatio(bg, '#000000');
			const surface = dark ? mixHex(bg, '#ffffff', 0.07) : mixHex(accent, bg, 0.92);
			inherited = `--pp-accent-text:${accessibleAccent(accent, surface, 4.5)}`;
		});
		return () => cancelAnimationFrame(frame);
	});
	const cssVars = $derived.by(() => {
		if (inside) return inherited;
		const podcast = loaded.episode?.podcast;
		// Its own attributes first, then what the element it follows pinned
		// (the controller carries that element's accent and theme), then the
		// show's settings.
		const known = shown?.known;
		const theme =
			[attr('theme'), known?.theme, podcast?.player_theme].find(
				(value) => value === 'light' || value === 'dark' || value === 'auto'
			) ?? 'auto';
		const dark = theme === 'dark' || (theme === 'auto' && systemDark);
		const accent = [attr('accent'), known?.accent].find((value) => value && parseHex(value));
		const palette = resolvePalette(
			accent ?? podcast?.player_color ?? podcast?.brand_color ?? DEFAULT_ACCENT,
			dark ? 'dark' : 'light'
		);
		// Text in the accent reaches 4.5:1 on the tint, the darkest surface it sits on.
		const text = accessibleAccent(
			palette.accent,
			dark ? mixHex(palette.bg, '#ffffff', 0.07) : palette.tint,
			4.5
		);
		return `${paletteVars(palette)};--pp-accent-text:${text}`;
	});

	// ── lines ──────────────────────────────────────────────────────────
	const duration = $derived(
		loaded.episode?.audio?.duration_seconds ?? shown?.known?.audio?.duration_seconds ?? 0
	);
	const cues = $derived(loaded.cues ?? []);
	// Stale word timings (audio replaced after transcription) fall back to lines.
	const lines = $derived(buildLines(cues, wordTimingsUsable(cues, duration || 0)));

	// ── following the audio ────────────────────────────────────────────
	let time = $state(0);
	const linked = $derived(ready && !!source && source.episode?.id === shown?.id);
	$effect(() => {
		const audio = linked ? source!.audio : null;
		if (!audio) return;
		let frame = 0;
		const update = () => {
			time = audio.currentTime || 0;
		};
		// Word by word needs more than timeupdate's four a second.
		const loop = () => {
			update();
			frame =
				!audio.paused && typeof requestAnimationFrame === 'function'
					? requestAnimationFrame(loop)
					: 0;
		};
		const start = () => {
			if (frame) cancelAnimationFrame(frame);
			loop();
		};
		const events = ['timeupdate', 'seeked', 'pause', 'ended'];
		for (const type of events) audio.addEventListener(type, update);
		audio.addEventListener('play', start);
		start();
		return () => {
			if (frame) cancelAnimationFrame(frame);
			for (const type of events) audio.removeEventListener(type, update);
			audio.removeEventListener('play', start);
		};
	});
	// Nothing is "now" until the audio has moved: a player at rest is not at line one.
	const current = $derived(linked && time > 0 ? activeCueIndex(cues, time) : -1);
	const currentWord = $derived(
		current >= 0 && lines[current]?.timed ? activeWordIndex(cues[current], time) : -1
	);

	// ── search ─────────────────────────────────────────────────────────
	let query = $state('');
	let matchIndex = $state(0);
	const searching = $derived(!!query.trim());
	const matches = $derived(searching ? findMatches(lines, query) : []);
	const active = $derived<TranscriptMatch | null>(
		matches[Math.min(matchIndex, matches.length - 1)] ?? null
	);
	const hits = $derived.by(() => {
		const byLine: Record<number, TranscriptMatch[]> = {};
		for (const match of matches) (byLine[match.line] ??= []).push(match);
		return byLine;
	});

	// ── layout: only the lines near now are in the DOM ─────────────────
	let scroller = $state<HTMLElement | null>(null);
	let scrollTop = $state(0);
	let width = $state(0);
	const narrow = $derived(width > 0 && width < 400);
	/** Measured heights by line; estimates stand in until a line renders. */
	let measured: Record<number, number> = {};
	let version = $state(0);
	const heights = $derived.by(() => {
		void version;
		return lines.map((line, i) => measured[i] ?? estimateHeight(line, width || 560, narrow));
	});
	const offsets = $derived(layoutOffsets(heights));
	let focused = $state(-1);
	const rendered = $derived(
		visibleLines(offsets, Math.max(0, scrollTop - PAD), viewHeight, [
			current,
			active?.line ?? -1,
			focused
		])
	);

	// A new transcript, or text that wraps differently, is measured afresh.
	$effect(() => {
		void lines;
		void narrow;
		void width;
		measured = {};
		untrack(() => (version += 1));
	});

	$effect(() => {
		const box = scroller;
		if (!box || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => (width = box.clientWidth));
		observer.observe(box);
		width = box.clientWidth;
		return () => observer.disconnect();
	});

	// A line that changes size later (a web font arrives, the box resizes).
	const lineObserver =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver((entries) => measure(entries.map((entry) => entry.target)));

	/** Takes the real heights of drawn lines in place of their estimates. */
	function measure(elements: Element[]) {
		const anchor = lineAt(offsets, Math.max(0, scrollTop - PAD));
		const within = scrollTop - offsets[anchor];
		let changed = false;
		for (const element of elements as HTMLElement[]) {
			const index = Number(element.dataset.i);
			const height = element.offsetHeight;
			if (height && measured[index] !== height) {
				measured[index] = height;
				changed = true;
			}
		}
		if (!changed || !scroller) return;
		version += 1;
		// Keep what the visitor is reading where it is, or keep following.
		if (!detached && current >= 0) scrollToLine(current, false);
		else if (Math.abs(offsets[anchor] + within - scrollTop) > 1) {
			scroller.scrollTop = offsets[anchor] + within;
		}
	}

	$effect(() => () => lineObserver?.disconnect());

	function reducedMotion() {
		return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	}

	function scrollToLine(index: number, smooth: boolean) {
		const box = scroller;
		if (!box || index < 0 || index >= lines.length) return;
		const top = Math.max(0, PAD + offsets[index] - viewHeight * 0.28);
		// A long way off, gliding would render every line in between.
		const glide = smooth && !reducedMotion() && Math.abs(top - box.scrollTop) < viewHeight * 3;
		if (glide && box.scrollTo) box.scrollTo({ top, behavior: 'smooth' });
		else box.scrollTop = top;
		scrollTop = box.scrollTop;
	}

	// ── following, and "Back to now" ───────────────────────────────────
	/** The visitor scrolled away (or is searching): the text stops following. */
	let detached = $state(false);
	const nowAbove = $derived(current >= 0 && PAD + offsets[current] < scrollTop);
	const showBack = $derived(detached && current >= 0);

	// Follow the spoken line. Runs once per line, not on every frame.
	$effect(() => {
		const index = current;
		if (index < 0 || detached || !scroller) return;
		const now = generation;
		untrack(() => tick().then(() => now === generation && scrollToLine(index, true)));
	});

	function onUserScroll() {
		if (ready) detached = true;
	}

	function onScrollKey(event: KeyboardEvent) {
		if (SCROLL_KEYS.includes(event.key) && event.target === scroller) onUserScroll();
	}

	function backToNow() {
		detached = false;
		scrollToLine(current, true);
		// The button goes; keep the keyboard in the transcript.
		scroller?.focus({ preventScroll: true });
	}

	// ── seeking ────────────────────────────────────────────────────────
	function seek(index: number) {
		const line = lines[index];
		if (!line || !linked || !source) return;
		// Selecting text is not a request to jump.
		if (String(window.getSelection?.() ?? '')) return;
		// A hair past the start, so the line is the current one at once.
		source.audio.currentTime = line.start + 0.01;
		time = line.start + 0.01;
		detached = false;
		scrollToLine(index, true);
	}

	function onLinesClick(event: MouseEvent) {
		const line = (event.target as Element).closest<HTMLElement>('[data-i]');
		if (line) seek(Number(line.dataset.i));
	}

	function onFocusIn(event: FocusEvent) {
		const line = (event.target as Element).closest<HTMLElement>('[data-i]');
		focused = line ? Number(line.dataset.i) : -1;
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Element | null;
		if (!next?.closest?.('[data-i]')) focused = -1;
	}

	// ── search actions ─────────────────────────────────────────────────
	function onQuery(value: string) {
		query = value;
		matchIndex = 0;
		const now = generation;
		detached = searching;
		void tick().then(() => {
			if (now !== generation) return;
			if (searching) {
				if (active) scrollToLine(active.line, true);
			} else scrollToLine(current, true);
		});
	}

	function step(by: number) {
		if (!matches.length) return;
		matchIndex = (Math.min(matchIndex, matches.length - 1) + by + matches.length) % matches.length;
		detached = true;
		const now = generation;
		void tick().then(() => now === generation && active && scrollToLine(active.line, true));
	}

	function clearSearch() {
		onQuery('');
	}

	function onSearchKey(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			step(event.shiftKey ? -1 : 1);
		} else if (event.key === 'Escape' && query) {
			event.preventDefault();
			clearSearch();
		}
	}

	// ── try again ──────────────────────────────────────────────────────
	let refocus = false;
	function retry(event: MouseEvent) {
		refocus = (event.currentTarget as HTMLElement).matches(':focus');
		attempt += 1;
	}
	// Try again goes with the message: focus follows to the text.
	$effect(() => {
		if (ready && scroller && refocus) {
			refocus = false;
			scroller.focus();
		}
	});

	// On arriving, or a new episode, start at the spoken line.
	$effect(() => {
		if (!scroller || !ready) return;
		void lines;
		untrack(() => {
			detached = searching;
			if (current >= 0) scrollToLine(current, false);
			else scroller!.scrollTop = scrollTop = 0;
		});
	});

	function jumpLabel(line: TranscriptLine) {
		return formatString(line.speaker ? t.jumpTo : t.jumpToTime, {
			time: spokenTime(line.start, languageTag || 'en'),
			speaker: line.speaker ?? ''
		});
	}

	// ── drawing the lines ──────────────────────────────────────────────
	// By hand rather than with {#each}: the chunks may share only v1.js's
	// Svelte runtime, and v1.js has no {#each} (CONTRIBUTING.md). A line is
	// drawn once and patched in place, so a focused timestamp keeps focus.
	let linesBox = $state<HTMLElement | null>(null);
	let drawn: Record<number, { el: HTMLElement; key: string }> = {};
	let drawnFor: [TranscriptLine[], HTMLElement] | null = null;

	const WAVE_ICON =
		'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg>';

	function wordClass(line: TranscriptLine, word: number): string {
		if (line.index === current && word === currentWord) return 'now';
		for (const match of hits[line.index] ?? []) {
			if (word >= match.from && word < match.to) return match === active ? 'hit act' : 'hit';
		}
		return '';
	}

	function drawLine(line: TranscriptLine, el: HTMLElement | null): HTMLElement {
		const now = line.index === current;
		if (!el) {
			el = document.createElement('div');
			el.dataset.i = String(line.index);
			el.innerHTML = '<span class="ts"></span><p class="txt"></p>';
			if (line.showSpeaker) {
				const speaker = document.createElement('span');
				speaker.className = 'spk';
				speaker.textContent = line.speaker;
				el.firstChild!.after(speaker);
			}
			lineObserver?.observe(el);
		}
		el.className = `line${now ? ' now' : ''}${linked ? ' seek' : ''}`;
		if (now) el.setAttribute('aria-current', 'true');
		else el.removeAttribute('aria-current');
		// Only the timestamp is a button, and only when there is audio to seek.
		let stamp = el.firstElementChild as HTMLElement;
		if ((stamp.tagName === 'BUTTON') !== linked) {
			const next = document.createElement(linked ? 'button' : 'span');
			stamp.replaceWith(next);
			stamp = next;
			stamp.className = 'ts';
			if (linked) stamp.setAttribute('type', 'button');
		}
		if (linked) stamp.setAttribute('aria-label', jumpLabel(line));
		stamp.innerHTML = now ? WAVE_ICON : '';
		stamp.append(clock(line.start));
		const text = el.lastElementChild as HTMLElement;
		if (now || hits[line.index]) {
			text.replaceChildren();
			line.words.forEach((word, i) => {
				const span = document.createElement('span');
				span.className = wordClass(line, i);
				span.textContent = word.text;
				text.append(span, ' ');
			});
		} else text.textContent = line.text;
		return el;
	}

	$effect(() => {
		const box = linesBox;
		if (!box) return;
		if (drawnFor?.[0] !== lines || drawnFor[1] !== box) {
			for (const index in drawn) drawn[index].el.remove();
			drawn = {};
			drawnFor = [lines, box];
		}
		const keep: Record<number, true> = {};
		for (const index of rendered) {
			keep[index] = true;
			const line = lines[index];
			const now = index === current;
			// Everything a line's drawing depends on: redraw only when it changes.
			const key = [
				now && currentWord,
				linked && jumpLabel(line),
				hits[index]?.map((match) => `${match.from}-${match.to}${match === active ? '!' : ''}`)
			].join('|');
			const old = drawn[index];
			if (!old || old.key !== key) {
				const el = drawLine(line, old?.el ?? null);
				if (!old) box.append(el);
				drawn[index] = { el, key };
			}
			drawn[index].el.style.top = `${offsets[index]}px`;
		}
		for (const index in drawn) {
			if (!keep[index]) {
				lineObserver?.unobserve(drawn[index].el);
				drawn[index].el.remove();
				delete drawn[index];
			}
		}
		// Measured now, before the browser paints, so no line ever shows at
		// its estimate and then moves.
		untrack(() => measure(rendered.map((index) => drawn[index].el)));
	});
	$effect(() => () => {
		drawn = {};
		drawnFor = null;
	});
</script>

{#snippet icon(d: string)}
	<svg
		width="15"
		height="15"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.9"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path {d}></path></svg
	>
{/snippet}

<div
	class="tr"
	class:card={!inside}
	class:narrow
	role="region"
	aria-label={s.transcript}
	style={cssVars}
	part="card"
>
	<div class="head">
		<!-- A heading only when heading-level asks for one (a role, which costs
		     v1.js nothing, where <svelte:element> would). -->
		<span
			class="label"
			role={heading ? 'heading' : undefined}
			aria-level={heading ? level : undefined}>{s.transcript}</span
		>
		<div class="find">
			<label class="field">
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					aria-hidden="true"
					><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg
				>
				<input
					type="search"
					value={query}
					oninput={(event) => onQuery(event.currentTarget.value)}
					onkeydown={onSearchKey}
					placeholder={t.searchTranscript}
					aria-label={t.searchTranscript}
					disabled={!ready}
					autocomplete="off"
				/>
			</label>
			{#if searching && ready}
				<span class="count" aria-live="polite"
					>{matches.length
						? formatString(t.matchCount, {
								n: Math.min(matchIndex, matches.length - 1) + 1,
								total: matches.length
							})
						: t.noMatches}</span
				>
				<button
					type="button"
					class="icon"
					aria-label={t.previousMatch}
					disabled={!matches.length}
					onclick={() => step(-1)}>{@render icon('m18 15-6-6-6 6')}</button
				>
				<button
					type="button"
					class="icon"
					aria-label={t.nextMatch}
					disabled={!matches.length}
					onclick={() => step(1)}>{@render icon('m6 9 6 6 6-6')}</button
				>
				<button type="button" class="icon clear" aria-label={t.clearSearch} onclick={clearSearch}
					>{@render icon('M18 6 6 18M6 6l12 12')}</button
				>
			{/if}
		</div>
	</div>

	{#if ready}
		<!-- A scrolling region must be focusable, so the keyboard can scroll it. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={scroller}
			class="scroll"
			style="height:{viewHeight}px"
			role="group"
			aria-label={t.transcriptText}
			tabindex="0"
			onscroll={() => (scrollTop = scroller?.scrollTop ?? 0)}
			onwheel={onUserScroll}
			ontouchmove={onUserScroll}
			onkeydown={onScrollKey}
			onpointerdown={(event) => event.target === scroller && onUserScroll()}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<!-- The lines are drawn by drawLines() below: only those near now. -->
			<div
				bind:this={linesBox}
				class="lines"
				style="height:{offsets[lines.length]}px"
				onclick={onLinesClick}
				onfocusin={onFocusIn}
				onfocusout={onFocusOut}
			></div>
		</div>
		{#if showBack}
			<div class="back-wrap">
				<button type="button" class="back" onclick={backToNow}>
					{@render icon(nowAbove ? 'm5 12 7-7 7 7M12 19V5' : 'M12 5v14m7-7-7 7-7-7')}
					{formatString(t.backToNow, { time: clock(time) })}
				</button>
			</div>
		{/if}
	{:else if status === 'loading'}
		<div
			class="msg skel"
			style="height:{viewHeight}px"
			role="status"
			aria-label={t.loadingTranscript}
		>
			<div><span></span><span></span><span></span></div>
			<div><span></span><span></span><span></span></div>
			<div><span></span><span></span><span></span></div>
			<div><span></span><span></span><span></span></div>
		</div>
	{:else if status === 'error'}
		<div class="msg" style="height:{viewHeight}px" role="alert">
			<p>{t.transcriptError}</p>
			<button type="button" class="retry" onclick={retry}>{s.retry}</button>
		</div>
	{:else}
		<div
			class="msg"
			style="height:{viewHeight}px"
			role={status === 'suspended' ? 'status' : undefined}
		>
			<p>
				{status === 'suspended'
					? s.suspended
					: status === 'idle'
						? t.transcriptIdle
						: t.transcriptNone}
			</p>
		</div>
	{/if}
</div>
