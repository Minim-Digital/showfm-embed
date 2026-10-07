/**
 * Every state of every element, in its resolved palette, in Chromium
 * against the built v1.js and its chunks.
 *
 * Each state (ready, loading, the facade, can't be played, blocked,
 * suspended, empty, end of list, searching, following, collapsed, the phone
 * sheet, mid-listen messages) is drawn in four looks: light, dark, a light
 * host surface and a dark host surface with pale hooks. For every piece of
 * visible text the audit checks, on the computed styles:
 *
 * - its colour is one of the element's palette text colours (--pp-fg-strong,
 *   --pp-fg, --pp-muted, --pp-accent-text, --pp-accent-fg, --pp-logo);
 * - every background behind it, up to the page, is one of the palette's
 *   surfaces (--pp-bg, --pp-tint, --pp-ctrl-bg, --pp-ctrl-hover,
 *   --pp-accent) or the page's own;
 * - the pair reaches WCAG AA (4.5:1, 3:1 when large).
 *
 * So a colour written into a component anywhere fails, even one that would
 * pass on a white page. The one fixed pair is the transcript's search
 * match: ink on amber, 13:1 whatever the theme (design page 3).
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { API_ORIGIN, serveList } from './episodes-harness';
import { serveTranscript } from './transcript-harness';
import { episodeItem, sampleEpisodes } from '../fixtures/episodes';
import { TRANSCRIPT_VTT, transcriptEpisode } from '../fixtures/transcript';

const EPISODES = sampleEpisodes();
const EPISODE = EPISODES[0];
const PODCAST = '99999999-8888-4777-8666-555555555555';

interface Look {
	theme: 'light' | 'dark';
	head: string;
}

const LOOKS: Record<string, Look> = {
	light: { theme: 'light', head: '' },
	dark: { theme: 'dark', head: '<style>body{background:#0e0d13;color:#ecebf0}</style>' },
	// Pale text hooks on a light surface: they must be darkened.
	cream: {
		theme: 'light',
		head: '<style>body{background:#fbf7ef}:root{--showfm-surface:#fbf7ef;--showfm-background:#fbf7ef;--showfm-accent:#0e7c66;--showfm-text:#8a8a8a;--showfm-muted:#b5b5b5}</style>'
	},
	// A dark surface under theme="light": a fixed light-theme colour fails here.
	night: {
		theme: 'light',
		head: '<style>body{background:#0b0b0c;color:#f2f2f2}:root{--showfm-surface:#111113;--showfm-background:#0b0b0c;--showfm-accent:#b8f400;--showfm-muted:#555555}</style>'
	}
};

interface Finding {
	where: string;
	text: string;
	problem: string;
}

/**
 * Runs in the page: every text node in the shadow trees of `selectors`
 * (and the shadow trees inside them) against the element's palette.
 */
