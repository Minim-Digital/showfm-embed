/**
 * <showfm-player mini-player="on"> in Chromium, against the built v1.js and
 * its chunks: when the visitor scrolls the player out of view while it
 * plays, the page's mini-player takes over the player's own audio.
 *
 * - Nothing restarts: the same audio carries on, and the page's shared
 *   audio is not used. The mini-player's controls drive the player.
 * - Not for a paused player, nor while the player is in view; never
 *   without the attribute (off by default).
 * - One audio at a time: a play button starting pauses the player and
 *   takes the mini-player over.
 * - mini-player-position and the theme reach it; reduced motion runs no
 *   animation; axe finds nothing.
 */
import { expect, test, type Page } from '@playwright/test';
import { API_ORIGIN, serveList } from './episodes-harness';
import { expectNoAxeViolations } from './axe';
import { sampleEpisodes } from '../fixtures/episodes';

const [EPISODE, OTHER] = sampleEpisodes();
const SPACER = '<div style="height:3000px"></div>';

const player = (attributes = 'mini-player="on"') =>
	`<showfm-player episode="${EPISODE.id}" api="${API_ORIGIN}" ${attributes}></showfm-player>`;

const bar = (page: Page) => page.locator('showfm-mini-player section');

/** The player's own audio: playing, and where. */
const playerAudio = (page: Page) =>
	page.locator('showfm-player').evaluate((host) => {
		const audio = host.shadowRoot!.querySelector('audio')!;
		return { paused: audio.paused, time: audio.currentTime };
	});

/** The page's shared audio, if anything has made it. */
const sharedState = (page: Page) =>
	page.evaluate(() => {
		const controller = (globalThis as unknown as Record<symbol, { sharedState(): unknown }>)[
			Symbol.for('showfm.page-audio-controller.v1')
		];
		return controller.sharedState();
	});

async function playPlayer(page: Page) {
	await page.locator('showfm-player [part="play"]').click();
	await expect(page.locator('showfm-player [part="play"]')).toHaveAccessibleName('Pause');
	await expect.poll(async () => (await playerAudio(page)).time).toBeGreaterThan(0.2);
}

const scrollAway = (page: Page) => page.evaluate(() => window.scrollTo(0, 2500));
const scrollBack = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));

test('scrolled out of view while it plays, the mini-player takes over its audio', async ({
	page
}) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await serveList(page, player() + SPACER, {}, { width: 1068 });
	await playPlayer(page);
	// In view: nothing yet.
	await expect(bar(page)).toHaveCount(0);

	await scrollAway(page);
	await expect(bar(page)).toBeVisible();
	await expect(bar(page).locator('.title')).toHaveText(EPISODE.title);
	// The same audio carries on, and the page's shared audio is not used.
	const handed = await playerAudio(page);
	expect(handed.paused).toBe(false);
	await expect.poll(async () => (await playerAudio(page)).time).toBeGreaterThan(handed.time);
	expect(await sharedState(page)).toBeNull();
	await expectNoAxeViolations(page);

	// Its controls drive the player.
	await bar(page)
		.getByRole('button', { name: `Pause: ${EPISODE.title}` })
		.click();
	expect((await playerAudio(page)).paused).toBe(true);
	await scrollBack(page);
	await expect(page.locator('showfm-player [part="play"]')).toHaveAccessibleName('Play');
	// Back in view, the mini-player stays: both control the same audio.
	await expect(bar(page)).toBeVisible();
	await bar(page)
		.getByRole('button', { name: `Play: ${EPISODE.title}` })
		.click();
	await expect(page.locator('showfm-player [part="play"]')).toHaveAccessibleName('Pause');
});

test('not for a paused player, and never without mini-player="on"', async ({ page }) => {
	await serveList(page, player() + SPACER);
	await playPlayer(page);
	await page.locator('showfm-player [part="play"]').click();
	await scrollAway(page);
	await page.waitForTimeout(300);
	await expect(bar(page)).toHaveCount(0);

	// Off by default: no mini-player element at all.
	await serveList(page, player('') + SPACER);
	await playPlayer(page);
	await scrollAway(page);
	await page.waitForTimeout(300);
	await expect(page.locator('showfm-mini-player')).toHaveCount(0);
	expect((await playerAudio(page)).paused).toBe(false);
});

test('one audio at a time: a play button starting pauses the player and takes it over', async ({
	page
}) => {
	await serveList(
		page,
		player() +
			SPACER +
			`<showfm-play episode="${OTHER.id}" api="${API_ORIGIN}" mini-player="on"></showfm-play>`
	);
	await playPlayer(page);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await expect(bar(page).locator('.title')).toHaveText(EPISODE.title);
	await page.locator('showfm-play [data-play]').click();
	await expect(bar(page).locator('.title')).toHaveText(OTHER.title);
	expect((await playerAudio(page)).paused).toBe(true);
	expect(await sharedState(page)).not.toBeNull();
	await expect(page.locator('showfm-play [data-play]')).toHaveAccessibleName(/^Pause/);
});

test('mini-player-position, the theme and reduced motion carry over from the player', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
	await serveList(
		page,
		player('mini-player="on" mini-player-position="left" theme="dark"') + SPACER,
		{},
		{ head: '<style>body{background:#0e0d13;color:#ecebf0}</style>' }
	);
	await playPlayer(page);
	await scrollAway(page);
	await expect(bar(page)).toBeVisible();
	const looks = await page.locator('showfm-mini-player').evaluate((host) => {
		const root = host.shadowRoot!;
		const mini = root.querySelector<HTMLElement>('.mini')!;
		return {
			left: mini.classList.contains('pos-left'),
			background: getComputedStyle(root.querySelector('section')!).backgroundColor,
			running: root.getAnimations().filter((animation) => animation.playState === 'running').length
		};
	});
	expect(looks.left).toBe(true);
	// The dark theme's card (#17151f), not the light one.
	expect(looks.background).toBe('rgb(23, 21, 31)');
	expect(looks.running).toBe(0);
	// Collapsed, the pill sits in the left corner.
	await bar(page).getByRole('button', { name: 'Collapse player' }).click();
	const pill = await bar(page).boundingBox();
	expect(pill!.x).toBeLessThan(100);
	await expectNoAxeViolations(page);
});
