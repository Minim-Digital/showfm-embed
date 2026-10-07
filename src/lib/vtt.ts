/**
 * WebVTT parsing, shared by the listen pages and the transcript element.
 *
 * Moved from the show.fm app (src/lib/transcripts/vtt.ts at 0dfe9d9e), with
 * its tests. Three expressions there took quadratic time on hostile input
 * (32 seconds for 200 KB); they are linear scans here with the same results,
 * and a timed test on 200 KB of adversarial input guards them.
 *
 * The counterpart to render.ts: that module WRITES the published VTT from a
 * TranscriptArtifact, this one READS a published VTT back off
 * media.podcasterplus.com so the episode page can render a transcript.
 *
 * It must be tolerant, because two very different producers reach it:
 *  - our own renderVtt output, which is uniform and always carries a
 *    `<v Speaker>` voice span;
 *  - transcripts mirrored verbatim from a third-party feed on import
 *    (workers/podcast-import-executor), which may use NOTE/STYLE/REGION
 *    blocks, cue settings, positioning, nested tags, or no speakers at all.
 *
 * It must also tolerate a TRUNCATED file: the episode page server-renders an
 * excerpt from a Range request over the first few KB, so the final cue is
 * usually cut mid-payload. An incomplete trailing cue is dropped rather than
 * emitted with half a sentence.
 *
 * Pure and dependency-free (no $lib aliases, no SvelteKit imports) so it can
 * run in the SvelteKit server, the browser, and a worker alike.
 */

/**
 * One run of cue text carrying its own start time, recovered from an inline
 * WebVTT timestamp tag. Usually a single word (that is what renderVtt emits),
 * but a third-party file may time whole phrases, so the run is the unit.
 */
export interface VttWord {
	text: string;
	start: number;
	end: number;
}

/** One parsed cue. Times are absolute seconds into the episode audio. */
export interface VttCue {
	/** Zero-based position in the file, stable for keying and for seek targets. */
	index: number;
	start: number;
	end: number;
	/** Display name from a `<v …>` voice span, or null when the cue has none. */
	speaker: string | null;
	/** Payload with all tags stripped and entities decoded. */
	text: string;
	/**
	 * Word-level timings, when the cue carries inline timestamp tags. Absent
	 * for transcripts published before renderVtt emitted them and for imported
	 * files without them, which is why the reader must always be able to fall
	 * back to highlighting the whole cue.
	 */
	words?: VttWord[];
}

export interface ParseVttOptions {
	/** Stop after this many cues. Used by the server-rendered excerpt. */
	maxCues?: number;
}

/** `HH:MM:SS.mmm` or `MM:SS.mmm`, either side of the arrow, plus cue settings. */
const TIMING_LINE =
	/^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})(?:\s+.*)?$/;

/** Blocks that carry no cue payload and must be skipped wholesale. */
const NON_CUE_BLOCK = /^(NOTE|STYLE|REGION)\b/;

/** `<v Speaker>`, `<v.loud Speaker>`, and the rare unclosed `<v Speaker>` form. */
const VOICE_SPAN = /^<v(?:\.[^\s>]+)*\s+([^>]*)>/i;

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** `00:01:02.345` / `01:02,345` → seconds. Returns NaN for anything else. */
export function parseTimestamp(value: string): number {
	const parts = value.trim().replace(',', '.').split(':');
	if (parts.length < 2 || parts.length > 3) return NaN;
	const seconds = Number(parts.pop());
	const minutes = Number(parts.pop());
	const hours = parts.length ? Number(parts.pop()) : 0;
	if (!Number.isFinite(seconds) || !Number.isFinite(minutes) || !Number.isFinite(hours)) {
		return NaN;
	}
	return hours * 3600 + minutes * 60 + seconds;
}

function decodeEntities(value: string): string {
	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] === '#') {
			const codePoint =
				entity[1] === 'x' || entity[1] === 'X'
					? Number.parseInt(entity.slice(2), 16)
					: Number.parseInt(entity.slice(1), 10);
			// Reject non-characters rather than throwing out of fromCodePoint.
			if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
			return String.fromCodePoint(codePoint);
		}
		const named = NAMED_ENTITIES[entity.toLowerCase()];
		return named ?? match;
	});
}

/**
 * Strip cue payload markup: voice spans, class/bold/italic/underline/ruby
 * tags, and inline `<00:00:01.000>` karaoke timestamps. The speaker is
 * extracted before this runs, and the timings before that.
 */