function audit(selectors: string[]): { findings: Finding[]; texts: number; graphics: number } {
	type Rgba = [number, number, number, number];
	const TEXT = [
		'--pp-fg-strong',
		'--pp-fg',
		'--pp-muted',
		'--pp-accent-text',
		'--pp-accent-fg',
		'--pp-logo'
	];
	const SURFACE = ['--pp-bg', '--pp-tint', '--pp-ctrl-bg', '--pp-ctrl-hover', '--pp-accent'];
	const AMBER = 'rgb(253, 230, 138)';
	const INK = 'rgb(16, 16, 20)';
	const probe = document.createElement('i');
	document.body.append(probe);
	const asColor = (value: string) => {
		probe.style.color = '';
		probe.style.color = value;
		return getComputedStyle(probe).color;
	};
	const tokens = (element: Element, names: string[]) => {
		const style = getComputedStyle(element);
		return names
			.map((name) => style.getPropertyValue(name).trim())
			.filter(Boolean)
			.map(asColor);
	};
	const parse = (value: string): Rgba | null => {
		const match = /rgba?\(([^)]+)\)/.exec(value);
		if (!match) return null;
		const parts = match[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.map(Number);
		return [parts[0], parts[1], parts[2], parts[3] ?? 1];
	};
	const over = (top: Rgba, bottom: Rgba): Rgba => {
		const a = top[3];
		return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
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
	const inShadow = (element: Element) => element.getRootNode() instanceof ShadowRoot;
	const findings: Finding[] = [];
	let texts = 0;
	let graphics = 0;

	/** The colour behind an element: every background up to the first opaque one. */
	const backdrop = (from: Element | null): Rgba => {
		const layers: Rgba[] = [];
		for (let at = from; at; at = parentOf(at)) {
			const layer = parse(getComputedStyle(at).backgroundColor);
			if (!layer || layer[3] === 0) continue;
			layers.push(layer);
			if (layer[3] === 1) break;
		}
		return layers.reverse().reduce<Rgba>((under, layer) => over(layer, under), [255, 255, 255, 1]);
	};
	/**
	 * Non-text, 3:1 (WCAG 1.4.11) on what is really behind it, the tint of a
	 * playing row or a spoken line included: the played waveform on its
	 * canvas's backdrop, and an accent fill (a play button) on its parent's.
	 */
	const graphic = (where: string, element: Element) => {
		const style = getComputedStyle(element);
		const [wave, fill] = tokens(element, ['--pp-wave', '--pp-accent']);
		const report = (what: string, color: string, on: Rgba) => {
			const value = ratio(parse(color)!, on);
			if (value < 3) {
				findings.push({
					where,
					text: what,
					problem: `${value.toFixed(2)}:1 on rgb(${on.slice(0, 3).map(Math.round).join(', ')})`
				});
			}
		};
		if (element instanceof HTMLCanvasElement && wave) {
			graphics += 1;
			report('the played waveform', wave, backdrop(element));
		}
		if (fill && style.backgroundColor === fill && style.borderRadius !== '0px') {
			graphics += 1;
			report(
				`the fill of <${element.localName} class="${element.getAttribute('class')}">`,
				fill,
				backdrop(parentOf(element))
			);
		}
	};
	const check = (where: string, element: Element, text: string, color: string) => {
		const style = getComputedStyle(element);
		const size = parseFloat(style.fontSize);
		if (size < 1) return;
		texts += 1;
		const report = (problem: string) => findings.push({ where, text: text.slice(0, 40), problem });
		const amber = style.backgroundColor === AMBER;
		if (amber ? color !== INK : !tokens(element, TEXT).includes(color)) {
			report(`colour ${color} is not from the palette`);
		}
		// Every background up to the first opaque one, from the palette or the page.
		const layers: Rgba[] = [];
		for (let at: Element | null = element; at; at = parentOf(at)) {
			const background = getComputedStyle(at).backgroundColor;
			const layer = parse(background);
			if (!layer || layer[3] === 0) continue;
			const allowed =
				!inShadow(at) || background === AMBER || tokens(at, SURFACE).includes(background);
			if (!allowed) report(`background ${background} on <${at.localName}> is not from the palette`);
			layers.push(layer);
			if (layer[3] === 1) break;
		}
		const bg = layers
			.reverse()
			.reduce<Rgba>((under, layer) => over(layer, under), [255, 255, 255, 1]);
		const fg = parse(color)!;
		let opacity = 1;
		for (let at: Element | null = element; at; at = parentOf(at)) {
			opacity *= Number(getComputedStyle(at).opacity);
		}
		const value = ratio(over([fg[0], fg[1], fg[2], fg[3] * opacity], bg), bg);
		const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
		if (value < (large ? 3 : 4.5))
			report(`${value.toFixed(2)}:1 on rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`);
	};
	const walk = (where: string, root: ShadowRoot) => {
		for (const element of root.querySelectorAll('*')) {
			if (element.shadowRoot) walk(where, element.shadowRoot);
			const box = element.getBoundingClientRect();
			if (box.width <= 1 || box.height <= 1 || getComputedStyle(element).visibility === 'hidden')
				continue;
			if (element.closest('svg, button:disabled, input:disabled, [aria-disabled="true"]')) continue;
			graphic(where, element);
			for (const node of element.childNodes) {
				const text = node.nodeType === 3 ? node.textContent!.trim() : '';
				if (text) check(where, element, text, getComputedStyle(element).color);
			}
			if (element instanceof HTMLInputElement && element.placeholder && !element.value) {
				check(
					where,
					element,
					element.placeholder,
					getComputedStyle(element, '::placeholder').color
				);
			}
		}
	};
	for (const selector of selectors) {
		for (const host of document.querySelectorAll(selector)) {
			if (host.shadowRoot) walk(selector, host.shadowRoot);
		}
	}
	probe.remove();
	return { findings, texts, graphics };
}

async function expectPalette(page: Page, selectors: string[], minTexts = 1, minGraphics = 0) {
	const { findings, texts, graphics } = await page.evaluate(audit, selectors);
	expect(findings).toEqual([]);
	expect(texts).toBeGreaterThanOrEqual(minTexts);
	expect(graphics).toBeGreaterThanOrEqual(minGraphics);
}

const json = (route: Route, status: number, body: unknown) =>
	route.fulfill({
		status,
		contentType: 'application/json',
		headers: { 'access-control-allow-origin': '*' },
		body: JSON.stringify(body)
	});

/** A gate that holds v1.js, so routes can be overridden before anything is asked. */
function gate() {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => (open = resolve));
	return { promise, open };
}

