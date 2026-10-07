/**
 * <showfm-transcript> and the player's transcript option in Chromium,
 * against the built v1.js and its lazy chunk.
 *
 * - At 340, 720 and 1100px: the standalone transcript keeps its height,
 *   switches to the narrow layout in a sidebar, and nothing spills out; the
 *   player's Transcript button keeps every control on the row, down to 320px.
 * - A 15,000-word transcript keeps the DOM under 300 lines wherever it is
 *   scrolled, and search reaches a match near the end.
 * - Upgrading from the fallback moves nothing below the element.
 * - Real playback: the spoken line follows the audio; a click seeks.
 * - The chunk is fetched only when a transcript is on the page (or the
 *   player's transcript is opened).
 * - A keyboard pass, and reduced motion.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { renderTranscriptHTML } from '../../src/lib/fallback';
import { TRANSCRIPT_EPISODE_ID, conversationVtt } from '../fixtures/transcript';
import {
	API_ORIGIN,
	playerTranscriptReady,
	serveTranscript,
	transcriptReady
} from './transcript-harness';

const transcript = (attributes = '', inner = '') =>
	`<showfm-transcript episode="${TRANSCRIPT_EPISODE_ID}" api="${API_ORIGIN}" ${attributes}>${inner}</showfm-transcript>`;
const player = (attributes = '') =>
	`<showfm-player id="player" episode="${TRANSCRIPT_EPISODE_ID}" api="${API_ORIGIN}" ${attributes}></showfm-player>`;

/** Elements inside a shadow root that spill out of `box`, ignoring visually hidden ones. */
async function spills(host: Locator) {
	return host.evaluate((element) => {
		const root = (element.shadowRoot ?? element) as ParentNode;
		const box = element.getBoundingClientRect();
		const out: string[] = [];
		for (const node of root.querySelectorAll<HTMLElement>('*')) {
			const rect = node.getBoundingClientRect();
			if (!rect.width && !rect.height) continue;
			if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) {
				out.push(`${node.localName}.${node.className}`);
			}
		}
		const page = document.documentElement;
		return { out, pageScrolls: page.scrollWidth > page.clientWidth };
	});
}

const inner = (page: Page, selector: string) =>
	page.locator('showfm-player').evaluate((host, sel) => {
		const transcript = host.shadowRoot!.querySelector('showfm-transcript')!;
		return transcript.shadowRoot!.querySelectorAll(sel).length;
	}, selector);

for (const width of [340, 720, 1100]) {
	test(`standalone at ${width}px: its height, its layout, nothing spills`, async ({ page }) => {
		await page.setViewportSize({ width: width + 32, height: 900 });
		await serveTranscript(page, transcript(), { width });
		await transcriptReady(page);
		const host = page.locator('showfm-transcript');
		const facts = await host.evaluate((element) => {
			const root = element.shadowRoot!;
			return {
				height: element.getBoundingClientRect().height,
				narrow: root.querySelector('.tr')!.classList.contains('narrow'),
				field: root.querySelector('.field')!.getBoundingClientRect().height,
				head: root.querySelector('.head')!.getBoundingClientRect().height
			};
		});
		// The search row (55px) over the 320px text area, inside a 1px border.
		expect(facts.height).toBe(377);
		expect(facts.head).toBe(55);
		expect(facts.field).toBe(34);
		expect(facts.narrow).toBe(width < 400);
		expect(await spills(host)).toEqual({ out: [], pageScrolls: false });
	});

	test(`player at ${width}px: the Transcript button fits, the transcript opens under it`, async ({
		page
	}) => {
		await page.setViewportSize({ width: width + 32, height: 1100 });
		await serveTranscript(page, player('transcript="on"'), { width });
		const button = page.getByRole('button', { name: 'Transcript' });
		await button.waitFor();
		const host = page.locator('showfm-player');
		const closed = (await host.boundingBox())!.height;
		expect(await spills(host)).toEqual({ out: [], pageScrolls: false });
		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await playerTranscriptReady(page);
		const open = (await host.boundingBox())!.height;
		// The player grows downwards by the transcript: 340px of text and its search row.
		expect(open - closed).toBeGreaterThanOrEqual(340 + 55);
		expect(await spills(host)).toEqual({ out: [], pageScrolls: false });
	});
}

