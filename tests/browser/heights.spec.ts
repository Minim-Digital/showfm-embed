/**
 * The height contract, measured in Chromium against the built v1.js.
 *
 * Embed snippets reserve these heights on the host element before v1.js
 * loads (PLAYER_MIN_HEIGHTS), and the iframe and oEmbed heights are derived
 * from them. If a rendered player stops matching, existing embeds shift or
 * clip, so this fails on any difference.
 *
 * The player's line heights are unitless, so a rendered height can be a
 * fractional pixel (the compact player renders 100.5px and 82.5px). The
 * contract value is that height rounded up, which is what the snippet
 * reserves. So each player is measured twice: bare, where the height must
 * round up to the contract value, and with the snippet's reserved
 * min-height, where it must equal the contract value exactly (no shift when
 * the element upgrades).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { PLAYER_MIN_HEIGHTS } from '../../src/lib/heights';
import { episodePayload } from '../fixtures/episode';

const PAGE_ORIGIN = 'https://host.example.test';
const API_ORIGIN = 'https://api.example.test';
const BRANDED_ID = '11111111-2222-4333-8444-555555555555';
const UNBRANDED_ID = '22222222-3333-4444-8555-666666666666';
const PLAYER_JS = readFileSync(fileURLToPath(new URL('../../dist/cdn/v1.js', import.meta.url)));
// A 1x1 PNG for the artwork.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

/** Serves a host page, v1.js and a tiny mock of the public API. */
async function serve(page: Page, body: string, api: 'ok' | 'pending' | 'fail' = 'ok') {
	await page.route(`${PAGE_ORIGIN}/**`, (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/player/v1.js') {
			return route.fulfill({ body: PLAYER_JS, contentType: 'text/javascript' });
		}
		return route.fulfill({
			contentType: 'text/html',
			body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;width:640px}</style></head><body>${body}<script src="/player/v1.js"></script></body></html>`
		});
	});
	await page.route(`${API_ORIGIN}/**`, (route) => {
		if (api === 'pending') return;
		if (api === 'fail') return route.fulfill({ status: 404, body: '' });
		const id = new URL(route.request().url()).pathname.split('/').pop();
		const data = episodePayload({ branded: id !== UNBRANDED_ID });
		return route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify({ data: { ...data, id } })
		});
	});
	await page.route('https://media.example.test/**', (route) =>
		route.fulfill({ body: PNG, contentType: 'image/png' })
	);
	await page.goto(`${PAGE_ORIGIN}/`);
}

type Size = 'standard' | 'compact';
const brandOf = (id: string) => (id === BRANDED_ID ? 'branded' : 'unbranded');

const player = (id: string, size: Size, tag = 'showfm-player', style = '') =>
	`<${tag} id="p-${size}-${brandOf(id)}${style ? '-reserved' : ''}" episode="${id}" size="${size}" api="${API_ORIGIN}"${style ? ` style="${style}"` : ''}></${tag}>`;

/** The element as the app's embed snippet writes it, with its reserved height. */
const reserved = (id: string, size: Size, tag: string) =>
	player(id, size, tag, `display:block;min-height:${PLAYER_MIN_HEIGHTS[size][brandOf(id)]}px`);

async function heightOf(page: Page, selector: string) {
	return page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);
}

for (const tag of ['showfm-player', 'podcasterplus-player']) {
	test(`<${tag}> renders the four contract heights`, async ({ page }) => {
		const variants = [
			[BRANDED_ID, 'standard'],
			[UNBRANDED_ID, 'standard'],
			[BRANDED_ID, 'compact'],
			[UNBRANDED_ID, 'compact']
		] as const;
		await serve(
			page,
			variants.map(([id, size]) => player(id, size, tag) + reserved(id, size, tag)).join('')
		);
		await expect(page.locator('[part="container"]')).toHaveCount(8);
		await expect(page.locator('[part="footer"]')).toHaveCount(4);
		await page.evaluate(() => document.fonts.ready);

		const measure = async (suffix: string) => ({
			standard: {
				branded: await heightOf(page, `#p-standard-branded${suffix}`),
				unbranded: await heightOf(page, `#p-standard-unbranded${suffix}`)
			},
			compact: {
				branded: await heightOf(page, `#p-compact-branded${suffix}`),
				unbranded: await heightOf(page, `#p-compact-unbranded${suffix}`)
			}
		});
		const bare = await measure('');
		const withReservation = await measure('-reserved');
		console.log(`<${tag}> rendered heights: ${JSON.stringify(bare)}`);
		console.log(
			`<${tag}> heights with the snippet's reservation: ${JSON.stringify(withReservation)}`
		);

		const roundedUp = {
			standard: {
				branded: Math.ceil(bare.standard.branded),
				unbranded: Math.ceil(bare.standard.unbranded)
			},
			compact: {
				branded: Math.ceil(bare.compact.branded),
				unbranded: Math.ceil(bare.compact.unbranded)
			}
		};
		expect(roundedUp).toEqual(PLAYER_MIN_HEIGHTS);
		expect(withReservation).toEqual(PLAYER_MIN_HEIGHTS);
	});
}

test('the loading skeleton reserves the unbranded heights (252 and 83)', async ({ page }) => {
	await serve(page, player(BRANDED_ID, 'standard') + player(BRANDED_ID, 'compact'), 'pending');
	await expect(page.locator('[role="status"]')).toHaveCount(2);
	expect(await heightOf(page, '#p-standard-branded')).toBe(PLAYER_MIN_HEIGHTS.standard.unbranded);
	expect(await heightOf(page, '#p-compact-branded')).toBe(PLAYER_MIN_HEIGHTS.compact.unbranded);
});

test('the light-DOM fallback link shows when the episode cannot load', async ({ page }) => {
	await serve(
		page,
		`<showfm-player episode="${BRANDED_ID}" api="${API_ORIGIN}"><a href="https://show.fm/">Listen on show.fm</a></showfm-player>`,
		'fail'
	);
	await expect(page.getByText('This episode can’t be loaded right now.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Listen on show.fm' })).toBeVisible();
});
