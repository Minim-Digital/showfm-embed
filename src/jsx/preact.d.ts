/**
 * Preact JSX typings for the show.fm elements. Load them once, for example
 * with `import type {} from '@showfm/embed/jsx-preact';` in a .d.ts file.
 */
import type { JSX } from 'preact';
import type {
	ShowfmEpisodesAttributes,
	ShowfmPlayAttributes,
	ShowfmPlayerAttributes,
	ShowfmTranscriptAttributes
} from '../lib/element-types.js';

type ShowfmPlayerProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayerAttributes;
type ShowfmEpisodesProps = JSX.HTMLAttributes<HTMLElement> & ShowfmEpisodesAttributes;
type ShowfmPlayProps = JSX.HTMLAttributes<HTMLElement> & ShowfmPlayAttributes;
type ShowfmTranscriptProps = JSX.HTMLAttributes<HTMLElement> & ShowfmTranscriptAttributes;

declare module 'preact' {
	namespace JSX {
		interface IntrinsicElements {
			'showfm-player': ShowfmPlayerProps;
			'podcasterplus-player': ShowfmPlayerProps;
			'showfm-episodes': ShowfmEpisodesProps;
			'showfm-play': ShowfmPlayProps;
			'showfm-transcript': ShowfmTranscriptProps;
		}
	}
}
