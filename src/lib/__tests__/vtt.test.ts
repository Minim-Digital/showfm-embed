/**
 * WebVTT parsing, moved from the show.fm app with these tests unchanged,
 * plus a timed run on adversarial input at the end.
 *
 * Two producers reach this parser and both are covered here: our own
 * renderVtt output (uniform, always voice-spanned) and third-party files
 * mirrored on import (NOTE blocks, cue settings, no speakers, entities).
 * The truncation cases matter most: the episode page parses an excerpt taken
 * from a Range request, so the final cue is routinely cut mid-payload.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
	activeCueIndex,
	activeWordIndex,
	countWords,
	distinctSpeakers,
	formatCueTime,
	matchingCueIndexes,
	parseTimestamp,
	parseVtt
} from '../vtt';

/** Exactly the shape renderVtt emits. */
const OURS = `WEBVTT

1
00:00:00.780 --> 00:00:02.980
<v Maximus>My name is Maximus Decimus Meridius.</v>

2
00:00:03.800 --> 00:00:05.260
<v Maximus>Commander of the armies of the North.</v>

3
00:00:05.700 --> 00:00:09.120
<v Lucilla>Father to a murdered son, husband to a murdered wife.</v>
`;

describe('parseVtt on our own published format', () => {
	it('parses cues with times, speakers and text', () => {
		const cues = parseVtt(OURS);
		expect(cues).toHaveLength(3);
		expect(cues[0]).toEqual({
			index: 0,
			start: 0.78,
			end: 2.98,
			speaker: 'Maximus',
			text: 'My name is Maximus Decimus Meridius.'
		});
		expect(cues[2].speaker).toBe('Lucilla');
	});

	it('honours maxCues for the server-rendered excerpt', () => {
		expect(parseVtt(OURS, { maxCues: 2 })).toHaveLength(2);
	});
});

describe('parseVtt tolerance for imported files', () => {
	it('skips the header, NOTE, STYLE and REGION blocks', () => {
		const cues = parseVtt(`WEBVTT - Imported

NOTE
This transcript was produced by a third party.

STYLE
::cue { color: peachpuff; }

REGION
id:fred width:40%

00:00:01.000 --> 00:00:02.000
Hello there.
`);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe('Hello there.');
	});

	it('accepts cues with no identifier line and with cue settings', () => {
		const cues = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000 align:start position:10%
Positioned cue.
`);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe('Positioned cue.');
	});

	it('accepts MM:SS.mmm timings and comma decimals', () => {
		const cues = parseVtt(`WEBVTT

01:02.500 --> 01:04,750
Short form.
`);
		expect(cues[0].start).toBeCloseTo(62.5);
		expect(cues[0].end).toBeCloseTo(64.75);
	});

	it('strips nested tags, inline karaoke timestamps and decodes entities', () => {
		const cues = parseVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Ana><b>Rock</b> <00:00:02.000><i>&amp;</i> roll &lt;live&gt; &#39;96</v>
`);
		expect(cues[0].speaker).toBe('Ana');
		expect(cues[0].text).toBe("Rock & roll <live> '96");
	});

	it('leaves speaker null when the file has no voice spans', () => {
		const cues = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
An unattributed line.
`);
		expect(cues[0].speaker).toBeNull();
	});

	it('joins a multi-line payload into one cue', () => {
		const cues = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:04.000
<v Ana>First line
second line</v>
`);
		expect(cues[0].text).toBe('First line second line');
	});

	it('skips malformed blocks instead of throwing', () => {
		const cues = parseVtt(`WEBVTT

1
not-a-timing-line
Orphaned payload.

2
00:00:01.000 --> 00:00:02.000
Good cue.

3
99:bad --> also:bad
Broken timing.
`);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe('Good cue.');
	});

	it('returns an empty array for empty or junk input', () => {
		expect(parseVtt('')).toEqual([]);
		expect(parseVtt('not a transcript at all')).toEqual([]);
	});
});

