# @showfm/embed

## 1.3.0

### Minor Changes

- [#8](https://github.com/Minim-Digital/showfm-embed/pull/8) [`617b046`](https://github.com/Minim-Digital/showfm-embed/commit/617b04656e28199563a0d063c29feb7cfe304a02) Thanks [@danmaby](https://github.com/danmaby)! - Add `<showfm-play>`, a play button for one episode (by UUID, or the latest for a podcast) as an icon, a labelled button or a link in a sentence, in two sizes, with every state: loading, playing, paused, can't be played, blocked by the browser, suspended and collapsed on 404. It keeps one line of the same height in every state, takes `credit`, `load="click"`, `theme`, `accent` and `lang`, and its strings ship in English, German and French.

  Add the page's mini-player, which the first play from a button opens (`mini-player`, on by default) and which `<showfm-episodes mini-player="on">` now opens too: a bar along the bottom of the window, a pill in either corner when collapsed (`mini-player-position`), and on phones a 64px bar with a sheet for the full controls. It follows the page's shared audio, carries "Powered by show.fm" when no embed above it does, and rises above a cookie bar with `--showfm-bottom-offset`. On the CDN the button and the mini-player are one lazy chunk (`cdn/chunks/play-*.js`); the npm root bundles it. The click loader draws a play button's facade as its button alone, and `v1-fallback.css` keeps the button's line before it upgrades.

## 1.2.0

### Minor Changes

- [#6](https://github.com/Minim-Digital/showfm-embed/pull/6) [`265e807`](https://github.com/Minim-Digital/showfm-embed/commit/265e8073f98d8530f7b484e9e5c665811f56d8d3) Thanks [@danmaby](https://github.com/danmaby)! - Add `<showfm-episodes>`, a podcast's episodes as a list or grid, each one playable. It has Card and Minimal variants (`variant`), list, grid and compact layouts with an `auto` rule, `count` with "Load more", `season` and `hide` filters, `descriptions`, `heading-level`, `credit`, `load="click"`, `theme`, `accent` and `lang`, and keeps `--showfm-height` as its minimum height. On the CDN its code is a lazy chunk (`cdn/chunks/`) that `v1.js` adds only when a list is on the page; the npm root bundles it. JSX typings and the Custom Elements Manifest include it.

  The player and the list now drop any URL from the API that is not absolute `http` or `https` before it can become a link, an image or the audio source.

## 1.1.0

### Minor Changes

- [#4](https://github.com/Minim-Digital/showfm-embed/pull/4) [`9e02a43`](https://github.com/Minim-Digital/showfm-embed/commit/9e02a432910c99e2d79cc64daa22b3efaa33a3cc) Thanks [@danmaby](https://github.com/danmaby)! - Shared foundations for every element. The player gets `heading-level`, `credit` and `load="click"` (with an inline click loader and `showfm.load()`), German and French strings with overrides, one error string, a page audio controller (one plays at a time, "Powered by show.fm" once per page), collapse on 404 with no schedule leak, a suspended-show message on 403, and no Download for audio hosted elsewhere. `@showfm/embed/server` adds `renderEpisodeHTML`, `renderEpisodeListHTML`, `episodeJsonLd`, the API client and the WebVTT parser, and the package ships `cdn/click-loader.js`, `cdn/v1-fallback.css` and shared fallback fixtures. The CDN script carries English only and loads German or French from `cdn/locales/` when an element needs them.

## 1.0.0

### Major Changes

- [#2](https://github.com/Minim-Digital/showfm-embed/pull/2) [`3fb1bc0`](https://github.com/Minim-Digital/showfm-embed/commit/3fb1bc08cdf8e340e57ae17545899a05f0179b9e) Thanks [@danmaby](https://github.com/danmaby)! - First release. The show.fm player as the `<showfm-player>` custom element (with the `<podcasterplus-player>` alias), imported unchanged from the show.fm app. It ships as a classic script (`dist/cdn/v1.js`, the file served as `/player/v1.js`), an ESM entry that registers the elements, and Svelte 5 source at `@showfm/embed/svelte`. It also includes the height contract constants, a Custom Elements Manifest and JSX typings for React, Preact and Solid.
