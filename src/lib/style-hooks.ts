/**
 * Every `--showfm-*` styling hook. README.md documents each; this list is
 * what the mini-player carries over from the element that opens it, and what
 * the package exports for builders. Only the mini-player's chunk imports it,
 * so it stays out of v1.js.
 */
import { COLOUR_HOOKS } from './palette';

export const STYLE_HOOKS: readonly string[] = [
	...COLOUR_HOOKS,
	'font',
	'font-title',
	'font-scale',
	'radius',
	'space',
	'bottom-offset',
	'height'
].map((name) => `--showfm-${name}`);