test('a 320px player keeps every control on one row with the Transcript button', async ({
	page
}) => {
	await serveTranscript(page, player('transcript="on"'), { width: 320 });
	await page.getByRole('button', { name: 'Transcript' }).waitFor();
	const rows = await page.locator('showfm-player').evaluate((host) => {
		const tops = [...host.shadowRoot!.querySelectorAll<HTMLElement>('.transport > button')].map(
			(button) => Math.round(button.getBoundingClientRect().top + button.offsetHeight / 2)
		);
		const row = host.shadowRoot!.querySelector('.transport')!.getBoundingClientRect();
		const last = host.shadowRoot!.querySelector('.transport > button:last-child')!;
		return {
			centres: new Set(tops).size,
			overflow: last.getBoundingClientRect().right - row.right
		};
	});
	expect(rows.centres).toBe(1);
	expect(rows.overflow).toBeLessThanOrEqual(0.5);
});

test('a 15,000-word transcript keeps the DOM under 300 lines', async ({ page }) => {
	const repeat = 66;
	const { cues } = conversationVtt({ repeat });
	expect(cues.reduce((n, cue) => n + cue.text.split(' ').length, 0)).toBeGreaterThan(15_000);
	await page.setViewportSize({ width: 752, height: 900 });
	await serveTranscript(page, transcript('height="600"'), { repeat });
	await transcriptReady(page);
	const host = page.locator('showfm-transcript');
	const count = () =>
		host.evaluate((element) => element.shadowRoot!.querySelectorAll('.line').length);
	const scrollTo = (fraction: number) =>
		host.evaluate((element, f) => {
			const scroller = element.shadowRoot!.querySelector<HTMLElement>('.scroll')!;
			scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * f;
			scroller.dispatchEvent(new Event('scroll'));
		}, fraction);
	for (const fraction of [0, 0.5, 1]) {
		await scrollTo(fraction);
		await page.waitForTimeout(100);
		const lines = await count();
		expect(lines).toBeGreaterThan(5);
		expect(lines).toBeLessThan(300);
	}
	// The last line is reachable: scrolled to the end, it is on screen.
	const last = await host.evaluate((element, index) => {
		const root = element.shadowRoot!;
		const line = root.querySelector(`.line[data-i="${index}"]`);
		const box = root.querySelector('.scroll')!.getBoundingClientRect();
		const rect = line?.getBoundingClientRect();
		return rect ? rect.bottom <= box.bottom + 1 && rect.top >= box.top - 1 : null;
	}, cues.length - 1);
	expect(last).toBe(true);
	// Search reaches a match near the end and renders it.
	await scrollTo(0);
	const field = page.getByRole('searchbox', { name: 'Search transcript' });
	await field.fill('salary');
	await expect(host.locator('.count')).toHaveText(`1 of ${repeat}`);
	await field.press('Shift+Enter');
	await expect(host.locator('.count')).toHaveText(`${repeat} of ${repeat}`);
	const active = host.locator('.act');
	await expect(active).toBeInViewport();
	expect(await count()).toBeLessThan(300);
});

test('upgrading from the fallback moves nothing below it', async ({ page }) => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.addInitScript(() => {
		(window as unknown as { shifts: number[] }).shifts = [];
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as unknown as {
				value: number;
				sources: { node: Node | null; previousRect: DOMRect; currentRect: DOMRect }[];
			}[]) {
				(window as unknown as { shifts: unknown[] }).shifts.push({
					value: entry.value,
					sources: entry.sources.map((s) => [
						(s.node as Element | null)?.outerHTML?.slice(0, 80) ?? s.node?.nodeName,
						JSON.stringify(s.previousRect),
						JSON.stringify(s.currentRect)
					])
				});
			}
		}).observe({ type: 'layout-shift', buffered: true });
	});
	const fallback = renderTranscriptHTML(conversationVtt().vtt);
	await serveTranscript(page, transcript('style="--showfm-height:377px"', fallback), { gate });
	const after = page.locator('#after');
	await after.waitFor();
	const before = (await after.boundingBox())!.y;
	expect(before).toBeGreaterThanOrEqual(377);
	release();
	await transcriptReady(page);
	await page.waitForTimeout(200);
	expect((await after.boundingBox())!.y).toBe(before);
	expect(await page.evaluate(() => (window as unknown as { shifts: number[] }).shifts)).toEqual([]);
});

