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
 *
 * "Powered by show.fm" shows once per page (1.1), so each player that is
 * measured is alone on its page. The audio is on a show.fm media host, so
 * the full player carries its Download button as it does in production.
 *
 * Since 1.4 the player takes the page's font (decision 5), so the contract
 * is measured in four host fonts (fonts.ts): the platform's UI font, Geist,
 * a wide serif and a narrow sans, through the page's font and through
 * --showfm-font. Pages never change these heights.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { PLAYER_MIN_HEIGHTS } from '../../src/lib/heights';
import { STRING_TABLES } from '../../src/lib/string-tables';
import { episodePayload } from '../fixtures/episode';
import {
	HOST_FONTS,
	family,
	fontFaces,
	fontFile,
	fontsLoaded,
	hostFontHead,
	type HostFont
} from './fonts';

const PAGE_ORIGIN = 'https://host.example.test';
const API_ORIGIN = 'https://api.example.test';
const BRANDED_ID = '11111111-2222-4333-8444-555555555555';
const UNBRANDED_ID = '22222222-3333-4444-8555-666666666666';
const HOSTED_AUDIO = 'https://m.cdn.media/test-signal/episode-one.mp3';
const PLAYER_JS = readFileSync(fileURLToPath(new URL('../../dist/cdn/v1.js', import.meta.url)));
// A 1x1 PNG for the artwork.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

type Api = 'ok' | 'pending' | 'fail' | 'not-found' | 'suspended' | 'no-audio' | 'external';

