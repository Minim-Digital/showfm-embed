/**
 * React JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-react';` in a .d.ts file.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { ShowfmEpisodesAttributes, ShowfmPlayerAttributes } from '../lib/element-types.js';

type ElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
type ShowfmPlayerProps = ElementProps & ShowfmPlayerAttributes;
type ShowfmEpisodesProps = ElementProps & ShowfmEpisodesAttributes;

declare module 'react' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
			'showfm-episodes': ShowfmEpisodesProps;
		}
	}
}