test('follows real playback, and a click on a line seeks', async ({ page }) => {
	await serveTranscript(page, player() + transcript('for="player"'));
	await transcriptReady(page);
	const host = page.locator('showfm-transcript');
	const currentIndex = () =>
		host.evaluate(
			(element) =>
				element.shadowRoot!.querySelector<HTMLElement>('.line[aria-current="true"]')?.dataset.i ??
				null
		);
	expect(await currentIndex()).toBeNull();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(currentIndex).toBe('0');
	// The spoken word moves within the line.
	await expect(host.locator('.line.now .txt .now')).toHaveCount(1);
	const { cues } = conversationVtt();
	await host.locator('.line[data-i="4"] .txt').click();
	await expect.poll(currentIndex).toBe('4');
	const time = await page
		.locator('showfm-player')
		.evaluate((element) => element.shadowRoot!.querySelector('audio')!.currentTime);
	expect(time).toBeGreaterThanOrEqual(cues[4].start);
	expect(time).toBeLessThan(cues[4].end);
});

test('the chunk is fetched only when a transcript is on the page or opened', async ({ page }) => {
	const requests = await serveTranscript(page, player('transcript="on"'));
	const button = page.getByRole('button', { name: 'Transcript' });
	await button.waitFor();
	const chunks = () => requests.filter((path) => path.startsWith('chunks/transcript-'));
	expect(chunks()).toEqual([]);
	await button.click();
	await playerTranscriptReady(page);
	expect(chunks()).toHaveLength(1);
	expect(await inner(page, '.line')).toBeGreaterThan(5);
});

test('keyboard: search, step through matches, scroll away and come back to now', async ({
	page
}) => {
	await serveTranscript(page, player() + transcript('for="player"'));
	await transcriptReady(page);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const host = page.locator('showfm-transcript');
	await expect(host.locator('.line[aria-current="true"]')).toHaveCount(1);
	// Search: Enter steps on, Escape clears and following resumes.
	const field = page.getByRole('searchbox', { name: 'Search transcript' });
	await field.focus();
	await page.keyboard.type('bread');
	await expect(host.locator('.count')).toHaveText('1 of 5');
	await page.keyboard.press('Enter');
	await expect(host.locator('.count')).toHaveText('2 of 5');
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Previous match' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Next match' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(field).toHaveValue('');
	await expect(host.locator('.back')).toHaveCount(0);
	// The text: focusable, scrolls with the keyboard, which stops following.
	await field.focus();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('group', { name: 'Transcript text' })).toBeFocused();
	await page.keyboard.press('PageDown');
	const back = host.locator('.back');
	await expect(back).toBeVisible();
	await expect(back).toContainText('Back to now');
	// Tab moves through the timestamps (the only button per line) to Back to now.
	await page.keyboard.press('Tab');
	await expect(host.locator('.line button').first()).toBeFocused();
	await back.focus();
	await page.keyboard.press('Enter');
	await expect(back).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Transcript text' })).toBeFocused();
});

test('reduced motion: scrolling jumps instead of gliding', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await serveTranscript(page, transcript('height="200"'), { repeat: 3 });
	await transcriptReady(page);
	const host = page.locator('showfm-transcript');
	await page.getByRole('searchbox', { name: 'Search transcript' }).fill('salary');
	await page.getByRole('searchbox', { name: 'Search transcript' }).press('Shift+Enter');
	// No smooth scroll in flight: the match is there on the very next frame.
	const visible = await host.evaluate(
		() =>
			new Promise<boolean>((resolve) =>
				requestAnimationFrame(() => {
					const root = document.querySelector('showfm-transcript')!.shadowRoot!;
					const match = root.querySelector('.act')!.getBoundingClientRect();
					const box = root.querySelector('.scroll')!.getBoundingClientRect();
					resolve(match.top >= box.top && match.bottom <= box.bottom);
				})
			)
	);
	expect(visible).toBe(true);
});

test('German: the strings fit the search row at 340px', async ({ page }) => {
	await page.setViewportSize({ width: 372, height: 900 });
	await serveTranscript(page, player() + transcript('for="player"'), { width: 340, lang: 'de' });
	await transcriptReady(page);
	await page.getByRole('button', { name: 'Abspielen', exact: true }).click();
	const host = page.locator('showfm-transcript');
	await page.getByRole('searchbox', { name: 'Transkript durchsuchen' }).fill('bread');
	await expect(host.locator('.count')).toHaveText('1 von 5');
	expect(
		await host.evaluate((element) => element.shadowRoot!.querySelector('.head')!.clientHeight)
	).toBe(54);
	expect(await spills(host)).toEqual({ out: [], pageScrolls: false });
});