/** Serves a host page, v1.js and a tiny mock of the public API. */
async function serve(
	page: Page,
	body: string,
	api: Api = 'ok',
	{ width = 640, font, head = '' }: { width?: number; font?: HostFont; head?: string } = {}
) {
	locales.length = 0;
	await page.route(`${PAGE_ORIGIN}/**`, (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/player/v1.js') {
			return route.fulfill({ body: PLAYER_JS, contentType: 'text/javascript' });
		}
		// The locale chunks v1.js adds from next to itself for German and French.
		const locale = /^\/player\/locales\/(de|fr)\.js$/.exec(path);
		if (locale) {
			locales.push(locale[1]);
			return route.fulfill({
				body: readFileSync(
					fileURLToPath(new URL(`../../dist/cdn/locales/${locale[1]}.js`, import.meta.url))
				),
				contentType: 'text/javascript'
			});
		}
		const file = fontFile(path);
		if (file) return route.fulfill({ body: file, contentType: 'font/woff2' });
		return route.fulfill({
			contentType: 'text/html',
			body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;width:${width}px}</style>${font ? hostFontHead(font) : ''}${head}</head><body>${body}<script src="/player/v1.js"></script></body></html>`
		});
	});
	await page.route(`${API_ORIGIN}/**`, (route) => {
		if (api === 'pending') return;
		if (api === 'fail') return route.fulfill({ status: 500, body: '' });
		if (api === 'not-found' || api === 'suspended') {
			const notFound = api === 'not-found';
			return route.fulfill({
				status: notFound ? 404 : 403,
				contentType: 'application/json',
				headers: { 'access-control-allow-origin': '*' },
				body: JSON.stringify({
					error: notFound
						? { code: 'not_found', message: 'Episode not found.' }
						: { code: 'unavailable', message: 'This episode can’t be played right now.' }
				})
			});
		}
		const id = new URL(route.request().url()).pathname.split('/').pop();
		const payload = episodePayload({ branded: id !== UNBRANDED_ID });
		const url = api === 'no-audio' ? null : api === 'external' ? payload.audio.url : HOSTED_AUDIO;
		const data = { ...payload, audio: { ...payload.audio, url } };
		return route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify({ data: { ...data, id } })
		});
	});
	await page.route('https://media.example.test/**', (route) =>
		route.fulfill({ body: PNG, contentType: 'image/png' })
	);
	// preload="none": nothing should ask for the audio, but never reach out.
	await page.route('https://m.cdn.media/**', (route) => route.fulfill({ status: 204 }));
	await page.goto(`${PAGE_ORIGIN}/`);
}

type Size = 'standard' | 'compact';
/** Locale chunks requested since the last serve(). */
const locales: string[] = [];
const brandOf = (id: string) => (id === BRANDED_ID ? 'branded' : 'unbranded');

const player = (id: string, size: Size, tag = 'showfm-player', style = '') =>
	`<${tag} id="p-${size}-${brandOf(id)}${style ? '-reserved' : ''}" episode="${id}" size="${size}" api="${API_ORIGIN}"${style ? ` style="${style}"` : ''}></${tag}>`;

/** The element as the app's embed snippet writes it, with its reserved height. */
const reserved = (id: string, size: Size, tag: string) =>
	player(id, size, tag, `display:block;min-height:${PLAYER_MIN_HEIGHTS[size][brandOf(id)]}px`);

async function heightOf(page: Page, selector: string) {
	return page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);
}

const VARIANTS = [
	[BRANDED_ID, 'standard'],
	[UNBRANDED_ID, 'standard'],
	[BRANDED_ID, 'compact'],
	[UNBRANDED_ID, 'compact']
] as const;

/** Each player alone on its page, bare and with the snippet's reservation. */
async function measureContract(
	page: Page,
	tag: string,
	{ extra = '', font, head = '' }: { extra?: string; font?: HostFont; head?: string } = {}
) {
	const bare = { standard: { branded: 0, unbranded: 0 }, compact: { branded: 0, unbranded: 0 } };
	const withReservation = structuredClone(bare);
	for (const [id, size] of VARIANTS) {
		for (const reservedHeight of [false, true]) {
			const html = (reservedHeight ? reserved(id, size, tag) : player(id, size, tag)).replace(
				` api=`,
				`${extra} api=`
			);
			await serve(page, html, 'ok', { font, head });
			await expect(page.locator('[part="container"]')).toHaveCount(1);
			await expect(page.locator('[part="footer"]')).toHaveCount(id === BRANDED_ID ? 1 : 0);
			if (font) expect(await fontsLoaded(page, font)).toBe(true);
			await page.evaluate(() => document.fonts.ready);
			const height = await heightOf(page, tag);
			(reservedHeight ? withReservation : bare)[size][brandOf(id)] = height;
		}
	}
	return { bare, withReservation };
}

/** The font the player's title is drawn in. */
const titleFont = (page: Page) =>
	page.locator('[part="title"]').evaluate((title) => getComputedStyle(title).fontFamily);

for (const tag of ['showfm-player', 'podcasterplus-player']) {
	test(`<${tag}> renders the four contract heights`, async ({ page }) => {
		const { bare, withReservation } = await measureContract(page, tag);
		console.log(`<${tag}> rendered heights: ${JSON.stringify(bare)}`);
		console.log(
			`<${tag}> heights with the snippet's reservation: ${JSON.stringify(withReservation)}`
		);
		expect(roundUp(bare)).toEqual(PLAYER_MIN_HEIGHTS);
		expect(withReservation).toEqual(PLAYER_MIN_HEIGHTS);
	});
}

// Decision 5: the player is drawn in the host's font, so the contract has to
// hold in any of them. These are the extremes.
for (const font of HOST_FONTS) {
	test(`the four contract heights hold in the host's font: ${font}`, async ({ page }) => {
		const { bare, withReservation } = await measureContract(page, 'showfm-player', { font });
		console.log(`${font}: rendered ${JSON.stringify(bare)}`);
		expect(await titleFont(page)).toBe(family(font));
		expect(roundUp(bare)).toEqual(PLAYER_MIN_HEIGHTS);
		expect(withReservation).toEqual(PLAYER_MIN_HEIGHTS);
	});
}

test('--showfm-font and --showfm-font-title keep the four contract heights', async ({ page }) => {
	// The page is in the platform font; the hooks pick a narrow sans for the
	// player and a wide serif for its title.
	const head = `<style>${fontFaces('oswald')}${fontFaces('merriweather')}:root{--showfm-font:'Oswald';--showfm-font-title:'Merriweather'}</style>`;
	const { bare, withReservation } = await measureContract(page, 'showfm-player', {
		font: 'system',
		head
	});
	expect(await fontsLoaded(page, 'oswald')).toBe(true);
	expect(await fontsLoaded(page, 'merriweather')).toBe(true);
	expect(await titleFont(page)).toBe('Merriweather');
	expect(
		await page
			.locator('[part="container"]')
			.evaluate((player) => getComputedStyle(player).fontFamily)
	).toBe('Oswald');
	expect(roundUp(bare)).toEqual(PLAYER_MIN_HEIGHTS);
	expect(withReservation).toEqual(PLAYER_MIN_HEIGHTS);
});

test('heading-level keeps the four contract heights', async ({ page }) => {
	const { bare, withReservation } = await measureContract(page, 'showfm-player', {
		extra: ' heading-level="3"'
	});
	await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1);
	expect(roundUp(bare)).toEqual(PLAYER_MIN_HEIGHTS);
	expect(withReservation).toEqual(PLAYER_MIN_HEIGHTS);
});

test('external audio (no Download) keeps the standard heights', async ({ page }) => {
	for (const id of [BRANDED_ID, UNBRANDED_ID]) {
		await serve(page, player(id, 'standard'), 'external');
		await expect(page.locator('[part="container"]')).toHaveCount(1);
		await expect(page.locator('[part="download"]')).toHaveCount(0);
		await expect(page.locator('[part="share"]')).toHaveCount(1);
		expect(Math.ceil(await heightOf(page, 'showfm-player'))).toBe(
			PLAYER_MIN_HEIGHTS.standard[brandOf(id)]
		);
	}
});

test('"Powered by" shows once per page, inside the reserved heights', async ({ page }) => {
	await serve(
		page,
		reserved(BRANDED_ID, 'standard', 'showfm-player').replace('id="p-', 'id="first-p-') +
			reserved(BRANDED_ID, 'standard', 'showfm-player')
	);
	await expect(page.locator('[part="container"]')).toHaveCount(2);
	await expect(page.locator('[part="footer"]')).toHaveCount(1);
	// The second card is the unbranded 252px inside its 291px reservation:
	// the page does not move.
	expect(await heightOf(page, '#first-p-standard-branded-reserved')).toBe(291);
	expect(await heightOf(page, '#p-standard-branded-reserved')).toBe(291);
	const cards = await page
		.locator('[part="container"]')
		.evaluateAll((all) => all.map((card) => Math.ceil(card.getBoundingClientRect().height)));
	expect(cards).toEqual([291, 252]);
});

function roundUp(heights: typeof PLAYER_MIN_HEIGHTS) {
	return {
		standard: {
			branded: Math.ceil(heights.standard.branded),
			unbranded: Math.ceil(heights.standard.unbranded)
		},
		compact: {
			branded: Math.ceil(heights.compact.branded),
			unbranded: Math.ceil(heights.compact.unbranded)
		}
	};
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
	await expect(page.getByText('This episode can’t be played right now.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Listen on show.fm' })).toBeVisible();
});

