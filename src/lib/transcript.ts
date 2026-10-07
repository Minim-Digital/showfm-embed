/**
 * The transcript's pure logic: lines built from parsed cues, search,
 * whether word timings can be trusted, spoken times, and the arithmetic of
 * the virtualised list (which lines to render and where they sit).
 *
 * No DOM and no Svelte, so it is tested on its own and the transcript chunk
 * (Transcript.svelte) stays about presentation.
 */
import { foldForSearch, type VttCue } from './vtt.js';

/** One run of a line's text: a timed word (or phrase), or an untimed word. */
export interface LineWord {
	text: string;
	/** Seconds into the episode; NaN when the line has no word timings. */
	start: number;
}

export interface TranscriptLine {
	index: number;
	start: number;
	end: number;
	/** The speaker to show, or null when unlabelled. */
	speaker: string | null;
	/** Whether this line starts a new speaker's turn (the name row shows). */
	showSpeaker: boolean;
	/** The line's text, as it reads. */
	text: string;
	words: LineWord[];
	/** Whether `words` carry their own times (word-by-word follow-along). */
	timed: boolean;
	/** `text` folded for search, and where each word starts in it. */
	folded: string;
	offsets: number[];
}

/**
 * Speaker names the transcript editor gives unlabelled speakers ("Speaker A",
 * "Speaker 2", "SPEAKER_01"). The design drops the name row for these rather
 * than show them.
 */
const UNLABELLED = /^(speaker|spk)[\s_-]*[a-z0-9]{1,3}$/i;

export function speakerName(speaker: string | null | undefined): string | null {
	const name = speaker?.trim();
	return name && !UNLABELLED.test(name) ? name : null;
}

/**
 * Whether the cues' word timings can be trusted. A word outside its own cue,
 * or a transcript that runs past the end of the audio, is the sign of an
 * audio file replaced after transcription (plan section 6): highlighting the
 * wrong word is worse than none, so the transcript falls back to lines.
 * `duration` is the audio's length in seconds, 0 or NaN when unknown.
 */
export function wordTimingsUsable(cues: readonly VttCue[], duration = 0): boolean {
	const last = cues[cues.length - 1];
	if (last && duration > 0 && last.end > duration + 5) return false;
	for (const cue of cues) {
		for (const word of cue.words ?? []) {
			if (word.start < cue.start - 0.5 || word.start > cue.end + 0.5) return false;
		}
	}
	return true;
}

/** The transcript's lines, with word timings only when `timings` is true. */
export function buildLines(cues: readonly VttCue[], timings: boolean): TranscriptLine[] {
	let previous: string | null = null;
	return cues.map((cue, index) => {
		const timed = timings && !!cue.words?.length;
		const words: LineWord[] = timed
			? cue.words!.map((word) => ({ text: word.text, start: word.start }))
			: cue.text.split(/\s+/).map((text) => ({ text, start: NaN }));
		const offsets: number[] = [];
		let folded = '';
		for (const word of words) {
			if (folded) folded += ' ';
			offsets.push(folded.length);
			folded += foldForSearch(word.text);
		}
		const speaker = speakerName(cue.speaker);
		const showSpeaker = !!speaker && speaker !== previous;
		// An unlabelled turn still ends the previous speaker's, so a name shows
		// again when they come back.
		previous = speaker ?? (cue.speaker ? '' : previous);
		return {
			index,
			start: cue.start,
			end: cue.end,
			speaker,
			showSpeaker,
			text: words.map((word) => word.text).join(' '),
			words,
			timed,
			folded,
			offsets
		};
	});
}

/** One search match: a line, and the words it covers (`to` exclusive). */
export interface TranscriptMatch {
	line: number;
	from: number;
	to: number;
}

/**
 * Every match of `query` in the lines, in reading order. Case and accents
 * are ignored ("cafe" finds "Café"); a match covers every word it touches.
 */
