/**
 * Solid JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-solid';` in a .d.ts file.
 */
import type { JSX } from 'solid-js';
import type { ShowfmPlayerAttributes } from '../lib/element-types.js';

type ShowfmPlayerProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayerAttributes;

declare module 'solid-js' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
		}
	}
}
