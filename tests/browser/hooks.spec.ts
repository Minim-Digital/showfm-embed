/**
 * The styling hooks and the colours derived from them, in Chromium against
 * the built v1.js and its chunks.
 *
 * Every element (the player, the list in Card and Minimal, the play button,
 * the mini-player and the transcript) at 340, 720 and 1100px, light and
 * dark, in Geist and two host fonts at the extremes (a wide serif and a
 * narrow sans):
 *
 * - every piece of visible text reaches WCAG AA on what is really behind it
 *   (4.5:1, or 3:1 when large), read from the computed styles;
 * - nothing spills out of its element sideways and the page never scrolls
 *   sideways;
 * - the fixed heights hold: the player 291px, the play button's 40px line,
 *   the transcript 377px;
 * - a full-page screenshot goes to test-results/ (CI keeps it as an
 *   artifact) for review. They are not compared with stored images: font
 *   rendering differs between the machines that run this.
 *
 * Then the hooks themselves: colour hooks on :root and on an element, a
 * site's own dark mode, the mini-player carrying its opener's hooks, the
 * clamped radius, space and font scale, colours written as rgb(), hsl() or a
 * name, and the focus ring.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { API_ORIGIN, listReady, serveList } from './episodes-harness';
import { serveTranscript, transcriptReady } from './transcript-harness';
import { fontsLoaded, hostFontHead, type HostFont } from './fonts';
import { sampleEpisodes } from '../fixtures/episodes';
import { TRANSCRIPT_EPISODE_ID } from '../fixtures/transcript';

const EPISODE = sampleEpisodes()[0];
const PODCAST = '99999999-8888-4777-8666-555555555555';
const DARK_PAGE = '#0e0d13';

type Theme = 'light' | 'dark' | 'auto';

/** A failure found by audit(): what, where, and the numbers. */
interface Finding {
	host: string;
	what: string;
	detail: string;
}

/**
 * Checks every element's shadow tree (and the shadow trees inside it) for
 * text below AA on its real background, and for anything that spills out
 * of the element sideways. Runs in the page.
 */
