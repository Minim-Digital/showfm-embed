/**
 * The transcript's pure logic (transcript.ts): lines, speakers, search,
 * stale word timings, times, and the virtualised list's arithmetic.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
	buildLines,
	clock,
	estimateHeight,
	findMatches,
	layoutOffsets,
	lineAt,
	speakerName,
	spokenTime,
	visibleLines,
	wordTimingsUsable
} from '../transcript';
import { parseVtt, type VttCue } from '../vtt';
import { conversationVtt } from '../../../tests/fixtures/transcript';

const cue = (
	index: number,
	text: string,
	speaker: string | null = null,
	words = false
): VttCue => ({
	index,
	start: index * 10,
	end: index * 10 + 9,
	speaker,
	text,
	...(words
		? {
				words: text
					.split(' ')
					.map((w, i) => ({ text: w, start: index * 10 + i, end: index * 10 + i + 1 }))
			}
		: {})
});

describe('lines', () => {
	it('shows a speaker’s name when their turn starts, and again when they return', () => {
		const lines = buildLines(
			[cue(0, 'a', 'Maya'), cue(1, 'b', 'Maya'), cue(2, 'c', 'Tom'), cue(3, 'd', 'Maya')],
			true
		);
		expect(lines.map((line) => line.showSpeaker)).toEqual([true, false, true, true]);
	});

	it('drops names the editor gives unlabelled speakers', () => {
		for (const name of ['Speaker A', 'speaker 2', 'SPEAKER_01', 'Spk-3']) {
			expect(speakerName(name)).toBeNull();
		}
		expect(speakerName('Speaker of the House')).toBe('Speaker of the House');
		expect(speakerName('  Tom ')).toBe('Tom');
		const lines = buildLines(
			[cue(0, 'a', 'Tom'), cue(1, 'b', 'Speaker B'), cue(2, 'c', 'Tom')],
			true
		);
		expect(lines.map((line) => [line.speaker, line.showSpeaker])).toEqual([
			['Tom', true],
			[null, false],
			['Tom', true]
		]);
	});

	it('uses word timings only when asked and when the cue has them', () => {
		const [timed, untimed] = buildLines(
			[cue(0, 'one two', null, true), cue(1, 'three four')],
			true
		);
		expect(timed.timed).toBe(true);
		expect(timed.words.map((word) => word.start)).toEqual([0, 1]);
		expect(untimed.timed).toBe(false);
		expect(untimed.words.map((word) => word.text)).toEqual(['three', 'four']);
		expect(buildLines([cue(0, 'one two', null, true)], false)[0].timed).toBe(false);
	});
});

describe('stale word timings', () => {
	it('are usable when every word sits inside its cue', () => {
		const { vtt, duration } = conversationVtt();
		expect(wordTimingsUsable(parseVtt(vtt), duration)).toBe(true);
	});

	it('fall back to lines when words leave their cues, or the cues outrun the audio', () => {
		const shifted = parseVtt(conversationVtt({ wordShift: 30 }).vtt);
		expect(wordTimingsUsable(shifted)).toBe(false);
		const { vtt, duration } = conversationVtt();
		expect(wordTimingsUsable(parseVtt(vtt), duration - 20)).toBe(false);
		// An unknown duration does not count against them.
		expect(wordTimingsUsable(parseVtt(vtt), 0)).toBe(true);
	});
});

describe('search', () => {
	const lines = buildLines(
		[cue(0, 'Bread keeps the lights on.'), cue(1, 'A café, and more bread; bread!')],
		false
	);

	it('finds every match in reading order, ignoring case', () => {
		expect(findMatches(lines, 'BREAD')).toEqual([
			{ line: 0, from: 0, to: 1 },
			{ line: 1, from: 4, to: 5 },
			{ line: 1, from: 5, to: 6 }
		]);
	});

	it('ignores accents, and a phrase covers every word it touches', () => {
		expect(findMatches(lines, 'cafe')).toEqual([{ line: 1, from: 1, to: 2 }]);
		expect(findMatches(lines, 'the lig')).toEqual([{ line: 0, from: 2, to: 4 }]);
	});

	it('finds nothing for an empty query', () => {
		expect(findMatches(lines, '   ')).toEqual([]);
	});

	it('searches 15,000 words quickly', () => {
		const long = buildLines(parseVtt(conversationVtt({ repeat: 66 }).vtt), true);
		const started = performance.now();
		expect(findMatches(long, 'bread').length).toBe(5 * 66);
		expect(performance.now() - started).toBeLessThan(200);
	});
});

describe('times', () => {
	it('clock: m:ss, and h:mm:ss past an hour', () => {
		expect(clock(0)).toBe('0:00');
		expect(clock(65.9)).toBe('1:05');
		expect(clock(3723)).toBe('1:02:03');
		expect(clock(Number.NaN)).toBe('0:00');
	});

	it('spoken: unit names from Intl in the language', () => {
		expect(spokenTime(842, 'en')).toBe('14 minutes 2 seconds');
		expect(spokenTime(3601, 'en')).toBe('1 hour 1 second');
		expect(spokenTime(0, 'en')).toBe('0 seconds');
		expect(spokenTime(62, 'de')).toBe('1 Minute 2 Sekunden');
		// French puts a no-break space between the number and the unit.
		expect(spokenTime(62, 'fr').replace(/\s/g, ' ')).toBe('1 minute 2 secondes');
		// A page's lang can be any text.
		expect(spokenTime(1, 'not a tag!')).toBe('1 second');
	});
});

describe('virtualisation', () => {
	it('estimates taller lines for longer text, and narrow boxes', () => {
		const [short, long] = buildLines(
			[cue(0, 'Hi.', 'Tom'), cue(1, 'word '.repeat(80).trim())],
			true
		);
		expect(estimateHeight(long, 560, false)).toBeGreaterThan(estimateHeight(short, 560, false));
		expect(estimateHeight(long, 340, true)).toBeGreaterThan(estimateHeight(long, 560, false));
	});

	it('offsets are running totals, and lineAt finds the line at a height', () => {
		const offsets = layoutOffsets([40, 60, 50]);
		expect([...offsets]).toEqual([0, 40, 100, 150]);
		expect(lineAt(offsets, 0)).toBe(0);
		expect(lineAt(offsets, 39)).toBe(0);
		expect(lineAt(offsets, 40)).toBe(1);
		expect(lineAt(offsets, 1000)).toBe(2);
	});

	it('renders the lines in view with overscan, plus pinned ones', () => {
		const offsets = layoutOffsets(Array.from({ length: 2000 }, () => 50));
		const lines = visibleLines(offsets, 50 * 1000, 320, [5, 1999, -1], 8);
		expect(lines[0]).toBe(5);
		expect(lines.at(-1)).toBe(1999);
		expect(lines).toContain(992);
		expect(lines).toContain(1014);
		expect(lines.length).toBeLessThan(40);
		expect(visibleLines(layoutOffsets([]), 0, 320)).toEqual([]);
	});

	it('keeps a 15,000-word transcript under 300 lines at any position', () => {
		const lines = buildLines(parseVtt(conversationVtt({ repeat: 66 }).vtt), true);
		const offsets = layoutOffsets(lines.map((line) => estimateHeight(line, 340, true)));
		for (const top of [0, offsets[lines.length] / 2, offsets[lines.length]]) {
			expect(visibleLines(offsets, top, 2000, [0, lines.length - 1]).length).toBeLessThan(300);
		}
	});
});
