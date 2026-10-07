---
'@showfm/embed': minor
---

Shared foundations for every element. The player gets `heading-level`, `credit` and `load="click"` (with an inline click loader and `showfm.load()`), German and French strings with overrides, one error string, a page audio controller (one plays at a time, "Powered by show.fm" once per page), collapse on 404 with no schedule leak, a suspended-show message on 403, and no Download for audio hosted elsewhere. `@showfm/embed/server` adds `renderEpisodeHTML`, `renderEpisodeListHTML`, `episodeJsonLd`, the API client and the WebVTT parser, and the package ships `cdn/click-loader.js`, `cdn/v1-fallback.css` and shared fallback fixtures. The CDN script carries English only and loads German or French from `cdn/locales/` when an element needs them.