function audit(selectors: string[]): { findings: Finding[]; texts: number } {
	type Rgba = [number, number, number, number];
	const parse = (value: string): Rgba | null => {
		const match = /rgba?\(([^)]+)\)/.exec(value);
		if (!match) return null;
		const parts = match[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map((part) => (part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part)));
		return [parts[0], parts[1], parts[2], parts[3] ?? 1];
	};
	const over = (top: Rgba, bottom: Rgba): Rgba => {
		const a = top[3];
		return [
			top[0] * a + bottom[0] * (1 - a),
			top[1] * a + bottom[1] * (1 - a),
			top[2] * a + bottom[2] * (1 - a),
			1
		];
	};
	const luminance = ([r, g, b]: Rgba) => {
		const linear = (channel: number) => {
			const c = channel / 255;
			return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		};
		return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
	};
	const ratio = (a: Rgba, b: Rgba) => {
		const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (light + 0.05) / (dark + 0.05);
	};
	const parentOf = (element: Element): Element | null =>
		element.parentElement ?? ((element.parentNode as ShadowRoot | null)?.host || null);
	/** The colour behind an element: every background up to the first opaque one. */
	const behind = (element: Element): Rgba => {
		const layers: Rgba[] = [];
		for (let at: Element | null = element; at; at = parentOf(at)) {
			const color = parse(getComputedStyle(at).backgroundColor);
			if (color && color[3] > 0) layers.push(color);
			if (color && color[3] === 1) break;
		}
		return layers.reverse().reduce<Rgba>((bg, layer) => over(layer, bg), [255, 255, 255, 1]);
	};
	const opacity = (element: Element) => {
		let value = 1;
		for (let at: Element | null = element; at; at = parentOf(at)) {
			value *= Number(getComputedStyle(at).opacity);
		}
		return value;
	};
	const shown = (element: Element) => {
		const box = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return box.width > 1 && box.height > 1 && style.visibility !== 'hidden';
	};
	const exempt = (element: Element) =>
		!!element.closest('svg, button:disabled, input:disabled, [aria-disabled="true"]');
	const findings: Finding[] = [];
	let texts = 0;
	const check = (host: string, element: Element, text: string, color: string) => {
		const style = getComputedStyle(element);
		const size = parseFloat(style.fontSize);
		if (size < 1) return;
		const bg = behind(element);
		const fg = parse(color);
		if (!fg) return;
		const ink = over([fg[0], fg[1], fg[2], fg[3] * opacity(element)], bg);
		const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
		const value = ratio(ink, bg);
		texts += 1;
		if (value < (large ? 3 : 4.5)) {
			findings.push({
				host,
				what: `text "${text.slice(0, 40)}"`,
				detail: `${value.toFixed(2)}:1 (${color} on rgb(${bg.slice(0, 3).map(Math.round).join(', ')}))`
			});
		}
	};
	const walk = (host: string, root: ShadowRoot, box: DOMRect, fixed: boolean) => {
		for (const element of root.querySelectorAll('*')) {
			if (element.shadowRoot) walk(host, element.shadowRoot, box, fixed);
			if (!shown(element) || exempt(element)) continue;
			for (const node of element.childNodes) {
				const text = node.nodeType === 3 ? node.textContent!.trim() : '';
				if (text) check(host, element, text, getComputedStyle(element).color);
			}
			if (element instanceof HTMLInputElement && element.placeholder && !element.value) {
				check(host, element, element.placeholder, getComputedStyle(element, '::placeholder').color);
			}
			// Sideways: inside the element's box, unless something clips it.
			const rect = element.getBoundingClientRect();
			const limit = fixed ? { left: 0, right: innerWidth } : box;
			if (rect.left < limit.left - 1 || rect.right > limit.right + 1) {
				let clipped = false;
				for (let at = parentOf(element); at && !clipped; at = parentOf(at)) {
					if (getComputedStyle(at).overflowX !== 'visible') clipped = true;
					if (at.shadowRoot === root) break;
				}
				if (!clipped) {
					findings.push({
						host,
						what: `<${element.localName} class="${element.getAttribute('class')}">`,
						detail: `spills out: ${Math.round(rect.left)}-${Math.round(rect.right)} in ${Math.round(limit.left)}-${Math.round(limit.right)}`
					});
				}
			}
		}
	};
	for (const selector of selectors) {
		for (const host of document.querySelectorAll(selector)) {
			if (!host.shadowRoot) continue;
			const fixed = host.localName === 'showfm-mini-player';
			walk(selector, host.shadowRoot, host.getBoundingClientRect(), fixed);
		}
	}
	if (document.documentElement.scrollWidth > innerWidth) {
		findings.push({ host: 'page', what: 'the page', detail: 'scrolls sideways' });
	}
	return { findings, texts };
}

/** The page's look: its font, and a dark page for the dark theme. */
const pageHead = (font: HostFont, theme: Theme, extra = '') =>
	hostFontHead(font) +
	(theme === 'dark' ? `<style>body{background:${DARK_PAGE};color:#ecebf0}</style>` : '') +
	extra;

const player = (theme: Theme, attributes = '') =>
	`<showfm-player episode="${EPISODE.id}" theme="${theme}" api="${API_ORIGIN}" ${attributes}></showfm-player>`;
const list = (theme: Theme, attributes = '') =>
	`<showfm-episodes podcast="${PODCAST}" theme="${theme}" count="3" api="${API_ORIGIN}" ${attributes}></showfm-episodes>`;
const play = (theme: Theme, attributes = '') =>
	`<showfm-play episode="${EPISODE.id}" theme="${theme}" api="${API_ORIGIN}" ${attributes}></showfm-play>`;