function stripTags(payload: string): string {
	return decodeEntities(removeTags(payload)).replace(/\s+/g, ' ').trim();
}

/**
 * Removes every `<...>` run, exactly as `replace(/<[^>]*>/g, '')` would, in
 * linear time. The expression rescans to the end of the input from every
 * `<` that has no `>` after it, which is quadratic on a payload of `<`s.
 */
function removeTags(payload: string): string {
	let out = '';
	let cursor = 0;
	for (;;) {
		const open = payload.indexOf('<', cursor);
		if (open === -1) break;
		const close = payload.indexOf('>', open);
		// No `>` after this `<` means none after any later `<` either.
		if (close === -1) break;
		out += payload.slice(cursor, open);
		cursor = close + 1;
	}
	return out + payload.slice(cursor);
}

/**
 * Whether the payload opens a voice span that is never closed, the sign of
 * a cut payload. The same answer as `/<v[\s.][^>]*>/i` followed by a check
 * for `</v>`, in linear time.
 */
function hasUnclosedVoiceSpan(raw: string): boolean {
	const open = raw.search(/<v[\s.]/i);
	if (open === -1 || raw.indexOf('>', open + 3) === -1) return false;
	return !/<\/v>/i.test(raw);
}

/** An inline karaoke timestamp tag, e.g. `<00:00:02.500>`. */
const TIMESTAMP_TAG = /<((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})>/g;

/**
 * Split a cue payload on its inline timestamp tags into timed runs.
 *
 * Returns undefined when the cue has no tags at all, which is the signal to
 * the reader that this cue can only be highlighted whole. Runs whose start is
 * unparseable or out of order are folded into the previous run rather than
 * dropped, so a malformed tag costs precision and never text.
 */
function parseTimedRuns(payload: string, start: number, end: number): VttWord[] | undefined {
	TIMESTAMP_TAG.lastIndex = 0;
	if (!TIMESTAMP_TAG.test(payload)) return undefined;

	const runs: { text: string; start: number }[] = [];
	const push = (chunk: string, at: number) => {
		const text = stripTags(chunk);
		if (!text) return;
		const previous = runs[runs.length - 1];
		// Out-of-order or unparseable timing: append to the previous run so the
		// words still render, just without their own highlight step.
		if (!Number.isFinite(at) || (previous && at < previous.start)) {
			if (previous) previous.text = `${previous.text} ${text}`;
			else runs.push({ text, start });
			return;
		}
		runs.push({ text, start: at });
	};

	TIMESTAMP_TAG.lastIndex = 0;
	let cursor = 0;
	let runStart = start;
	let match: RegExpExecArray | null;
	while ((match = TIMESTAMP_TAG.exec(payload)) !== null) {
		push(payload.slice(cursor, match.index), runStart);
		runStart = parseTimestamp(match[1]);
		cursor = match.index + match[0].length;
	}
	push(payload.slice(cursor), runStart);

	if (runs.length === 0) return undefined;
	// A run ends where the next begins; the last one runs to the cue's end.
	return runs.map((run, i) => ({
		text: run.text,
		start: run.start,
		end: i + 1 < runs.length ? runs[i + 1].start : end
	}));
}

/**
 * The index of the timed run covering `time` within a cue, or -1.
 *
 * Cues hold at most a few dozen runs, so this scans rather than searching —
 * and it stops early, because runs are chronological.
 */
export function activeWordIndex(cue: VttCue, time: number): number {
	const words = cue.words;
	if (!words?.length || !Number.isFinite(time)) return -1;
	for (let i = 0; i < words.length; i += 1) {
		if (time < words[i].start) break;
		if (time < words[i].end) return i;
	}
	// Past the last run's end but still inside the cue: hold the final run so
	// the highlight does not blink off during a trailing pause.
	return time >= words[words.length - 1].start ? words.length - 1 : -1;
}

/**
 * Parse a WebVTT document into cues.
 *
 * Unparseable blocks are skipped silently rather than throwing: a transcript
 * is decoration on a public page, and one malformed cue in an imported file
 * must never take the page down.
 */
