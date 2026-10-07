/**
 * <showfm-episodes> in Chromium, against the built v1.js and its lazy chunk.
 *
 * - Card and Minimal at 340, 720 and 1100px wide, in every layout: nothing
 *   spills out of the element, and Auto and the grid's fallback under 480px
 *   resolve as the design says (page 1).
 * - Upgrading from the fallback list moves nothing below the element when
 *   the snippet reserves the list's height with --showfm-height.
 * - The chunk is fetched only when a list is on the page, with the page's
 *   CSP nonce, and a load="click" list fetches nothing until it is pressed.
 * - A row really plays and pauses through the page's audio.
 */
import { expect, test, type Page } from '@playwright/test';
import { API_ORIGIN, CLICK_LOADER, listReady, serveList } from './episodes-harness';

const list = (attributes = '', inner = '') =>
	`<showfm-episodes podcast="the-long-table" api="${API_ORIGIN}" ${attributes}>${inner}</showfm-episodes>`;

const fallback = (count: number) =>
	`<ul>${Array.from({ length: count }, (_, i) => `<li><a href="https://show.fm/the-long-table/e/episode-${i + 1}">Episode ${i + 1}</a></li>`).join('')}</ul>`;

/** Waits for the list's images, so its height is final. */
const imagesLoaded = (page: Page) =>
	page.waitForFunction(() =>
		[
			...(document.querySelector('showfm-episodes')?.shadowRoot?.querySelectorAll('img') ?? [])
		].every((img) => img.complete)
	);

const listClass = (page: Page) =>
	page
		.locator('showfm-episodes')
		.evaluate((host) => host.shadowRoot!.querySelector('.list')!.className);

for (const variant of ['card', 'minimal'] as const) {
	for (const width of [340, 720, 1100]) {
		test(`${variant} at ${width}px: every layout fits`, async ({ page }) => {
			await page.setViewportSize({ width: width + 32, height: 900 });
			for (const layout of ['auto', 'list', 'grid', 'compact']) {
				await serveList(page, list(`variant="${variant}" layout="${layout}"`), {}, { width });
				await listReady(page);
				await imagesLoaded(page);
				const fit = await page.locator('showfm-episodes').evaluate((host) => {
					const box = host.getBoundingClientRect();
					const spills: string[] = [];
					for (const element of host.shadowRoot!.querySelectorAll<HTMLElement>('*')) {
						const rect = element.getBoundingClientRect();
						// Visually hidden text is clipped to nothing, 1px off the edge.
						if ((!rect.width && !rect.height) || element.closest('.vh')) continue;
						if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) {
							spills.push(`${element.localName}.${element.className}`);
						}
					}
					const root = document.documentElement;
					return {
						width: box.width,
						spills,
						pageScrolls: root.scrollWidth > root.clientWidth
					};
				});
				expect(fit.width, layout).toBe(width);
				expect(fit.spills, layout).toEqual([]);
				expect(fit.pageScrolls, layout).toBe(false);
				// Auto: a grid from 900px (for Card, when half the episodes have
				// their own artwork; six of the seven do). A grid under 480px is a list.
				const resolved =
					layout === 'auto'
						? width >= 900
							? 'grid'
							: 'list'
						: layout === 'grid' && width < 480
							? 'list'
							: layout;
				expect(await listClass(page), layout).toContain(`l-${resolved}`);
			}
		});
	}
}

for (const variant of ['card', 'minimal'] as const) {
	test(`${variant}: upgrading from the fallback moves nothing below it`, async ({ page }) => {
		const attributes = `variant="${variant}" count="4"`;
		// What the builder does: measure the list, then reserve that height.
		await serveList(page, list(attributes));
		await listReady(page);
		await imagesLoaded(page);
		const height = Math.ceil(
			await page.locator('showfm-episodes').evaluate((host) => host.getBoundingClientRect().height)
		);

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
			list(`${attributes} style="--showfm-height:${height}px"`, fallback(4)),
			{},
			{ gate }
		);
		const after = page.locator('#after');
		await after.waitFor();
		const before = (await after.boundingBox())!.y;
		expect(before).toBeGreaterThanOrEqual(height);
		release();
		await listReady(page);
		await imagesLoaded(page);
		expect((await after.boundingBox())!.y).toBe(before);
		const shifts = await page.evaluate(() => (window as unknown as { shifts: number[] }).shifts);
		expect(shifts).toEqual([]);
	});
}