/** Every element of the episodes page, ready. */
async function elementsReady(page: Page) {
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	await listReady(page, '#card');
	await listReady(page, '#minimal');
	await page.waitForFunction(() =>
		[...document.querySelectorAll('showfm-play')].every((host) =>
			host.shadowRoot?.querySelector('[data-play]')
		)
	);
}

async function expectAudit(page: Page, selectors: string[]) {
	const { findings, texts } = await page.evaluate(audit, selectors);
	expect(findings).toEqual([]);
	// The audit really read the elements.
	expect(texts).toBeGreaterThan(1);
}

/** A full-page screenshot in test-results/, for review. */
async function attach(page: Page, testInfo: TestInfo, name: string) {
	await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

const heightOf = (page: Page, selector: string) =>
	page.locator(selector).evaluate((element) => element.getBoundingClientRect().height);

for (const width of [340, 720, 1100]) {
	for (const theme of ['light', 'dark'] as const) {
		for (const font of ['geist', 'merriweather', 'oswald'] as const) {
			test(`${width}px, ${theme}, ${font}: every element is AA, fits and keeps its height`, async ({
				page
			}, testInfo) => {
				await page.setViewportSize({ width: width + 32, height: 900 });
				await serveList(
					page,
					player(theme) +
						`<h2>Episodes</h2>${list(theme, 'id="card"')}` +
						`<h2>Minimal</h2>${list(theme, 'id="minimal" variant="minimal"')}` +
						`<p>Listen here: ${play(theme)} ${play(theme, 'variant="icon" size="lg"')}</p>`,
					{},
					{ width, head: pageHead(font, theme) }
				);
				await elementsReady(page);
				expect(await fontsLoaded(page, font)).toBe(true);
				// The player is first, so it carries "Powered by".
				expect(await heightOf(page, 'showfm-player')).toBe(291);
				expect(await heightOf(page, 'showfm-play:not([variant])')).toBe(40);
				await expectAudit(page, ['showfm-player', 'showfm-episodes', 'showfm-play']);

				// The mini-player, from the play button.
				await page.locator('showfm-play:not([variant]) [data-play]').click();
				const mini = page.locator('showfm-mini-player section');
				await expect(mini).toBeVisible();
				await expectAudit(page, ['showfm-mini-player']);
				await attach(page, testInfo, `${width}-${theme}-${font}`);
			});

			test(`${width}px, ${theme}, ${font}: the transcript is AA, fits and keeps its height`, async ({
				page
			}, testInfo) => {
				await page.setViewportSize({ width: width + 32, height: 900 });
				await serveTranscript(
					page,
					`<showfm-transcript episode="${TRANSCRIPT_EPISODE_ID}" theme="${theme}" api="${API_ORIGIN}" style="display:block"></showfm-transcript>` +
						`<showfm-player episode="${TRANSCRIPT_EPISODE_ID}" theme="${theme}" transcript="open" api="${API_ORIGIN}"></showfm-player>`,
					{ width, head: pageHead(font, theme) }
				);
				await transcriptReady(page);
				expect(await fontsLoaded(page, font)).toBe(true);
				expect(await heightOf(page, 'showfm-transcript')).toBe(377);
				await expectAudit(page, ['showfm-transcript', 'showfm-player']);
				await attach(page, testInfo, `transcript-${width}-${theme}-${font}`);
			});
		}
	}
}

/** A computed style of the first element matching `selector` (shadow DOM included). */
const styleOf = (page: Page, selector: string, property: string) =>
	page
		.locator(selector)
		.first()
		.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

const EDITORIAL = `<style>:root{
	--showfm-surface:#fbf7ef;
	--showfm-accent:#0e7c66;
	--showfm-text:#8a8a8a;
	--showfm-muted:#b5b5b5;
	--showfm-border:#e8e0d2;
	--showfm-radius:6px;
}</style>`;

test('colour hooks on :root reach every element, and every text stays AA', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 752, height: 900 });
	await serveList(
		page,
		player('light') +
			list('light', 'id="card"') +
			list('light', 'id="minimal" variant="minimal"') +
			`<p>${play('light')}</p>`,
		{},
		{ head: pageHead('merriweather', 'light', EDITORIAL) }
	);
	await elementsReady(page);
	const cream = 'rgb(251, 247, 239)';
	expect(await styleOf(page, 'showfm-player [part="container"]', 'background-color')).toBe(cream);
	expect(await styleOf(page, '#card .frame', 'background-color')).toBe(cream);
	expect(await styleOf(page, 'showfm-player [part="container"]', 'border-top-color')).toBe(
		'rgb(232, 224, 210)'
	);
	expect(await styleOf(page, 'showfm-player [part="container"]', 'border-radius')).toBe('6px');
	// The text hooks were too pale for the surface, so they were darkened.
	const title = await styleOf(page, 'showfm-player [part="title"]', 'color');
	expect(title).not.toBe('rgb(138, 138, 138)');
	await expectAudit(page, ['showfm-player', 'showfm-episodes', 'showfm-play']);
	await page.locator('showfm-play [data-play]').click();
	await expect(page.locator('showfm-mini-player section')).toBeVisible();
	expect(await styleOf(page, 'showfm-mini-player .bar', 'background-color')).toBe(cream);
	await expectAudit(page, ['showfm-mini-player']);
	await attach(page, testInfo, 'editorial');
});

