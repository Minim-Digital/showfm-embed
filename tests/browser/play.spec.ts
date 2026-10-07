/**
 * <showfm-play> and the page's mini-player in Chromium, against the built
 * v1.js and its lazy chunk.
 *
 * - Every variant and size at 340, 720 and 1100px: the line keeps its
 *   height (40px, or the large button's), nothing spills out, the page
 *   never scrolls sideways.
 * - Upgrading from the fallback moves nothing on the page.
 * - A press really plays, and opens the mini-player: the bar along the
 *   bottom on a desktop, a floating 64px bar on a phone, a pill when
 *   collapsed (in either corner, lifted by --showfm-bottom-offset), and on
 *   a phone a sheet with the full controls.
 * - A keyboard pass: the button, then the mini-player's controls, and back.
 * - load="click": the facade is the button alone, and nothing is fetched
 *   until it is pressed; then it loads and plays.
 * - Reduced motion stops the buffering arc.
 */
import { expect, test, type Page } from '@playwright/test';
import { API_ORIGIN, CLICK_LOADER, serveList } from './episodes-harness';
import { sampleEpisodes } from '../fixtures/episodes';

const EPISODE = sampleEpisodes()[0];

const play = (attributes = '', inner = '') =>
	`<showfm-play episode="${EPISODE.id}" api="${API_ORIGIN}" ${attributes}>${inner}</showfm-play>`;

const fallback = `<a href="${EPISODE.links.listen}">${EPISODE.title}</a><audio controls preload="none" src="${EPISODE.audio.url}?src=embed"></audio>`;

/** Waits for every button on the page to mount. */
const buttonsReady = (page: Page) =>
	page.waitForFunction(() =>
		[...document.querySelectorAll('showfm-play')].every((host) =>
			host.shadowRoot?.querySelector('[data-play], .msg')
		)
	);

const mini = (page: Page) => page.locator('showfm-mini-player section');

for (const width of [340, 720, 1100]) {
	test(`at ${width}px: every variant and size keeps its line and fits`, async ({ page }) => {
		await page.setViewportSize({ width: width + 32, height: 800 });
		const cases = [
			['label', 'sm', 40],
			['label', 'lg', 48],
			['icon', 'sm', 40],
			['icon', 'lg', 56]
		] as const;
		await serveList(
			page,
			cases
				.map(([variant, size]) => `<div>${play(`variant="${variant}" size="${size}"`)}</div>`)
				.join('') +
				`<p id="sentence">You can hear it here: ${play('variant="link"')}, or on any podcast app you like.</p>`,
			{},
			{ width }
		);
		await buttonsReady(page);
		const boxes = await page.locator('showfm-play').evaluateAll((hosts) =>
			hosts.map((host) => {
				const box = host.getBoundingClientRect();
				const parent = host.parentElement!.getBoundingClientRect();
				const spills = [...host.shadowRoot!.querySelectorAll<HTMLElement>('*')].filter((el) => {
					const rect = el.getBoundingClientRect();
					// Visually hidden text is clipped to nothing, 1px off the edge.
					if (!rect.width || el.closest('.vh')) return false;
					return rect.left < parent.left - 0.5 || rect.right > parent.right + 0.5;
				}).length;
				return { height: box.height, spills };
			})
		);
		cases.forEach(([variant, size, height], index) => {
			expect(boxes[index].height, `${variant} ${size}`).toBe(height);
			expect(boxes[index].spills, `${variant} ${size}`).toBe(0);
		});
		// The link sits in the sentence: one line of text tall.
		expect(boxes[4].height).toBeLessThan(30);
		expect(boxes[4].spills).toBe(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			)
		).toBe(false);
	});
}

