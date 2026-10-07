/**
 * Preact JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-preact';` in a .d.ts file.
 */
import type { JSX } from 'preact';
import type { ShowfmPlayerAttributes } from '../index.js';

type ShowfmPlayerProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayerAttributes;

declare module 'preact' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
		}
	}
}