test('a dark surface with a pale accent: dark text derivations stay AA', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 752, height: 900 });
	await serveList(
		page,
		player('light') + list('light', 'id="card"') + list('light', 'id="minimal" variant="minimal"'),
		{},
		{
			head: pageHead(
				'oswald',
				'dark',
				`<style>:root{--showfm-surface:#111113;--showfm-background:${DARK_PAGE};--showfm-accent:#b8f400}</style>`
			)
		}
	);
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	await listReady(page, '#card');
	await listReady(page, '#minimal');
	// theme="light", but the surface is dark, so the text is light.
	expect(await styleOf(page, 'showfm-player [part="container"]', 'background-color')).toBe(
		'rgb(17, 17, 19)'
	);
	await expectAudit(page, ['showfm-player', 'showfm-episodes']);
	await attach(page, testInfo, 'dark-surface');
});

test("a site's own dark mode (a class on <html>) restyles the elements", async ({ page }) => {
	// No transitions, so the audit reads the colours they settle on.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await serveList(
		page,
		player('auto') + list('auto', 'id="card"'),
		{},
		{
			head: `<style>:root{--showfm-surface:#ffffff}:root.dark{--showfm-surface:#1b1b1f}</style>`
		}
	);
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	await listReady(page, '#card');
	const bg = () => styleOf(page, 'showfm-player [part="container"]', 'background-color');
	expect(await bg()).toBe('rgb(255, 255, 255)');
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await expect.poll(bg).toBe('rgb(27, 27, 31)');
	await expect
		.poll(() => styleOf(page, '#card .frame', 'background-color'))
		.toBe('rgb(27, 27, 31)');
	await expectAudit(page, ['showfm-player', 'showfm-episodes']);
});

test('the mini-player takes the hooks set on the element that opened it', async ({ page }) => {
	await serveList(
		page,
		`<p>${play('light', 'style="--showfm-surface:#fff4e8;--showfm-accent:#0e7c66;--showfm-radius:24px"')}</p>`
	);
	await page.waitForFunction(
		() => !!document.querySelector('showfm-play')?.shadowRoot?.querySelector('[data-play]')
	);
	await page.locator('showfm-play [data-play]').click();
	await expect(page.locator('showfm-mini-player section')).toBeVisible();
	expect(await styleOf(page, 'showfm-mini-player .bar', 'background-color')).toBe(
		'rgb(255, 244, 232)'
	);
	await expectAudit(page, ['showfm-mini-player', 'showfm-play']);
});