test('upgrading from the fallback moves nothing on the page', async ({ page }) => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.addInitScript(() => {
		const shifts: number[] = [];
		(window as unknown as { shifts: number[] }).shifts = shifts;
		new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				shifts.push((entry as unknown as { value: number }).value);
			}
		}).observe({ type: 'layout-shift', buffered: true });
	});
	await serveList(
		page,
		`<p>${play('', fallback)}</p><p>${play('size="lg" variant="icon"', fallback)}</p>`,
		{},
		{ gate }
	);
	const after = page.locator('#after');
	await after.waitFor();
	const before = (await after.boundingBox())!.y;
	const heights = await page
		.locator('showfm-play')
		.evaluateAll((hosts) => hosts.map((host) => host.getBoundingClientRect().height));
	expect(heights).toEqual([40, 56]);
	release();
	await buttonsReady(page);
	expect((await after.boundingBox())!.y).toBe(before);
	expect(
		await page
			.locator('showfm-play')
			.evaluateAll((hosts) => hosts.map((host) => host.getBoundingClientRect().height))
	).toEqual([40, 56]);
	const shifts = await page.evaluate(() => (window as unknown as { shifts: number[] }).shifts);
	expect(shifts).toEqual([]);
});

test('the chunk is fetched only once a button is on the page, and runs under a nonce CSP', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const requests = await serveList(
		page,
		'<p>No button here.</p>',
		{},
		{
			csp: "script-src 'nonce-n0nce'",
			script: '<script nonce="n0nce" src="/player/v1.js"></script>'
		}
	);
	await page.waitForFunction(() => customElements.get('showfm-play'));
	expect(requests.filter((path) => path.startsWith('chunks/'))).toEqual([]);
	await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), play());
	await buttonsReady(page);
	expect(requests.filter((path) => path.startsWith('chunks/play-'))).toHaveLength(1);
	expect(errors.filter((text) => /Content Security Policy/i.test(text))).toEqual([]);
});

type Played = { played: HTMLMediaElement[] };

