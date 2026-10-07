/**
 * React JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-react';` in a .d.ts file.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { ShowfmPlayerAttributes } from '../index.js';

type ShowfmPlayerProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
	ShowfmPlayerAttributes;

declare module 'react' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
		}
	}
}