test('radius is held to 0-28px; space and font scale are clamped', async ({ page }) => {
	await serveList(
		page,
		player('light', 'style="--showfm-radius:40px"') +
			list('light', 'id="card" style="--showfm-radius:0px;--showfm-font-scale:1.2"') +
			list('light', 'id="minimal" style="--showfm-font-scale:9;--showfm-space:0.1"'),
		{},
		{ head: '<style>html{font-size:16px}</style>' }
	);
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	await listReady(page, '#card');
	await listReady(page, '#minimal');
	expect(await styleOf(page, 'showfm-player [part="container"]', 'border-radius')).toBe('28px');
	// The artwork follows at 70%.
	expect(await styleOf(page, 'showfm-player [part="artwork"]', 'border-radius')).toBe('19.6px');
	expect(await styleOf(page, '#card .frame', 'border-radius')).toBe('0px');
	// A 1rem title, scaled 1.2; and 9 is held to 1.3.
	expect(await styleOf(page, '#card [part="title"]', 'font-size')).toBe('19.2px');
	expect(await styleOf(page, '#minimal [part="title"]', 'font-size')).toBe('20.8px');
	// Unset, the player keeps the design's corners.
	await serveList(page, player('light'));
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	expect(await styleOf(page, 'showfm-player [part="container"]', 'border-radius')).toBe('14px');
	expect(await styleOf(page, 'showfm-player [part="artwork"]', 'border-radius')).toBe('12px');
});

test('the transcript scales its lines, not its search row', async ({ page }) => {
	await serveTranscript(
		page,
		`<showfm-transcript episode="${TRANSCRIPT_EPISODE_ID}" api="${API_ORIGIN}" style="display:block;--showfm-font-scale:1.2"></showfm-transcript>`
	);
	await transcriptReady(page);
	expect(await styleOf(page, 'showfm-transcript .txt', 'font-size')).toBe('18px');
	expect(await heightOf(page, 'showfm-transcript')).toBe(377);
});

test('colours can be written as rgb(), hsl() or a name; a translucent one is ignored', async ({
	page
}) => {
	const accent = (value: string) =>
		player('light', `style="--showfm-accent:${value};--showfm-wave:rgba(0,0,0,.5)"`);
	await serveList(
		page,
		accent('rgb(14 124 102)') + accent('hsl(168 80% 27%)') + accent('teal'),
		{},
		{ width: 640 }
	);
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(3);
	const accents = await page
		.locator('showfm-player [part="play"]')
		.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor));
	expect(accents[0]).toBe('rgb(14, 124, 102)');
	expect(accents[1]).toBe('rgb(14, 124, 102)');
	expect(accents[2]).toBe('rgb(0, 128, 128)');
	// The translucent wave colour was not taken: the track is the design's.
	const track = await page
		.locator('showfm-player [part="container"]')
		.first()
		.evaluate((card) => (card as HTMLElement).style.getPropertyValue('--pp-wave-track'));
	expect(track).toBe('#DBD8E3');
});

test('the focus ring is the --showfm-focus colour, at least 3:1 on the card', async ({ page }) => {
	await serveList(page, player('light', 'style="--showfm-focus:#f0e0ff"'));
	await expect(page.locator('showfm-player [part="container"]')).toHaveCount(1);
	await page.keyboard.press('Tab');
	const ring = await page.evaluate(() => {
		let active: Element | null = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		const style = getComputedStyle(active!);
		return { style: style.outlineStyle, color: style.outlineColor };
	});
	expect(ring.style).toBe('solid');
	// #f0e0ff is too pale on white, so the ring is darkened to 3:1.
	expect(ring.color).not.toBe('rgb(240, 224, 255)');
	const ratio = await page.evaluate((color) => {
		const [r, g, b] = color.match(/\d+/g)!.map(Number);
		const linear = (c: number) =>
			c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4);
		const l = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
		return 1.05 / (l + 0.05);
	}, ring.color);
	expect(ratio).toBeGreaterThanOrEqual(3);
});