/** The audio fails from now on (routes added later win over the harness's). */
const failAudio = (page: Page) =>
	page.route('https://m.cdn.media/**', (route) => route.fulfill({ status: 404, body: '' }));

/** From now on the API says the show is suspended when asked about an episode. */
const suspend = (page: Page) =>
	page.route(`${API_ORIGIN}/v1/episodes/*`, (route) =>
		json(route, 403, { error: { code: 'unavailable' } })
	);

/** The browser refuses play(). */
const blockPlay = (page: Page) =>
	page.addInitScript(() => {
		HTMLMediaElement.prototype.play = () =>
			Promise.reject(new DOMException('blocked', 'NotAllowedError'));
	});

/** The audio the page's controller plays, captured as it is asked to play. */
const capturePlays = (page: Page) =>
	page.addInitScript(() => {
		const played: HTMLMediaElement[] = ((
			window as unknown as { played: HTMLMediaElement[] }
		).played = []);
		const original = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function () {
			if (!played.includes(this)) played.push(this);
			return original.call(this);
		};
	});

const rowsReady = (page: Page) =>
	page.waitForFunction(() =>
		[...document.querySelectorAll('showfm-episodes')].every((host) =>
			host.shadowRoot?.querySelector('[data-row]')
		)
	);
const buttonsReady = (page: Page) =>
	page.waitForFunction(() =>
		[...document.querySelectorAll('showfm-play')].every((host) =>
			host.shadowRoot?.querySelector('[data-play], .msg, .quiet')
		)
	);

