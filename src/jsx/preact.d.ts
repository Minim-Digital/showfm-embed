/**
 * Preact JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-preact';` in a .d.ts file.
 */
import type { JSX } from 'preact';
import type { ShowfmEpisodesAttributes, ShowfmPlayerAttributes } from '../lib/element-types.js';

type ShowfmPlayerProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayerAttributes;
type ShowfmEpisodesProps = JSX.HTMLAttributes<HTMLElement> & ShowfmEpisodesAttributes;

declare module 'preact' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
			'showfm-episodes': ShowfmEpisodesProps;
		}
	}
}
