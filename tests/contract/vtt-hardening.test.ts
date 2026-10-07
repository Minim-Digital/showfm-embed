// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it.each(['@showfm/embed', '@showfm/embed/server'])('%s ships the hardened parser', (specifier) => {
	const script = `
			import { parseVtt } from ${JSON.stringify(specifier)};
			const payload = '<v.' + '.'.repeat(40);
			const input = 'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.000\\n' + payload;
			const started = performance.now();
			const cues = parseVtt(input);
			console.log(JSON.stringify({ cues, elapsed: performance.now() - started }));
		`;
	// A subprocess timeout also catches a regression that blocks the event loop.
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
		cwd: resolve(__dirname, '../..'),
		encoding: 'utf8',
		timeout: 2_000
	});
	const result = JSON.parse(output);
	expect(result.elapsed).toBeLessThan(50);
	expect(result.cues).toEqual([
		{ index: 0, start: 0, end: 1, speaker: null, text: '<v.' + '.'.repeat(40) }
	]);
});