export function parseVtt(input: string, options: ParseVttOptions = {}): VttCue[] {
	if (!input) return [];
	const maxCues = options.maxCues ?? Number.POSITIVE_INFINITY;

	// Normalise line endings and strip a BOM, then split into blocks.
	const normalised = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const blocks = normalised.split(/\n{2,}/);

	const cues: VttCue[] = [];
	// A truncated file ends mid-block. Only the LAST block can be partial, and
	// only when the input did not end on a blank line.
	// The same test as /\n\s*$/, in linear time: a newline in the trailing
	// whitespace. The expression is quadratic on a long run of newlines.
	const trailing = normalised.slice(normalised.trimEnd().length);
	const endsCleanly = trailing.includes('\n');

	for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
		if (cues.length >= maxCues) break;

		const block = blocks[blockIndex];
		const isLastBlock = blockIndex === blocks.length - 1;
		const trimmed = block.trim();
		if (!trimmed) continue;
		if (NON_CUE_BLOCK.test(trimmed)) continue;

		const lines = trimmed.split('\n');
		// The timing line is either first, or second when a cue identifier
		// precedes it. Anything else (the WEBVTT header, stray metadata) has no
		// timing line and is skipped.
		let timingIndex = -1;
		let match: RegExpMatchArray | null = null;
		for (let i = 0; i < Math.min(lines.length, 2); i += 1) {
			const candidate = lines[i].match(TIMING_LINE);
			if (candidate) {
				timingIndex = i;
				match = candidate;
				break;
			}
		}
		if (!match || timingIndex === -1) continue;

		const start = parseTimestamp(match[1]);
		const end = parseTimestamp(match[2]);
		if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

		const payloadLines = lines.slice(timingIndex + 1);
		if (payloadLines.length === 0) continue;

		// A truncated final cue: keep the timing but not a half sentence.
		if (isLastBlock && !endsCleanly && cues.length + 1 < maxCues) {
			// Heuristic: our renderer closes every voice span, so an unclosed
			// `<v …>` means the payload was cut. Without voice spans we cannot
			// tell, so the cue is kept: worst case an excerpt ends mid-sentence.
			if (hasUnclosedVoiceSpan(payloadLines.join(' '))) continue;
		}

		const payload = payloadLines.join(' ');
		const voice = payload.match(VOICE_SPAN);
		const speaker = voice ? decodeEntities(voice[1]).trim() || null : null;
		const text = stripTags(payload);
		if (!text) continue;

		const words = parseTimedRuns(payload, start, end);
		cues.push({ index: cues.length, start, end, speaker, text, ...(words ? { words } : {}) });
	}

	return cues;
}

/** Distinct speaker names in first-appearance order, ignoring unattributed cues. */
export function distinctSpeakers(cues: VttCue[]): string[] {
	const seen: string[] = [];
	for (const cue of cues) {
		if (cue.speaker && !seen.includes(cue.speaker)) seen.push(cue.speaker);
	}
	return seen;
}

/** Whitespace-delimited word count across every cue. */
export function countWords(cues: VttCue[]): number {
	return cues.reduce((total, cue) => {
		const words = cue.text.trim();
		return total + (words ? words.split(/\s+/).length : 0);
	}, 0);
}

/**
 * The index of the cue covering `time`, or -1. Cues are in ascending start
 * order, so this binary-searches rather than scanning: it runs on every
 * timeupdate (about 4Hz) against transcripts of a few thousand cues.
 *
 * A time in a GAP between cues resolves to the cue just before it, so the
 * highlight holds through a pause instead of flickering off.
 */
export function activeCueIndex(cues: VttCue[], time: number): number {
	if (cues.length === 0 || !Number.isFinite(time) || time < cues[0].start) return -1;
	let low = 0;
	let high = cues.length - 1;
	let answer = -1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (cues[mid].start <= time) {
			answer = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return answer;
}

/** `m:ss` for the reading-mode gutter, `h:mm:ss` past an hour. */
export function formatCueTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
		: `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Fold case AND diacritics, so searching "cafe" finds "café".
 *
 * NFD splits an accented character into its base plus a combining mark, which
 * the range then strips. A listener typing on a phone keyboard rarely
 * produces the accented form, and a transcript of natural speech is full of
 * names that carry them.
 */
export function foldForSearch(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Case-insensitive, accent-insensitive match positions for reader search. */
export function matchingCueIndexes(cues: VttCue[], query: string): number[] {
	const needle = foldForSearch(query.trim());
	if (!needle) return [];
	const matches: number[] = [];
	for (const cue of cues) {
		if (foldForSearch(cue.text).includes(needle)) matches.push(cue.index);
	}
	return matches;
}
