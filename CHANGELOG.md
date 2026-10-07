# @showfm/embed

## 1.5.0

### Minor Changes

- [#12](https://github.com/Minim-Digital/showfm-embed/pull/12) [`029a7e1`](https://github.com/Minim-Digital/showfm-embed/commit/029a7e1bae28cb7ec25cdffccd4148c534d6cd85) Thanks [@danmaby](https://github.com/danmaby)! - Every element now reads the same `--showfm-*` styling hooks (accent, accent text, surface, background, text, muted, border, waveform, focus ring, font, title font, font scale, radius, space, bottom offset and height), and every colour derived from them reaches WCAG AA in light and dark, in every state: the player's error message is now a card in its palette, and the play button's messages use the palette (on `--showfm-background`) instead of the page's text colour. The player now uses the page's font, as the other elements do, and its four heights are unchanged in any font. The episode list's play buttons and Minimal's play pill are drawn as designed, round and in the accent: they had no styles since the list shipped.

## 1.4.1

### Patch Changes

- [#13](https://github.com/Minim-Digital/showfm-embed/pull/13) [`ebcb704`](https://github.com/Minim-Digital/showfm-embed/commit/ebcb7043279db4ac7d45e73a7ec3c948876c8e2f) Thanks [@danmaby](https://github.com/danmaby)! - Fix catastrophic backtracking in the VTT parser

## 1.4.0

### Minor Changes

- [#10](https://github.com/Minim-Digital/showfm-embed/pull/10) [`44d63b2`](https://github.com/Minim-Digital/showfm-embed/commit/44d63b290b0ffbd1f1269cdb6b6cebb792193273) Thanks [@danmaby](https://github.com/danmaby)! - Add `<showfm-transcript>`, the follow-along transcript. It follows a player or list on the page (`for`), an episode (`episode`), or whatever plays, and highlights the line being spoken, word by word when the WebVTT has word timings (falling back to whole lines when it has none, or when the timings no longer match the audio). A click on a line seeks. It has search with match navigation, "Back to now" when the visitor scrolls away, a narrow layout for sidebars, loading, error, suspended and empty states at a fixed height, and only the lines near the one in view are in the DOM, so long transcripts stay light. It takes `height`, `heading-level`, `load="click"`, `theme`, `accent` and `lang`, and its strings ship in English, German and French. On the CDN its code is a lazy chunk (`cdn/chunks/transcript-*.js`); the npm root bundles it.

  The player gets `transcript="on|open"`: a Transcript button that opens the transcript under the standard player, which grows downwards. The player mounts the transcript itself, so the option works from `@showfm/embed/svelte` too. The mini-player gets its Transcript toggle: a panel above the bar, or in the phone sheet, that follows the shared audio. The click loader draws a "Load transcript" facade for a `load="click"` transcript, and `showfm.load()` now also marks elements added after the loader ran, which load when `v1.js` arrives. Removing `load="click"` from an element that has not loaded yet loads it. `@showfm/embed/server` adds `renderTranscriptHTML`, the transcript as paragraphs for search engines and visitors without JavaScript, with shared fixtures, and `v1-fallback.css` keeps that text inside `--showfm-height` until the element upgrades.

  The episode list's accent text in the dark theme now reaches 4.5:1 on the tint; it had stayed at the 3:1 fill colour.

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
