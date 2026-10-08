/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { transformWithEsbuild } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseVtt } from '../vtt';

/** How long a parse may run before it counts as hung. */
const HANG_MS = 5_000;

/**
 * vtt.ts as JavaScript, for the worker: Vitest does not transform a worker's
 * code, and Node strips types by default only from 22.18, while the dev
 * toolchain runs from 22.13 (CI runs these tests there too). vtt.ts has no
 * imports, so it loads alone, as a data: module.
 */
let vttModule = '';
beforeAll(async () => {
	const source = resolve(__dirname, '../vtt.ts');
	const { code } = await transformWithEsbuild(readFileSync(source, 'utf-8'), source, {
		format: 'esm'
	});
	vttModule = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
});

/**
 * The fastest of three parses of `input`, in a worker that is stopped after
 * HANG_MS. A synchronous parse cannot be interrupted in this thread, so a
 * regression that never finishes (the pre-1.4.1 parser on 200 KB of voice
 * classes) would hang the run; here it fails in five seconds.
 */
function fastestParse(input: string): Promise<number> {
	const source = `
		const { parentPort, workerData } = require('node:worker_threads');
		import(workerData.url).then(({ parseVtt }) => {
			let fastest = Infinity;
			for (let run = 0; run < 3; run++) {
				const started = performance.now();
				parseVtt(workerData.input);
				fastest = Math.min(fastest, performance.now() - started);
			}
			parentPort.postMessage(fastest);
		});`;
	return new Promise((done, fail) => {
		const worker = new Worker(source, { eval: true, workerData: { url: vttModule, input } });
		const timer = setTimeout(() => {
			void worker.terminate();
			fail(new Error(`parseVtt was still running after ${HANG_MS} ms`));
		}, HANG_MS);
		worker.once('message', (fastest: number) => {
			clearTimeout(timer);
			void worker.terminate();
			done(fastest);
		});
		worker.once('error', (error) => {
			clearTimeout(timer);
			fail(error);
		});
	});
}

describe('parseVtt on adversarial input (200 KB, timed)', () => {
	// Ported from podcaster-plus-app PR #740, including the original EMB-2
	// cases. Failed searches used to take seconds on these inputs.
	// The budget leaves room for a slow CI machine while catching rescans.
	const SIZE = 200_000;
	const BUDGET_MS = 250;
	const HEAD = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n';

	it('parses the minimal 40-dot voice-class regression within 50 ms', () => {
		const payload = '<v.' + '.'.repeat(40);
		const started = performance.now();
		const cues = parseVtt(HEAD + payload);
		expect(performance.now() - started).toBeLessThan(50);
		expect(cues).toEqual([{ index: 0, start: 0, end: 1, speaker: null, text: payload }]);
	});

	const inputs: Record<string, string> = {
		'a payload of unclosed tags': HEAD + '<'.repeat(SIZE),
		'unclosed voice spans in a cut final cue': HEAD + '<v '.repeat(SIZE / 3),
		'a run of newlines before the end': HEAD + 'a' + '\n'.repeat(SIZE) + 'x',
		'timestamp-like tags that never close': HEAD + '<0'.repeat(SIZE / 2),
		'entity-like runs without a semicolon': HEAD + '&a'.repeat(SIZE / 2),
		'voice classes without a separator': HEAD + '<v.' + '.'.repeat(SIZE),
		'voice whitespace without a closing tag': HEAD + '<v' + ' '.repeat(SIZE) + 'x',
		'a timing line of digits': '9'.repeat(SIZE) + ':00.000 --> 00:01.000\nx\n',
		'cue settings with an embedded line separator':
			'WEBVTT\n\n00:00:00.000 --> 00:00:01.000' + ' '.repeat(SIZE) + 'x\u2028y\ntext\n',
		'cue settings with an embedded paragraph separator':
			'WEBVTT\n\n00:00:00.000 --> 00:00:01.000' + ' '.repeat(SIZE) + 'x\u2029y\ntext\n',
		'thousands of ordinary timed cues': `WEBVTT\n\n${'00:00:00.000 --> 00:00:01.000\n<v A>hi <00:00:00.500>there</v>\n\n'.repeat(SIZE / 60)}`
	};

	it.each(Object.entries(inputs))(
		'parses %s within the budget',
		async (_name, input) => {
			expect(input.length).toBeGreaterThanOrEqual(SIZE - 10);
			// The fastest of three parses: one run alone also times the JIT's
			// warm-up and whatever else the machine is doing (a busy runner took
			// 300 to 500 ms for the ordinary cues, which normally parse in about
			// 20). A rescan costs seconds on every run, so it still fails.
			expect(await fastestParse(input)).toBeLessThan(BUDGET_MS);
		},
		HANG_MS + 5_000
	);

	it.each(['\u2028', '\u2029'])('preserves cue settings with separator %s', (separator) => {
		const timing = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000';
		expect(parseVtt(`${timing} \t${separator} align:start\nhello\n`)[0].text).toBe('hello');
		expect(parseVtt(`${timing} align:start${separator}x\nhello\n`)).toEqual([]);
		expect(parseVtt(`${timing} align:start${separator}\nhello\n`)).toEqual([]);
	});

	it.each([
		['<v.loud.fast \t Ana &amp; Bob>hello</v>', 'Ana & Bob'],
		['<V.. \t Ana>hello</V>', 'Ana'],
		['<v\t\tAna>hello</v>', 'Ana'],
		['<v \t >hello</v>', null],
		['<v. Ana>hello</v>', null]
	])('preserves speaker extraction for %s', (payload, speaker) => {
		expect(parseVtt(`${HEAD}${payload}\n`)).toEqual([
			{ index: 0, start: 0, end: 1, speaker, text: 'hello' }
		]);
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