describe('parseVtt on a truncated file (the Range-request excerpt)', () => {
	it('drops a trailing cue whose voice span was cut mid-payload', () => {
		// No trailing newline: the file was sliced by a byte range.
		const truncated = `WEBVTT

1
00:00:00.780 --> 00:00:02.980
<v Maximus>A complete cue.</v>

2
00:00:03.800 --> 00:00:05.260
<v Maximus>This sentence was cut off half`;
		const cues = parseVtt(truncated);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe('A complete cue.');
	});

	it('keeps a trailing cue that happens to be complete', () => {
		const cues = parseVtt(`WEBVTT

1
00:00:00.780 --> 00:00:02.980
<v Maximus>A complete cue.</v>`);
		expect(cues).toHaveLength(1);
	});

	it('keeps the trailing cue when the file has no voice spans to judge by', () => {
		// Without a `<v>` there is no signal that the text was cut, so the cue
		// is kept rather than silently dropping real content.
		const cues = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
Plain text cue possibly cut`);
		expect(cues).toHaveLength(1);
	});
});

describe('derived helpers', () => {
	const cues = parseVtt(OURS);

	it('lists distinct speakers in first-appearance order', () => {
		expect(distinctSpeakers(cues)).toEqual(['Maximus', 'Lucilla']);
		expect(
			distinctSpeakers(parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNo speaker.\n'))
		).toEqual([]);
	});

	it('counts words across cues', () => {
		expect(countWords(cues)).toBe(6 + 7 + 10);
		expect(countWords([])).toBe(0);
	});

	it('formats gutter timestamps, adding hours only past an hour', () => {
		expect(formatCueTime(0)).toBe('0:00');
		expect(formatCueTime(9)).toBe('0:09');
		expect(formatCueTime(75)).toBe('1:15');
		expect(formatCueTime(3675)).toBe('1:01:15');
		expect(formatCueTime(Number.NaN)).toBe('0:00');
		expect(formatCueTime(-5)).toBe('0:00');
	});

	it('parses timestamps and rejects junk', () => {
		expect(parseTimestamp('00:00:02.500')).toBeCloseTo(2.5);
		expect(parseTimestamp('1:00:00.000')).toBe(3600);
		expect(Number.isNaN(parseTimestamp('nope'))).toBe(true);
	});
});

describe('activeCueIndex', () => {
	const cues = parseVtt(OURS);

	it('returns -1 before the first cue starts', () => {
		expect(activeCueIndex(cues, 0)).toBe(-1);
		expect(activeCueIndex(cues, 0.5)).toBe(-1);
	});

	it('finds the cue covering the current time', () => {
		expect(activeCueIndex(cues, 0.78)).toBe(0);
		expect(activeCueIndex(cues, 2.0)).toBe(0);
		expect(activeCueIndex(cues, 4.0)).toBe(1);
		expect(activeCueIndex(cues, 8.0)).toBe(2);
	});

	it('holds the previous cue through a gap rather than flickering off', () => {
		// 3.2s falls between cue 0 (ends 2.98) and cue 1 (starts 3.8).
		expect(activeCueIndex(cues, 3.2)).toBe(0);
	});

	it('holds the last cue past the end of the transcript', () => {
		expect(activeCueIndex(cues, 9999)).toBe(2);
	});

	it('is safe on an empty transcript or a NaN time', () => {
		expect(activeCueIndex([], 5)).toBe(-1);
		expect(activeCueIndex(cues, Number.NaN)).toBe(-1);
	});
});

describe('matchingCueIndexes', () => {
	const cues = parseVtt(OURS);

	it('matches case-insensitively and returns cue indexes', () => {
		expect(matchingCueIndexes(cues, 'MURDERED')).toEqual([2]);
		expect(matchingCueIndexes(cues, 'maximus')).toEqual([0]);
		expect(matchingCueIndexes(cues, 'armies')).toEqual([1]);
	});

	it('matches across several cues and matches inside words', () => {
		// Substring, not word-boundary: "murdered" appears twice in one cue and
		// a reader searching "command" should find "Commander".
		expect(matchingCueIndexes(cues, 'command')).toEqual([1]);
		// "Father" contains "the", which is why single stopwords are a poor
		// query rather than a parser bug.
		expect(matchingCueIndexes(cues, 'the')).toEqual([1, 2]);
	});

	it('returns nothing for an empty or unmatched query', () => {
		expect(matchingCueIndexes(cues, '')).toEqual([]);
		expect(matchingCueIndexes(cues, '   ')).toEqual([]);
		expect(matchingCueIndexes(cues, 'zebra')).toEqual([]);
	});

	it('folds diacritics, so an unaccented query finds accented speech', () => {
		// A phone keyboard rarely produces the accented form, and transcripts
		// of natural speech are full of names that carry one.
		const accented = parseVtt(`WEBVTT

00:00:01.000 --> 00:00:03.000
<v Elena Sørensen>We met at a café in Zürich.</v>
`);
		expect(matchingCueIndexes(accented, 'cafe')).toEqual([0]);
		expect(matchingCueIndexes(accented, 'café')).toEqual([0]);
		expect(matchingCueIndexes(accented, 'ZURICH')).toEqual([0]);
	});
});

describe('inline karaoke timings', () => {
	const KARAOKE = `WEBVTT

1
00:00:00.500 --> 00:00:03.000
<v Dan>Welcome <00:00:00.900>to <00:00:01.100>the <00:00:01.400>show.</v>

2
00:00:03.000 --> 00:00:05.000
<v Nathan>No timings here.</v>
`;

	it('recovers a timed run per word without changing the cue text', () => {
		const [cue] = parseVtt(KARAOKE);
		expect(cue.text).toBe('Welcome to the show.');
		expect(cue.words).toEqual([
			{ text: 'Welcome', start: 0.5, end: 0.9 },
			{ text: 'to', start: 0.9, end: 1.1 },
			{ text: 'the', start: 1.1, end: 1.4 },
			{ text: 'show.', start: 1.4, end: 3 }
		]);
	});

	it('leaves words undefined on a cue with no tags, so the reader falls back', () => {
		expect(parseVtt(KARAOKE)[1].words).toBeUndefined();
	});

	it('times a whole phrase when a third-party file tags phrases, not words', () => {
		const [cue] = parseVtt(`WEBVTT

00:00:00.000 --> 00:00:04.000
First phrase here <00:00:02.000>second phrase here
`);
		expect(cue.words).toEqual([
			{ text: 'First phrase here', start: 0, end: 2 },
			{ text: 'second phrase here', start: 2, end: 4 }
		]);
	});

	it('folds an out-of-order tag into the previous run rather than dropping text', () => {
		const [cue] = parseVtt(`WEBVTT

00:00:00.000 --> 00:00:04.000
one <00:00:02.000>two <00:00:01.000>three
`);
		expect(cue.text).toBe('one two three');
		expect(cue.words).toEqual([
			{ text: 'one', start: 0, end: 2 },
			{ text: 'two three', start: 2, end: 4 }
		]);
	});

	it('decodes entities and strips nested tags inside a timed run', () => {
		const [cue] = parseVtt(`WEBVTT

00:00:00.000 --> 00:00:02.000
<v Ana>Rock <00:00:01.000><i>&amp;</i> roll
`);
		expect(cue.words?.map((w) => w.text)).toEqual(['Rock', '& roll']);
	});
});

describe('activeWordIndex', () => {
	const [cue] = parseVtt(`WEBVTT

00:00:00.500 --> 00:00:03.000
<v Dan>Welcome <00:00:00.900>to <00:00:01.100>the <00:00:01.400>show.</v>
`);

	it('finds the run being spoken', () => {
		expect(activeWordIndex(cue, 0.5)).toBe(0);
		expect(activeWordIndex(cue, 0.89)).toBe(0);
		expect(activeWordIndex(cue, 0.9)).toBe(1);
		expect(activeWordIndex(cue, 1.2)).toBe(2);
		expect(activeWordIndex(cue, 2.9)).toBe(3);
	});

	it('returns -1 before the first run starts', () => {
		expect(activeWordIndex(cue, 0)).toBe(-1);
	});

	it('holds the last run past the end rather than blinking off', () => {
		expect(activeWordIndex(cue, 9999)).toBe(3);
	});

	it('is safe on a cue with no timings and on a NaN time', () => {
		expect(activeWordIndex({ index: 0, start: 0, end: 1, speaker: null, text: 'x' }, 0.5)).toBe(-1);
		expect(activeWordIndex(cue, Number.NaN)).toBe(-1);
	});
});

describe('parseVtt on adversarial input (200 KB, timed)', () => {
	// Each of these took between 12 and 32 seconds in the app's copy, where
	// three expressions were quadratic. Linear scans parse them in a few
	// milliseconds; the budget leaves room for a slow CI machine.
	const SIZE = 200_000;
	const HEAD = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n';
	const BUDGET_MS = 250;
	const inputs: Record<string, string> = {
		'a payload of unclosed tags': HEAD + '<'.repeat(SIZE),
		'unclosed voice spans in a cut final cue': HEAD + '<v '.repeat(SIZE / 3),
		'a run of newlines before the end': HEAD + 'a' + '\n'.repeat(SIZE) + 'x',
		'timestamp-like tags that never close': HEAD + '<0'.repeat(SIZE / 2),
		'entity-like runs without a semicolon': HEAD + '&a'.repeat(SIZE / 2),
		'a timing line of digits': '9'.repeat(SIZE) + ':00.000 --> 00:01.000\nx\n',
		'thousands of ordinary timed cues': `WEBVTT\n\n${'00:00:00.000 --> 00:00:01.000\n<v A>hi <00:00:00.500>there</v>\n\n'.repeat(SIZE / 60)}`
	};

	it.each(Object.entries(inputs))('parses %s within the budget', (_name, input) => {
		expect(input.length).toBeGreaterThanOrEqual(SIZE - 10);
		const started = performance.now();
		parseVtt(input);
		expect(performance.now() - started).toBeLessThan(BUDGET_MS);
	});

	it('keeps the results the quadratic expressions gave', () => {
		// Tags without a closing > stay as text; a cut voice span drops the cue.
		expect(parseVtt(`${HEAD}a <b c\n`)[0].text).toBe('a <b c');
		expect(parseVtt(`${HEAD}<b>a</b> <i>b\n`)[0].text).toBe('a b');
		expect(parseVtt(`${HEAD}<v Ann>cut mid`)).toEqual([]);
		expect(parseVtt(`${HEAD}<v Ann>whole</v>`)[0].speaker).toBe('Ann');
		expect(parseVtt(`${HEAD}text\n\n\t \n`)).toHaveLength(1);
	});
});