for (const [name, look] of Object.entries(LOOKS)) {
	test.describe(`${name}`, () => {
		test.beforeEach(async ({ page }) => {
			// The audit reads settled colours: nothing transitions.
			await page.emulateMedia({ reducedMotion: 'reduce' });
		});
		const { theme, head } = look;
		const player = (attributes = '', inner = '') =>
			`<showfm-player episode="${EPISODE.id}" theme="${theme}" api="${API_ORIGIN}" ${attributes}>${inner}</showfm-player>`;
		const list = (attributes = '') =>
			`<showfm-episodes podcast="${PODCAST}" theme="${theme}" count="3" api="${API_ORIGIN}" ${attributes}></showfm-episodes>`;
		const play = (attributes = '') =>
			`<showfm-play episode="${EPISODE.id}" theme="${theme}" api="${API_ORIGIN}" ${attributes}></showfm-play>`;
		const link = `<a href="${EPISODE.links.listen}">Listen on show.fm</a>`;

		test('the player: ready, facade, loading, error, suspended, no audio, blocked', async ({
			page
		}) => {
			await serveList(page, player() + player('size="compact"'), {}, { head });
			await expect(page.locator('showfm-player [part="container"]')).toHaveCount(2);
			await expectPalette(page, ['showfm-player'], 6);

			await serveList(
				page,
				player('load="click"') + player('load="click" size="compact"'),
				{},
				{ head }
			);
			await expect(page.getByRole('button', { name: 'Play podcast episode' })).toHaveCount(2);
			await expectPalette(page, ['showfm-player'], 2);

			await serveList(page, player(), { status: 'pending' }, { head });
			await expect(page.locator('showfm-player [role="status"]')).toHaveCount(1);
			await expectPalette(page, ['showfm-player'], 0);

			await serveList(
				page,
				player('', link) + player('size="compact"', link),
				{ status: 'fail' },
				{ head }
			);
			await expect(page.getByText('This episode can’t be played right now.')).toHaveCount(2);
			await expectPalette(page, ['showfm-player'], 2);

			await serveList(page, player() + player('size="compact"'), { status: 'suspended' }, { head });
			await expect(page.getByText('This show isn’t available right now.')).toHaveCount(2);
			await expectPalette(page, ['showfm-player'], 2);

			await serveList(
				page,
				player(),
				{ episodes: [episodeItem({ index: 1, audio: null })] },
				{ head }
			);
			await expect(page.locator('showfm-player [part="error"]')).toHaveCount(1);
			await expectPalette(page, ['showfm-player'], 2);

			await blockPlay(page);
			await serveList(page, player(), {}, { head });
			await page.locator('showfm-player [part="play"]').click();
			await expect(page.getByText('Your browser blocked audio playback.')).toBeVisible();
			await expectPalette(page, ['showfm-player'], 3);
		});

		test('the list: every layout, playing, loading, empty, error, suspended, end of list', async ({
			page
		}) => {
			await page.setViewportSize({ width: 1132, height: 900 });
			await serveList(
				page,
				list('id="a" layout="list"') +
					list('id="b" variant="minimal" layout="list"') +
					list('id="c" layout="grid"') +
					list('id="d" variant="minimal" layout="grid"') +
					list('id="e" layout="compact"') +
					list('id="f" variant="minimal" layout="compact"') +
					// An accent just over 3:1 on the card, whose tint is darker.
					list('id="g" layout="list" accent="#0ea5e9"'),
				{},
				{ width: 1100, head }
			);
			await rowsReady(page);
			// A playing row in each list, in turn: the tint, the waveform on it,
			// the fill of its button.
			for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
				const button = page.locator(`#${id} [part="play"]`).first();
				await button.click();
				await expect(button).toHaveAccessibleName(/^Pause/);
				// Card's list row draws the waveform on its tint.
				if (id === 'a' || id === 'g') await expect(page.locator(`#${id} canvas`)).toHaveCount(1);
				await expectPalette(page, ['showfm-episodes'], 30, id === 'a' || id === 'g' ? 2 : 1);
				// Every list shows the same episodes: pause before the next.
				await button.click();
				await expect(button).toHaveAccessibleName(/^(Play|Resume)/);
			}
			await expectPalette(page, ['showfm-episodes'], 30, 1);

			await serveList(page, list(), { status: 'pending' }, { head });
			await expect(page.locator('showfm-episodes [role="status"]').first()).toBeAttached();
			await expectPalette(page, ['showfm-episodes'], 0);

			for (const [status, text] of [
				['fail', 'Episodes can’t be loaded right now.'],
				['suspended', 'This show isn’t available right now.']
			] as const) {
				await serveList(page, list() + list('variant="minimal"'), { status }, { head });
				await expect(page.getByText(text)).toHaveCount(2);
				await expectPalette(page, ['showfm-episodes'], 2);
			}

			await serveList(page, list() + list('variant="minimal"'), { episodes: [] }, { head });
			await expect(page.getByText('No episodes yet')).toHaveCount(2);
			await expectPalette(page, ['showfm-episodes'], 2);

			await serveList(
				page,
				list('count="2"') + list('count="2" variant="minimal"'),
				{ episodes: EPISODES.slice(0, 3), pageSize: 2 },
				{ head }
			);
			await rowsReady(page);
			const more = page.getByRole('button', { name: 'Load more episodes' });
			while ((await more.count()) > 0) await more.first().click();
			await expect(page.getByRole('button', { name: 'Load more episodes' })).toHaveCount(0);
			await expectPalette(page, ['showfm-episodes'], 10);
		});

		test('a list row: can’t be played, blocked, suspended', async ({ page }) => {
			for (const status of [200, 403] as const) {
				await serveList(page, list() + list('variant="minimal"'), {}, { head });
				await rowsReady(page);
				await failAudio(page);
				if (status === 403) await suspend(page);
				const message =
					status === 403
						? 'This show isn’t available right now.'
						: 'This episode can’t be played right now.';
				// One list at a time, each its own episode: a press of the same
				// episode elsewhere rightly makes a pending failure stale.
				for (const n of [0, 1]) {
					const host = page.locator('showfm-episodes').nth(n);
					await host.locator('[part="play"]').nth(n).click();
					await expect(host.getByText(message)).toHaveCount(1);
				}
				await expectPalette(page, ['showfm-episodes'], 10);
			}

			await blockPlay(page);
			await serveList(page, list() + list('variant="minimal"'), {}, { head });
			await rowsReady(page);
			for (const n of [0, 1]) {
				const host = page.locator('showfm-episodes').nth(n);
				await host.locator('[part="play"]').nth(n).click();
				await expect(host.getByText('Your browser blocked audio playback.')).toHaveCount(1);
			}
			await expectPalette(page, ['showfm-episodes'], 10);
		});

		test('the play button: every variant, playing, can’t be played, blocked, suspended', async ({
			page
		}) => {
			const all =
				`<p>${play()} ${play('size="lg"')}</p><p>${play('variant="icon"')} ${play('variant="icon" size="lg"')}</p>` +
				`<p>Listen: ${play('variant="link" mini-player="off"')}.</p>`;
			await serveList(page, all, {}, { head });
			await buttonsReady(page);
			await page.locator('showfm-play[variant="link"] [data-play]').click();
			await expect(page.locator('showfm-play[variant="link"] [data-play]')).toHaveAccessibleName(
				/^Pause/
			);
			await expectPalette(page, ['showfm-play'], 3);

			for (const status of [200, 403] as const) {
				await serveList(page, all, {}, { head });
				await buttonsReady(page);
				await failAudio(page);
				if (status === 403) await suspend(page);
				// Each button in turn: a failed one gives its place to the message.
				for (let i = 0; i < 5; i++) {
					await page.locator('showfm-play').nth(i).locator('[data-play]').click();
					await expect(page.locator('showfm-play').nth(i).locator('.msg, .quiet')).toHaveCount(1);
				}
				await expect(
					page.getByText(
						status === 403
							? 'This show isn’t available right now.'
							: 'This episode can’t be played right now.'
					)
				).not.toHaveCount(0);
				await expectPalette(page, ['showfm-play'], 2);
			}

			await serveList(page, all, { status: 'suspended' }, { head });
			await buttonsReady(page);
			await expect(page.getByText('This show isn’t available right now.')).not.toHaveCount(0);
			await expectPalette(page, ['showfm-play'], 1);

			await blockPlay(page);
			await serveList(page, all, {}, { head });
			await buttonsReady(page);
			await page.locator('showfm-play:not([variant]) [data-play]').first().click();
			await expect(page.locator('showfm-play .note')).toHaveText(
				'Your browser blocked audio playback.'
			);
			await expectPalette(page, ['showfm-play'], 2);
		});

		test('the mini-player: bar, pill, phone bar and sheet, messages mid-listen', async ({
			page
		}) => {
			await capturePlays(page);
			await page.setViewportSize({ width: 1100, height: 700 });
			await serveList(page, `<p>${play()}</p>`, {}, { head, width: 1000 });
			await buttonsReady(page);
			await page.locator('showfm-play [data-play]').click();
			const mini = page.locator('showfm-mini-player section');
			await expect(mini).toBeVisible();
			await expectPalette(page, ['showfm-mini-player'], 3);
			await mini.getByRole('button', { name: 'Collapse player' }).click();
			await expectPalette(page, ['showfm-mini-player'], 1);
			await mini.getByRole('button', { name: 'Expand player' }).click();

			// Mid-listen: the audio fails, and the API says why.
			for (const status of [200, 403] as const) {
				await serveList(page, `<p>${play()}</p>`, {}, { head, width: 1000 });
				await buttonsReady(page);
				await page.locator('showfm-play [data-play]').click();
				await expect(mini).toBeVisible();
				await failAudio(page);
				if (status === 403) await suspend(page);
				await page.evaluate(() =>
					(window as unknown as { played: HTMLMediaElement[] }).played.at(-1)!.load()
				);
				await expect(mini.locator('.message')).toHaveText(
					status === 403
						? 'This show isn’t available right now.'
						: 'This episode can’t be played right now.'
				);
				await expectPalette(page, ['showfm-mini-player'], 2);
				await page.unroute('https://m.cdn.media/**');
				await page.unroute(`${API_ORIGIN}/v1/episodes/*`);
			}

			await page.setViewportSize({ width: 390, height: 800 });
			await serveList(page, `<p>${play()}</p>`, {}, { head, width: 358 });
			await buttonsReady(page);
			await page.locator('showfm-play [data-play]').click();
			await expect(mini).toBeVisible();
			await expectPalette(page, ['showfm-mini-player'], 1);
			await mini.getByRole('button', { name: 'Expand player' }).click();
			await expect(page.locator('showfm-mini-player [role="dialog"]')).toBeVisible();
			await expectPalette(page, ['showfm-mini-player'], 3);
		});

		test('the transcript: ready, searching, loading, error, suspended, waiting, none, in the player', async ({
			page
		}) => {
			const transcript = (attributes = `episode="${transcriptEpisode().id}"`) =>
				`<showfm-transcript ${attributes} theme="${theme}" api="${API_ORIGIN}" style="display:block"></showfm-transcript>`;
			const ready = () =>
				page.waitForFunction(
					() => !!document.querySelector('showfm-transcript')?.shadowRoot?.querySelector('.line')
				);

			await serveTranscript(page, transcript(), { head });
			await ready();
			await expectPalette(page, ['showfm-transcript'], 10);
			const search = page.getByRole('searchbox', { name: 'Search transcript' });
			await search.fill('bread');
			await expect(page.locator('showfm-transcript').getByText(/\d+ of \d+/)).toBeVisible();
			await expectPalette(page, ['showfm-transcript'], 10);
			await search.fill('zzzzqx');
			await expect(page.locator('showfm-transcript').getByText('No matches')).toBeVisible();
			await expectPalette(page, ['showfm-transcript'], 2);

			// The VTT never answers, then fails.
			for (const vtt of ['pending', 'fail'] as const) {
				const held = gate();
				await serveTranscript(page, transcript(), { head, gate: held.promise });
				await page.route(TRANSCRIPT_VTT, (route) =>
					vtt === 'pending' ? undefined : route.fulfill({ status: 500, body: '' })
				);
				held.open();
				if (vtt === 'fail') {
					await expect(
						page.getByText('The transcript can’t be loaded right now.', { exact: false })
					).toBeVisible();
				} else {
					await expect(page.locator('showfm-transcript .skel')).toBeAttached();
				}
				await expectPalette(page, ['showfm-transcript'], 1);
			}

			const suspended = gate();
			await serveTranscript(page, transcript(), { head, gate: suspended.promise });
			await page.route(`${API_ORIGIN}/**`, (route) =>
				json(route, 403, { error: { code: 'unavailable' } })
			);
			suspended.open();
			await expect(page.getByText('This show isn’t available right now.')).toBeVisible();
			await expectPalette(page, ['showfm-transcript'], 2);

			await serveTranscript(page, transcript(''), { head });
			await expect(page.getByText('Play an episode to follow its transcript here.')).toBeVisible();
			await expectPalette(page, ['showfm-transcript'], 2);

			// Following a player whose episode has no transcript.
			const none = gate();
			await serveTranscript(
				page,
				`<showfm-player id="p" episode="${transcriptEpisode().id}" theme="${theme}" api="${API_ORIGIN}"></showfm-player>` +
					transcript('for="p"'),
				{ head, gate: none.promise }
			);
			await page.route(`${API_ORIGIN}/**`, (route) =>
				json(route, 200, { data: transcriptEpisode({ vtt: null }) })
			);
			none.open();
			await page.locator('showfm-player [part="play"]').click();
			await expect(page.getByText('There’s no transcript for this episode.')).toBeVisible();
			await expectPalette(page, ['showfm-transcript', 'showfm-player'], 3);

			await serveTranscript(
				page,
				`<showfm-player episode="${transcriptEpisode().id}" theme="${theme}" transcript="open" api="${API_ORIGIN}"></showfm-player>`,
				{ head }
			);
			await page.waitForFunction(
				() =>
					!!document
						.querySelector('showfm-player')
						?.shadowRoot?.querySelector('.tr')
						?.shadowRoot?.querySelector('.line')
			);
			await expectPalette(page, ['showfm-player'], 10);
		});
	});
}