test.describe('a press plays and opens the mini-player', () => {
	test.beforeEach(async ({ page }) => {
		// The page's shared audio is never in the document: note it when it plays.
		await page.addInitScript(() => {
			const played: HTMLMediaElement[] = ((window as unknown as Played).played = []);
			const original = HTMLMediaElement.prototype.play;
			HTMLMediaElement.prototype.play = function () {
				if (!played.includes(this)) played.push(this);
				return original.call(this);
			};
		});
	});

	test('desktop: the bar along the bottom, the pill in the corner, Close stops', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1100, height: 700 });
		await serveList(page, `<p>${play('size="lg"')}</p>`, {}, { width: 1000 });
		await buttonsReady(page);
		const button = page.locator('showfm-play [data-play]');
		await button.click();
		await expect(button).toHaveAccessibleName(/^Pause · \d+ min left: Sourdough/);
		await expect
			.poll(() => page.evaluate(() => (window as unknown as Played).played[0]?.currentTime ?? 0))
			.toBeGreaterThan(0);
		const bar = mini(page);
		await expect(bar).toBeVisible();
		await expect(bar).toHaveAccessibleName('Now playing');
		const box = (await bar.boundingBox())!;
		expect(box.x).toBe(0);
		expect(box.width).toBe(1100);
		expect(box.y + box.height).toBe(700);
		for (const name of [
			'Back 15 seconds',
			'Forward 30 seconds',
			'Collapse player',
			'Close player and stop playback'
		]) {
			await expect(bar.getByRole('button', { name })).toBeVisible();
		}
		await expect(bar.getByRole('slider', { name: 'Seek' })).toBeVisible();
		await expect(bar.getByRole('button', { name: 'Expand player' })).toBeHidden();
		await expect(bar.getByText('Powered by')).toBeVisible();

		await bar.getByRole('button', { name: 'Collapse player' }).click();
		const pill = mini(page);
		await expect(pill.getByRole('button', { name: 'Expand player' })).toBeFocused();
		const pillBox = (await pill.boundingBox())!;
		expect(1100 - (pillBox.x + pillBox.width)).toBe(20);
		expect(700 - (pillBox.y + pillBox.height)).toBe(20);
		await expect(pill.getByRole('button', { name: 'Back 15 seconds' })).toBeHidden();
		// Collapse keeps playing.
		expect(await page.evaluate(() => (window as unknown as Played).played[0].paused)).toBe(false);

		await pill.getByRole('button', { name: 'Expand player' }).click();
		await mini(page).getByRole('button', { name: 'Close player and stop playback' }).click();
		await expect(mini(page)).toHaveCount(0);
		expect(await page.evaluate(() => (window as unknown as Played).played[0].paused)).toBe(true);
		await expect(button).toHaveAccessibleName(/^Resume · /);
	});

	test('the pill sits left when asked, lifted by --showfm-bottom-offset', async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 700 });
		await serveList(
			page,
			play('mini-player-position="left" style="--showfm-bottom-offset:72px"'),
			{},
			{ width: 1000 }
		);
		await buttonsReady(page);
		await page.locator('showfm-play [data-play]').click();
		const bar = mini(page);
		await expect(bar).toBeVisible();
		const barBox = (await bar.boundingBox())!;
		expect(700 - (barBox.y + barBox.height)).toBe(72);
		await bar.getByRole('button', { name: 'Collapse player' }).click();
		const pillBox = (await mini(page).boundingBox())!;
		expect(pillBox.x).toBe(20);
		expect(700 - (pillBox.y + pillBox.height)).toBe(92);
	});

	test('a phone: the floating 64px bar, then the sheet with everything', async ({ page }) => {
		await page.setViewportSize({ width: 340, height: 700 });
		await serveList(page, play(), {}, { width: 308 });
		await buttonsReady(page);
		await page.locator('showfm-play [data-play]').click();
		const bar = mini(page);
		await expect(bar).toBeVisible();
		const box = (await bar.boundingBox())!;
		expect(box.x).toBe(8);
		expect(box.width).toBe(324);
		expect(box.height).toBeLessThanOrEqual(64);
		// The title stays on one line.
		const title = bar.locator('.title');
		expect((await title.boundingBox())!.height).toBeLessThan(22);
		await expect(bar.getByRole('button', { name: 'Back 15 seconds' })).toBeHidden();
		await expect(bar.getByRole('button', { name: 'Close player and stop playback' })).toBeHidden();
		await expect(bar.getByRole('button', { name: /^Pause: / })).toBeVisible();

		await bar.getByRole('button', { name: 'Expand player' }).click();
		const sheet = page.locator('showfm-mini-player [role="dialog"]');
		await expect(sheet).toHaveAccessibleName(/^Audio player: Sourdough/);
		await expect(sheet.getByRole('button', { name: 'Collapse player' })).toBeFocused();
		const sheetBox = (await sheet.boundingBox())!;
		expect(sheetBox.width).toBe(340);
		expect(sheetBox.y + sheetBox.height).toBe(700);
		expect(sheetBox.height).toBeLessThanOrEqual(0.9 * 700);
		for (const name of [
			'Back 15 seconds',
			'Forward 30 seconds',
			'Close player and stop playback'
		]) {
			await expect(sheet.getByRole('button', { name })).toBeVisible();
		}
		await expect(sheet.getByRole('slider', { name: 'Seek' })).toBeVisible();
		// The waveform sits above the transport.
		const wave = (await sheet.locator('.scrub').boundingBox())!;
		const back = (await sheet.getByRole('button', { name: 'Back 15 seconds' }).boundingBox())!;
		expect(wave.y + wave.height).toBeLessThan(back.y);
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Expand player' })).toBeFocused();
	});

	test('a keyboard pass: the button, the mini-player, and back', async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 700 });
		await serveList(page, play(), {}, { width: 1000 });
		await buttonsReady(page);
		await page.keyboard.press('Tab');
		const button = page.locator('showfm-play [data-play]');
		await expect(button).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(mini(page)).toBeVisible();
		// Opening does not take focus.
		await expect(button).toBeFocused();
		const order: string[] = [];
		for (let i = 0; i < 7; i++) {
			await page.keyboard.press('Tab');
			order.push(
				await page.evaluate(() => {
					let active = document.activeElement;
					while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
					return active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? '';
				})
			);
		}
		expect(order).toEqual([
			'Powered by show.fm',
			'Back 15 seconds',
			'Pause: Sourdough, salt and the slow return of the village bakery',
			'Forward 30 seconds',
			'Seek',
			'Playback speed, currently 1×',
			'Collapse player'
		]);
		// Collapse: focus on Expand; Expand: focus back on Collapse.
		await page.keyboard.press('Enter');
		await expect(mini(page).getByRole('button', { name: 'Expand player' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(mini(page).getByRole('button', { name: 'Collapse player' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(
			mini(page).getByRole('button', { name: 'Close player and stop playback' })
		).toBeFocused();
		await page.keyboard.press('Enter');
		// Close: focus goes back to the button that opened it.
		await expect(mini(page)).toHaveCount(0);
		await expect(button).toBeFocused();
	});

	test('a list row and a button take turns, and the mini-player follows', async ({ page }) => {
		await page.setViewportSize({ width: 1100, height: 900 });
		await serveList(
			page,
			`<showfm-episodes podcast="the-long-table" api="${API_ORIGIN}" count="3"></showfm-episodes>` +
				play(),
			{},
			{ width: 1000 }
		);
		await buttonsReady(page);
		await page.waitForFunction(
			() => !!document.querySelector('showfm-episodes')?.shadowRoot?.querySelector('[data-row]')
		);
		const button = page.locator('showfm-play [data-play]');
		await button.click();
		await expect(mini(page)).toBeVisible();
		const second = page.locator('showfm-episodes [data-row]').nth(1).locator('[data-play]');
		await second.click();
		await expect(second).toHaveAccessibleName(/^Pause: Why everyone/);
		await expect(button).toHaveAccessibleName(/^Play: /);
		await expect(mini(page).locator('.title')).toHaveText(/^Why everyone/);
		// The list shows the credit, so the mini-player does not.
		await expect(mini(page).getByText('Powered by')).toHaveCount(0);
	});
});

test('load="click": the facade is the button alone; one press loads and plays', async ({
	page
}) => {
	const requests = await serveList(
		page,
		`<p>${play('load="click"', fallback)}</p>`,
		{},
		{
			script: `<script data-src="/player/v1.js">${CLICK_LOADER}</script>`
		}
	);
	const host = page.locator('showfm-play');
	const facade = host.getByRole('button', { name: 'Play podcast episode' });
	await expect(facade).toBeVisible();
	expect((await host.boundingBox())!.height).toBe(40);
	await expect(host.locator(':scope > audio')).toBeHidden();
	expect(requests.filter((path) => path !== 'v1-fallback.css')).toEqual([]);
	await facade.focus();
	await page.keyboard.press('Enter');
	const button = host.locator('[data-play]');
	await expect(button).toHaveAccessibleName(/^Pause · \d+ min left: Sourdough/);
	await expect(button).toBeFocused();
	expect((await host.boundingBox())!.height).toBe(40);
	await expect(mini(page)).toBeVisible();
});

test('reduced motion: the buffering arc stands still', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await serveList(page, play());
	await buttonsReady(page);
	// Hold the audio so the button stays busy.
	await page.route('https://m.cdn.media/**', () => {});
	await page.locator('showfm-play [data-play]').click();
	const busy = page.locator('showfm-play .busy');
	await expect(busy).toHaveCount(1);
	expect(await busy.evaluate((element) => getComputedStyle(element, '::after').animationName)).toBe(
		'none'
	);
});
