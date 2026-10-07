/**
 * The colour hooks: reading them (hooks.ts) and the palette an element makes
 * of them (look.svelte.ts, through PlayerCore). jsdom has no canvas and does
 * not inherit custom properties, so the canvas is a small stand-in and the
 * computed styles are stubbed; the real ones are checked in Chromium
 * (tests/browser/hooks.spec.ts).
 */
import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cssColour, readHooks } from '../hooks';
import { paletteVars, resolvePalette } from '../palette';
import { STYLE_HOOKS } from '../style-hooks';
import PlayerCore from '../PlayerCore.svelte';
import { episodePayload } from '../../../tests/fixtures/episode';

/** Like a 2D context: keeps a colour it can read, as hex when opaque. */
const NAMES: Record<string, string> = { teal: '#008080', rebeccapurple: '#663399' };
function fakeContext() {
	let fill = '#000000';
	return {
		get fillStyle() {
			return fill;
		},
		set fillStyle(value: string) {
			const rgb = /^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)$/.exec(value);
			if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(value)) {
				fill = value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value;
			} else if (NAMES[value]) {
				fill = NAMES[value];
			} else if (rgb) {
				const [r, g, b] = rgb.slice(1, 4).map(Number);
				fill =
					rgb[4] && Number(rgb[4]) < 1
						? `rgba(${r}, ${g}, ${b}, ${rgb[4]})`
						: `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
			}
		}
	};
}

beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() => fakeContext() as unknown as CanvasRenderingContext2D
	);
});

describe('cssColour', () => {
	it('takes hex as written', () => {
		expect(cssColour(' #0E7C66 ')).toBe('#0E7C66');
		expect(cssColour('#fff')).toBe('#fff');
	});

	it('reads other colours through the canvas, as hex', () => {
		expect(cssColour('rgb(14 124 102)')).toBe('#0e7c66');
		expect(cssColour('teal')).toBe('#008080');
	});

	it('ignores nothing, junk, hex without # and translucent colours', () => {
		expect(cssColour('')).toBeUndefined();
		expect(cssColour('   ')).toBeUndefined();
		expect(cssColour('not-a-colour')).toBeUndefined();
		expect(cssColour('0e7c66')).toBeUndefined();
		expect(cssColour('rgba(14, 124, 102, 0.5)')).toBeUndefined();
	});

	it('tells black from a value the canvas refuses', () => {
		expect(cssColour('rgb(0 0 0)')).toBe('#000000');
		expect(cssColour('#000000')).toBe('#000000');
	});
});

describe('readHooks', () => {
	it('reads each colour hook from the computed style, and leaves out the rest', () => {
		const element = document.createElement('div');
		element.style.setProperty('--showfm-surface', '#FBF7EF');
		element.style.setProperty('--showfm-accent', 'teal');
		element.style.setProperty('--showfm-text', 'nonsense');
		element.style.setProperty('--showfm-radius', '6px');
		document.body.append(element);
		expect(readHooks(element)).toEqual({ surface: '#FBF7EF', accent: '#008080' });
		element.remove();
	});
});

describe('STYLE_HOOKS', () => {
	it('names every hook once, as a custom property', () => {
		expect(new Set(STYLE_HOOKS).size).toBe(STYLE_HOOKS.length);
		for (const name of STYLE_HOOKS) expect(name).toMatch(/^--showfm-[a-z-]+$/);
		expect(STYLE_HOOKS).toContain('--showfm-accent');
		expect(STYLE_HOOKS).toContain('--showfm-font');
		expect(STYLE_HOOKS).toContain('--showfm-bottom-offset');
	});
});

describe('an element follows the hooks (createLook, through the player)', () => {
	let hooks: Record<string, string> = {};
	const real = window.getComputedStyle;
	function stubHooks(values: Record<string, string>) {
		hooks = values;
		vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
			const style = real(element, pseudo);
			return new Proxy(style, {
				get(target, key) {
					if (key === 'getPropertyValue') {
						return (name: string) => hooks[name] ?? target.getPropertyValue(name);
					}
					const value = Reflect.get(target, key);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		});
	}
	afterEach(() => {
		vi.mocked(window.getComputedStyle).mockRestore?.();
		document.documentElement.className = '';
	});

	const style = (container: HTMLElement) =>
		container.querySelector<HTMLElement>('.player')!.getAttribute('style') ?? '';

	it('without hooks, keeps the design palette', async () => {
		stubHooks({});
		const { container } = render(PlayerCore, {
			props: { episode: episodePayload({}), theme: 'light' }
		});
		const player = container.querySelector<HTMLElement>('.player')!;
		const expected = paletteVars(resolvePalette('#7E22CE', 'light'))
			.split(';')
			.map((pair) => pair.split(/:(.*)/s).slice(0, 2))
			.filter(([, value]) => value.startsWith('#'));
		expect(expected.length).toBeGreaterThan(10);
		await waitFor(() => {
			for (const [name, value] of expected) {
				expect(player.style.getPropertyValue(name).trim().toLowerCase()).toBe(value.toLowerCase());
			}
		});
	});

	it('takes the surface and the accent, and a pinned accent wins over the hook', async () => {
		stubHooks({ '--showfm-surface': '#111113', '--showfm-accent': '#0E7C66' });
		const { container } = render(PlayerCore, {
			props: { episode: episodePayload({}), theme: 'light' }
		});
		const teal = resolvePalette('#0E7C66', 'light', { surface: '#111113' });
		await waitFor(() => expect(style(container)).toContain(`--pp-bg: ${teal.bg}`));
		expect(style(container)).toContain(`--pp-accent: ${teal.accent}`);

		const pinned = render(PlayerCore, {
			props: { episode: episodePayload({}), theme: 'light', accent: '#C2410C' }
		});
		const orange = resolvePalette('#C2410C', 'light', { surface: '#111113' });
		await waitFor(() => expect(style(pinned.container)).toContain(`--pp-accent: ${orange.accent}`));
	});

	it('reads them again when the site switches its own dark mode (a class on <html>)', async () => {
		stubHooks({ '--showfm-surface': '#ffffff' });
		const { container } = render(PlayerCore, {
			props: { episode: episodePayload({}), theme: 'light' }
		});
		await waitFor(() => expect(style(container)).toContain('--pp-bg: #ffffff'));
		hooks = { '--showfm-surface': '#1b1b1f' };
		document.documentElement.classList.add('dark');
		await waitFor(() => expect(style(container)).toContain('--pp-bg: #1b1b1f'));
		expect(style(container)).toContain('--pp-fg-strong: #f5f4f8');
	});
});