test('the mini-player opens the transcript above its bar, and in the phone sheet', async ({
	page
}) => {
	await page.setViewportSize({ width: 1100, height: 900 });
	const button = `<showfm-play episode="${TRANSCRIPT_EPISODE_ID}" api="${API_ORIGIN}"></showfm-play>`;
	await serveTranscript(page, button, { width: 600 });
	await page.getByRole('button', { name: /^Play: Sourdough/ }).click();
	const toggle = page.locator('showfm-mini-player').getByRole('button', { name: 'Transcript' });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	const panel = page.locator('showfm-mini-player showfm-transcript');
	await expect(panel.locator('.line').first()).toBeVisible();
	const [bar, box] = await Promise.all([
		page.locator('showfm-mini-player section').boundingBox(),
		panel.boundingBox()
	]);
	// Above the bar, at its right end, inside the window.
	expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
	expect(box!.x + box!.width).toBeLessThanOrEqual(1100);
	expect(box!.width).toBe(420);
	// The spoken line follows the shared audio.
	await expect(panel.locator('.line[aria-current="true"]')).toHaveCount(1);

	await page.setViewportSize({ width: 390, height: 800 });
	await page.locator('showfm-mini-player').getByRole('button', { name: 'Expand player' }).click();
	const sheet = page.getByRole('dialog');
	await expect(sheet).toBeVisible();
	const inSheet = await panel.evaluate((element) => element.className);
	expect(inSheet).toBe('panel in-sheet');
	// The sheet's own spacing stays on the sheet: the panel is the transcript's height.
	expect((await panel.boundingBox())!.height).toBe(55 + 300 + 2);
	const [sheetBox, sheetPanel] = await Promise.all([sheet.boundingBox(), panel.boundingBox()]);
	expect(sheetPanel!.x).toBeGreaterThanOrEqual(sheetBox!.x);
	expect(sheetPanel!.x + sheetPanel!.width).toBeLessThanOrEqual(
		sheetBox!.x + sheetBox!.width + 0.5
	);
	expect(sheetBox!.height).toBeLessThanOrEqual(800 * 0.9 + 0.5);
});

test("inside the player, the spoken line's timestamp reaches 4.5:1 on its tint", async ({
	page
}) => {
	await serveTranscript(page, player('transcript="open" theme="dark"'));
	await playerTranscriptReady(page);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	const ratio = await page.waitForFunction(() => {
		const transcript = document
			.querySelector('showfm-player')!
			.shadowRoot!.querySelector('showfm-transcript')!.shadowRoot!;
		const line = transcript.querySelector<HTMLElement>('.line.now');
		if (!line) return null;
		const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
		const channel = (c: number) => {
			const v = c / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		};
		const luminance = ([r, g, b]: number[]) =>
			0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
		// The tint is translucent in the dark theme: blend it over the panel.
		const panel = rgb(getComputedStyle(transcript.querySelector('.tr')!).backgroundColor);
		const [r, g, b, a = 1] = rgb(getComputedStyle(line).backgroundColor);
		const surface = [r, g, b].map((c, i) => c * a + panel[i] * (1 - a));
		const text = rgb(getComputedStyle(line.querySelector('.ts')!).color);
		const [light, dark] = [luminance(text), luminance(surface)].sort((x, y) => y - x);
		return (light + 0.05) / (dark + 0.05);
	});
	expect(await ratio.jsonValue()).toBeGreaterThanOrEqual(4.5);
});

test('consent mode: a transcript facade loads nothing until pressed, then the transcript in its place', async ({
	page
}) => {
	const loader = readFileSync(
		fileURLToPath(new URL('../../dist/cdn/click-loader.js', import.meta.url)),
		'utf-8'
	);
	const requests = await serveTranscript(
		page,
		transcript(
			'load="click" style="--showfm-height:377px"',
			renderTranscriptHTML(conversationVtt().vtt)
		),
		{ script: `<script data-src="/player/v1.js">${loader}</script>` }
	);
	const button = page.getByRole('button', { name: 'Load transcript' });
	await expect(button).toBeVisible();
	const host = page.locator('showfm-transcript');
	expect((await host.boundingBox())!.height).toBe(377);
	expect(requests).toEqual(['v1-fallback.css']);
	const after = (await page.locator('#after').boundingBox())!.y;
	await button.click();
	await transcriptReady(page);
	expect((await host.boundingBox())!.height).toBe(377);
	expect((await page.locator('#after').boundingBox())!.y).toBe(after);
	expect(requests).toContain('v1.js');
});
