/**
 * The episode list's transcript (design pages 2 and 3.2, decision 10) in
 * Chromium, against the built v1.js and its chunks, at 340, 720 and 1100px
 * in light and dark:
 *
 * - The playing row's Transcript button opens the follow-along transcript:
 *   inside the row in a list, and in a grid as a full-width panel under the
 *   playing card's row (the rest of that row stays beside the card).
 * - Nothing spills out of the list and the page never scrolls sideways.
 * - The grid panel's Close returns focus to the card's Transcript button.
 * - External audio gets no button.
 * - axe finds nothing with the transcript open.
 * - A full-page screenshot of each goes to test-results/, for review.
 */
import { expect, test, type Page } from '@playwright/test';
import { API_ORIGIN, listReady, serveList } from './episodes-harness';
import { expectNoAxeViolations } from './axe';
import { sampleEpisodes } from '../fixtures/episodes';
import { TRANSCRIPT_VTT } from '../fixtures/transcript';

// Sourdough (hosted) and Leftovers (external audio) have a transcript.
const EPISODES = sampleEpisodes().map((episode) =>
	episode.slug === 'episode-1' || episode.slug === 'episode-6'
		? { ...episode, transcript: { url: TRANSCRIPT_VTT, type: 'text/vtt' } }
		: episode
);

const DARK = '<style>body{background:#0e0d13;color:#ecebf0}</style>';

const list = (attributes = '') =>
	`<showfm-episodes podcast="the-long-table" api="${API_ORIGIN}" ${attributes}></showfm-episodes>`;

/** The list's shadow root, a row in it, and the transcript in it. */
const inList = (page: Page) => page.locator('showfm-episodes');
const row = (page: Page, index: number) => inList(page).locator('[data-row]').nth(index);
const toggle = (page: Page, index = 0) => row(page, index).locator('[data-transcript]');

async function playFirst(page: Page) {
	const play = row(page, 0).locator('[data-play]');
	await play.click();
	await expect(play).toHaveAccessibleName(/^Pause/);
}

/** Waits until the open transcript shows its lines. */
const transcriptReady = (page: Page) =>
	page.waitForFunction(
		() =>
			!!document
				.querySelector('showfm-episodes')
				?.shadowRoot?.querySelector('showfm-transcript')
				?.shadowRoot?.querySelector('.line')
	);

/** Where the open transcript sits, and whether anything spills out of the list. */
function measure(host: Element) {
	const root = host.shadowRoot!;
	const box = host.getBoundingClientRect();
	const panel = root.querySelector('showfm-transcript')!;
	const rows = [...root.querySelectorAll('[data-row]')];
	const spills: string[] = [];
	const walk = (scope: ShadowRoot) => {
		for (const element of scope.querySelectorAll<HTMLElement>('*')) {
			const rect = element.getBoundingClientRect();
			if ((!rect.width && !rect.height) || element.closest('.vh')) continue;
			if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) {
				spills.push(`${element.localName}.${element.className}`);
			}
			if (element.shadowRoot) walk(element.shadowRoot);
		}
	};
	walk(root);
	const rect = (element: Element) => {
		const { top, bottom, left, width } = element.getBoundingClientRect();
		return { top, bottom, left, width };
	};
	const page = document.documentElement;
	return {
		layout: root.querySelector('.list')!.className,
		inRow: rows[0].contains(panel),
		// In the DOM, the card the panel follows, and the grid's columns.
		after: rows.indexOf(panel.previousElementSibling!),
		columns: getComputedStyle(root.querySelector('.rows')!).gridTemplateColumns.split(' ').length,
		panel: rect(panel),
		rows: rect(root.querySelector('.rows')!),
		cards: rows.map(rect),
		spills,
		pageScrolls: page.scrollWidth > page.clientWidth
	};
}

