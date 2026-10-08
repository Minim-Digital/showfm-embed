/**
 * axe-core in Chromium, for the browser tests: the same engine jest-axe runs
 * in the unit tests, here against real layout and real shadow trees.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { expect, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(
	require.resolve('axe-core/axe.min.js', { paths: [dirname(require.resolve('jest-axe'))] }),
	'utf-8'
);

/** No axe violations on the page, inside the shadow roots too. */
export async function expectNoAxeViolations(page: Page) {
	if (!(await page.evaluate(() => 'axe' in window)))
		await page.addScriptTag({ content: AXE_SOURCE });
	const violations = await page.evaluate(async () => {
		const axe = (window as unknown as { axe: { run: (...args: unknown[]) => Promise<unknown> } })
			.axe;
		const result = (await axe.run(document, {
			rules: {
				// The test page is a bare host page, not a document with landmarks.
				region: { enabled: false },
				'landmark-one-main': { enabled: false },
				'page-has-heading-one': { enabled: false },
				'document-title': { enabled: false },
				// Silent test audio, with controls.
				'audio-caption': { enabled: false },
				'no-autoplay-audio': { enabled: false }
			}
		})) as { violations: { id: string; nodes: { target: string[] }[] }[] };
		return result.violations.map((violation) => ({
			id: violation.id,
			nodes: violation.nodes.map((node) => node.target.join(' > '))
		}));
	});
	expect(violations).toEqual([]);
}