test('a 404 collapses the element and releases its reserved height', async ({ page }) => {
	await serve(
		page,
		`<p id="before">Before</p>${reserved(BRANDED_ID, 'standard', 'showfm-player').replace('></showfm-player>', '><a href="https://show.fm/">Listen on show.fm</a></showfm-player>')}<p id="after">After</p>`,
		'not-found'
	);
	await expect(page.locator('showfm-player')).toHaveAttribute('data-showfm-collapsed', '');
	expect(await heightOf(page, 'showfm-player')).toBe(0);
	await expect(page.getByRole('link', { name: 'Listen on show.fm' })).toBeHidden();
	const gap = await page.evaluate(
		() =>
			document.getElementById('after')!.getBoundingClientRect().top -
			document.getElementById('before')!.getBoundingClientRect().bottom
	);
	expect(gap).toBeLessThan(40);
});

test('a suspended show (403) shows its message inside the reserved heights', async ({ page }) => {
	await serve(
		page,
		reserved(BRANDED_ID, 'standard', 'showfm-player') +
			reserved(BRANDED_ID, 'compact', 'showfm-player'),
		'suspended'
	);
	await expect(page.getByText('This show isn’t available right now.')).toHaveCount(2);
	await expect(page.getByRole('link')).toHaveCount(0);
	await expect(page.getByRole('button')).toHaveCount(0);
	expect(await heightOf(page, '#p-standard-branded-reserved')).toBe(291);
	expect(await heightOf(page, '#p-compact-branded-reserved')).toBe(101);
});