for (const [look, head, theme] of [
	['light', '', 'light'],
	['dark', DARK, 'dark']
] as const) {
	for (const width of [340, 720, 1100]) {
		test(`${look} at ${width}px: the playing row opens the transcript where the design puts it`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize({ width: width + 32, height: 1000 });
			await serveList(page, list(`theme="${theme}"`), { episodes: EPISODES }, { width, head });
			await listReady(page);
			// Idle rows offer nothing.
			await expect(inList(page).locator('[data-transcript]')).toHaveCount(0);
			await playFirst(page);
			await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
			await toggle(page).click();
			await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
			await transcriptReady(page);

			const at = await inList(page).evaluate(measure);
			// Auto: a grid from 900px (six of the seven episodes have their own artwork).
			const grid = width >= 900;
			expect(at.layout).toContain(grid ? 'l-grid' : 'l-list');
			expect(at.spills).toEqual([]);
			expect(at.pageScrolls).toBe(false);
			if (grid) {
				// A full-width panel under the playing card's row.
				expect(at.inRow).toBe(false);
				expect(Math.abs(at.panel.left - at.rows.left)).toBeLessThan(1);
				expect(Math.abs(at.panel.width - at.rows.width)).toBeLessThan(1);
				expect(at.panel.top).toBeGreaterThan(at.cards[0].bottom);
				// After the row's last card in the DOM too, so reading and tab
				// order match the page: the row, then the panel.
				expect(at.after).toBe(at.columns - 1);
				// The rest of that row stays beside the card; the rows below move down.
				expect(at.cards[1].top).toBe(at.cards[0].top);
				const below = at.cards.filter((card) => card.top > at.cards[0].top);
				expect(below.length).toBeGreaterThan(0);
				for (const card of below) expect(card.top).toBeGreaterThan(at.panel.bottom);
			} else {
				// Inside the row, under the waveform.
				expect(at.inRow).toBe(true);
				expect(at.panel.top).toBeGreaterThan(at.cards[0].top);
				expect(at.panel.bottom).toBeLessThanOrEqual(at.cards[0].bottom);
			}
			await expectNoAxeViolations(page);
			// For review (CI keeps test-results/): the open transcript in place.
			await page.screenshot({
				path: testInfo.outputPath(`list-transcript-${look}-${width}.png`),
				fullPage: true
			});

			if (grid) {
				// Close returns focus to the card's Transcript button.
				await page.getByRole('button', { name: 'Close transcript' }).click();
				await expect(inList(page).locator('showfm-transcript')).toHaveCount(0);
				await expect(toggle(page)).toBeFocused();
			} else {
				await toggle(page).click();
				await expect(inList(page).locator('showfm-transcript')).toHaveCount(0);
			}
			await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
		});
	}
}

test('external audio has no Transcript button, even with a transcript (design page 9)', async ({
	page
}) => {
	await serveList(page, list('layout="list"'), { episodes: EPISODES });
	await listReady(page);
	const leftovers = row(page, 5);
	await leftovers.locator('[data-play]').click();
	await expect(leftovers.locator('[data-play]')).toHaveAccessibleName(/^Pause/);
	await expect(leftovers.locator('[data-transcript]')).toHaveCount(0);
});

test('Minimal at 1100px, list and grid: the link-style button opens it as in Card', async ({
	page
}) => {
	await page.setViewportSize({ width: 1132, height: 1000 });
	for (const layout of ['list', 'grid']) {
		await serveList(
			page,
			list(`variant="minimal" layout="${layout}"`),
			{ episodes: EPISODES },
			{
				width: 1100
			}
		);
		await listReady(page);
		await playFirst(page);
		await toggle(page).click();
		await transcriptReady(page);
		const at = await inList(page).evaluate(measure);
		expect(at.spills, layout).toEqual([]);
		expect(at.inRow, layout).toBe(layout === 'list');
		await expectNoAxeViolations(page);
	}
});

test('the transcript follows the row: it seeks the list’s audio, and stays open', async ({
	page
}) => {
	await serveList(page, list('layout="list"'), { episodes: EPISODES });
	await listReady(page);
	await playFirst(page);
	await toggle(page).click();
	await transcriptReady(page);
	// The fourth line's timestamp seeks the page's shared audio there.
	const jumped = await page.evaluate(async () => {
		const transcript = document
			.querySelector('showfm-episodes')!
			.shadowRoot!.querySelector('showfm-transcript')!.shadowRoot!;
		const stamp = transcript.querySelectorAll<HTMLButtonElement>('.line button')[3];
		stamp.click();
		await new Promise((resolve) => setTimeout(resolve, 100));
		const controller = (
			globalThis as unknown as Record<symbol, { sharedAudio(): HTMLAudioElement }>
		)[Symbol.for('showfm.page-audio-controller.v1')];
		return controller.sharedAudio().currentTime;
	});
	expect(jumped).toBeGreaterThan(14);
	// The seek buffers the audio, and the transcript stays open through it.
	await page.waitForTimeout(300);
	await expect(inList(page).locator('showfm-transcript')).toHaveCount(1);
});
