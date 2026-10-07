/**
 * `@showfm/embed`: importing this module registers <showfm-player> and its
 * <podcasterplus-player> alias, exactly as loading dist/cdn/v1.js does. It
 * also exports the player's pure modules and the height contract constants.
 */
import './lib/element.js';

export * from './lib/modules.js';
export type { ShowfmPlayerAttributes, ShowfmPlayerElement } from './lib/element-types.js';