export function findMatches(lines: readonly TranscriptLine[], query: string): TranscriptMatch[] {
	const needle = foldForSearch(query.trim());
	const matches: TranscriptMatch[] = [];
	if (!needle) return matches;
	for (const line of lines) {
		let at = line.folded.indexOf(needle);
		while (at !== -1) {
			const end = at + needle.length;
			let from = 0;
			while (from + 1 < line.offsets.length && line.offsets[from + 1] <= at) from++;
			let to = from + 1;
			while (to < line.offsets.length && line.offsets[to] < end) to++;
			matches.push({ line: line.index, from, to });
			at = line.folded.indexOf(needle, end);
		}
	}
	return matches;
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function clock(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds || 0));
	const minutes = Math.floor(total / 60) % 60;
	const rest = String(total % 60).padStart(2, '0');
	return total >= 3600
		? `${Math.floor(total / 3600)}:${String(minutes).padStart(2, '0')}:${rest}`
		: `${minutes}:${rest}`;
}

/** "14 minutes 2 seconds", "14 Minuten 2 Sekunden": the unit names come from Intl. */
export function spokenTime(seconds: number, language: string): string {
	const total = Math.max(0, Math.floor(seconds || 0));
	const parts: [number, string][] = [
		[Math.floor(total / 3600), 'hour'],
		[Math.floor(total / 60) % 60, 'minute'],
		[total % 60, 'second']
	];
	return parts
		.filter(([value, unit]) => value || (unit === 'second' && total === 0))
		.map(([value, unit]) => {
			try {
				return new Intl.NumberFormat(language, {
					style: 'unit',
					unit,
					unitDisplay: 'long'
				}).format(value);
			} catch {
				return `${value} ${unit}${value === 1 ? '' : 's'}`;
			}
		})
		.join(' ');
}

// ── virtualisation ────────────────────────────────────────────────────

/** The line metrics the estimates use, in px (Transcript.svelte's styles). */
export const METRICS = {
	wide: { pad: 16, lineHeight: 24, speaker: 22, gutter: 64, char: 7.6 },
	narrow: { pad: 14, lineHeight: 21.7, speaker: 0, gutter: 0, char: 7.1, head: 26 }
};

/**
 * A line's height before it has been measured: its text wrapped at an
 * average character width. Measuring corrects it as soon as it renders.
 */
export function estimateHeight(line: TranscriptLine, width: number, narrow: boolean): number {
	const m = narrow ? METRICS.narrow : METRICS.wide;
	const textWidth = Math.max(80, width - 20 - m.gutter - 18);
	const rows = Math.max(1, Math.ceil((line.text.length * m.char) / textWidth));
	return Math.round(
		m.pad +
			rows * m.lineHeight +
			(narrow ? METRICS.narrow.head : line.showSpeaker ? METRICS.wide.speaker : 0)
	);
}

/** Running totals: `offsets[i]` is where line `i` starts; the last entry is the total. */
export function layoutOffsets(heights: readonly number[]): Float64Array {
	const offsets = new Float64Array(heights.length + 1);
	for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i];
	return offsets;
}

/** The line at `y` (the last line that starts at or before it). */
export function lineAt(offsets: Float64Array, y: number): number {
	let low = 0;
	let high = offsets.length - 2;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (offsets[mid] <= y) low = mid;
		else high = mid - 1;
	}
	return Math.max(0, low);
}

/**
 * The lines to render: those in view plus `overscan` either side, and any
 * `pinned` ones (the line being spoken, the active search match, the line
 * that holds focus), so they exist to scroll to and focus never drops.
 */
export function visibleLines(
	offsets: Float64Array,
	scrollTop: number,
	viewport: number,
	pinned: readonly number[] = [],
	overscan = 8
): number[] {
	const count = offsets.length - 1;
	if (count <= 0) return [];
	const first = Math.max(0, lineAt(offsets, scrollTop) - overscan);
	const last = Math.min(count - 1, lineAt(offsets, scrollTop + viewport) + overscan);
	const lines = new Set<number>();
	for (let i = first; i <= last; i++) lines.add(i);
	for (const i of pinned) if (i >= 0 && i < count) lines.add(i);
	return [...lines].sort((a, b) => a - b);
}
