/**
 * Solid JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-solid';` in a .d.ts file.
 */
import type { JSX } from 'solid-js';
import type { ShowfmEpisodesAttributes, ShowfmPlayerAttributes } from '../lib/element-types.js';

type ShowfmPlayerProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayerAttributes;
type ShowfmEpisodesProps = JSX.HTMLAttributes<HTMLElement> & ShowfmEpisodesAttributes;

declare module 'solid-js' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
			'showfm-episodes': ShowfmEpisodesProps;
		}
	}
}