test('the chunk is fetched only once a list is on the page', async ({ page }) => {
	const requests = await serveList(page, '<p>No list here.</p>');
	await page.waitForFunction(() => customElements.get('showfm-episodes'));
	expect(requests.filter((path) => path.startsWith('chunks/'))).toEqual([]);

	await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html + html), list());
	await page.waitForFunction(
		() =>
			document.querySelectorAll('showfm-episodes').length === 2 &&
			[...document.querySelectorAll('showfm-episodes')].every((host) =>
				host.shadowRoot?.querySelector('[data-row]')
			)
	);
	expect(requests.filter((path) => path.startsWith('chunks/'))).toHaveLength(1);
});

test('the chunk runs under a nonce-only CSP', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await serveList(
		page,
		list(),
		{},
		{
			csp: "script-src 'nonce-n0nce'",
			script: '<script nonce="n0nce" src="/player/v1.js"></script>'
		}
	);
	await listReady(page);
	expect(errors.filter((text) => /Content Security Policy/i.test(text))).toEqual([]);
});

test('load="click": nothing is fetched until the facade is pressed', async ({ page }) => {
	const requests = await serveList(
		page,
		list('load="click"', fallback(3)) +
			list('load="click"', fallback(3)).replace('the-long-table', 'another-show'),
		{},
		{ script: `<script data-src="/player/v1.js">${CLICK_LOADER}</script>` }
	);
	const [first, second] = await page.locator('showfm-episodes').all();
	await expect(first.getByRole('button', { name: 'Load episodes' })).toBeVisible();
	expect(requests.filter((path) => path !== 'v1-fallback.css')).toEqual([]);

	await first.getByRole('button', { name: 'Load episodes' }).click();
	await listReady(page);
	// The list takes the press: focus moves to the first episode's play button.
	await expect
		.poll(() =>
			first.evaluate((host) => host.shadowRoot!.activeElement?.hasAttribute('data-play') ?? false)
		)
		.toBe(true);
	await expect(first.locator('[data-showfm-facade-ui]')).toHaveCount(0);

	// The other list is defined now, but stays a facade and asks for nothing.
	expect(await second.evaluate((host) => host.shadowRoot)).toBeNull();
	await expect(second.getByRole('button', { name: 'Load episodes' })).toBeVisible();
	await expect(second.locator('ul')).toBeHidden();
	expect(requests.filter((path) => path.includes('another-show'))).toEqual([]);
});

type Played = { played: HTMLMediaElement[] };

test('a row plays and pauses through the page audio', async ({ page }) => {
	// The page's shared audio is never in the document: note it when it plays.
	await page.addInitScript(() => {
		const played: HTMLMediaElement[] = ((window as unknown as Played).played = []);
		const play = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function () {
			if (!played.includes(this)) played.push(this);
			return play.call(this);
		};
	});
	await serveList(page, list('count="3"'));
	await listReady(page);
	const host = page.locator('showfm-episodes');
	const row = host.locator('[data-row]').first();
	const play = row.locator('[data-play]');
	await expect(play).toHaveAccessibleName(/^Play: Sourdough/);
	await play.click();
	await expect(play).toHaveAccessibleName(/^Pause: Sourdough/);
	await expect(row.getByText('Now playing')).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as Played).played[0]?.currentTime ?? 0))
		.toBeGreaterThan(0);
	await play.click();
	await expect(play).toHaveAccessibleName(/^Play: Sourdough/);
	expect(
		await page.evaluate(() => (window as unknown as Played).played.map((audio) => audio.paused))
	).toEqual([true]);
});
