/**
 * Reads the host's colour hooks (`--showfm-accent`, `--showfm-surface` and
 * the rest, palette.ts) from an element's computed style, so a hook set on
 * the page (`:root`), on an ancestor or on the element itself applies.
 *
 * Colours are derived in script, not CSS, because CSS cannot check
 * contrast. So each value is normalised to `#rrggbb` here: hex as written,
 * any other sRGB colour CSS understands (rgb(), hsl(), a name) through a 2D
 * canvas, which serialises an opaque colour as hex. A translucent colour or
 * one the browser does not read is ignored, and the element keeps its own.
 */
import { parseHex } from './contrast';
import { COLOUR_HOOKS, type ColourHooks } from './palette';

let canvas: CanvasRenderingContext2D | null | undefined;

export function cssColour(value: string): string | undefined {
	value = value.trim();
	if (!value) return;
	if (value[0] === '#' && parseHex(value)) return value;
	canvas ??= document.createElement('canvas').getContext('2d');
	if (!canvas) return;
	// Set over two different colours: a value the canvas refuses leaves each
	// as it was, so the two reads differ.
	canvas.fillStyle = '#000';
	canvas.fillStyle = value;
	const first = canvas.fillStyle;
	canvas.fillStyle = '#fff';
	canvas.fillStyle = value;
	return first === canvas.fillStyle && parseHex(first) ? first : undefined;
}

export function readHooks(element: Element): ColourHooks {
	const style = getComputedStyle(element);
	const hooks: ColourHooks = {};
	for (const name of COLOUR_HOOKS) {
		const value = cssColour(style.getPropertyValue(`--showfm-${name}`));
		if (value) hooks[name] = value;
	}
	return hooks;
}