test('the load="click" facade fits the reserved heights and requests nothing', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	const facade = (id: string, size: Size) =>
		reserved(id, size, 'showfm-player').replace(' api=', ' load="click" api=');
	await serve(
		page,
		VARIANTS.map(([id, size]) => facade(id, size)).join('') +
			player(BRANDED_ID, 'standard').replace(' api=', ' load="click" api=')
	);
	await expect(page.getByRole('button', { name: 'Play podcast episode' })).toHaveCount(5);
	expect(requests.filter((url) => url.startsWith(API_ORIGIN))).toEqual([]);
	for (const [id, size] of VARIANTS) {
		expect(await heightOf(page, `#p-${size}-${brandOf(id)}-reserved`)).toBe(
			PLAYER_MIN_HEIGHTS[size][brandOf(id)]
		);
	}
	// Bare, the facade takes the unbranded height, like the skeleton.
	expect(await heightOf(page, '#p-standard-branded')).toBe(PLAYER_MIN_HEIGHTS.standard.unbranded);
	await page.getByRole('button', { name: 'Play podcast episode' }).first().click();
	await expect(page.locator('[part="container"]')).toHaveCount(1);
	expect(requests.filter((url) => url.startsWith(API_ORIGIN))).toHaveLength(1);
	expect(await heightOf(page, '#p-standard-branded-reserved')).toBe(291);
});

// Design page 8: error, blocked and suspended copy stays on one line in the
// compact player at its 320px minimum, in every language. The width is the
// real limit; the character counts in strings.ts are its proxy.
for (const lang of ['en', 'de', 'fr']) {
	test(`[${lang}] the error, blocked and suspended copy fits one line at 320px`, async ({
		page
	}) => {
		const compact = (id: string) =>
			`<showfm-player id="${id}" lang="${lang}" episode="${BRANDED_ID}" size="compact" api="${API_ORIGIN}"></showfm-player>`;
		await serve(page, compact('error'), 'no-audio', { width: 320, font: 'geist' });
		const strings = STRING_TABLES[lang as keyof typeof STRING_TABLES];
		const error = page.locator('#error [part="error"] p');
		// German and French arrive as a locale chunk: wait for the language.
		await expect(error).toHaveText(strings.error);
		expect(locales).toEqual(lang === 'en' ? [] : [lang]);
		await page.evaluate(() => document.fonts.load('14px Geist'));
		expect(await page.evaluate(() => document.fonts.check('14px Geist'))).toBe(true);
		const lineHeight = await error.evaluate((p) => parseFloat(getComputedStyle(p).lineHeight));
		// One line, and the whole sentence on it (the compact card cuts a
		// longer one with an ellipsis rather than adding a line).
		const fitsOneLine = (p: HTMLElement, line: number) =>
			p.getBoundingClientRect().height <= Math.ceil(line) && p.scrollWidth <= p.clientWidth;
		expect(await error.evaluate(fitsOneLine, lineHeight)).toBe(true);

		// The blocked card: the browser refuses play().
		await serve(page, compact('blocked'), 'ok', { width: 320, font: 'geist' });
		await page.evaluate(() => {
			HTMLMediaElement.prototype.play = () =>
				Promise.reject(new DOMException('blocked', 'NotAllowedError'));
		});
		await page.locator('#blocked [part="play"]').click();
		const blocked = page.locator('#blocked [part="error"] p');
		await expect(blocked).toHaveText(strings.blocked);
		await page.evaluate(() => document.fonts.load('14px Geist'));
		expect(await blocked.evaluate(fitsOneLine, lineHeight)).toBe(true);

		await serve(page, compact('suspended'), 'suspended', { width: 320, font: 'geist' });
		const suspended = page.locator('#suspended [part="error"] p');
		await expect(suspended).toHaveText(strings.suspended);
		await page.evaluate(() => document.fonts.load('14px Geist'));
		const fits = await suspended.evaluate((p) => p.scrollWidth <= p.clientWidth);
		expect(fits).toBe(true);
	});
}
