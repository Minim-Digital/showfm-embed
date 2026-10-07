---
'@showfm/embed': minor
---

Add `<showfm-play>`, a play button for one episode (by UUID, or the latest for a podcast) as an icon, a labelled button or a link in a sentence, in two sizes, with every state: loading, playing, paused, can't be played, blocked by the browser, suspended and collapsed on 404. It keeps one line of the same height in every state, takes `credit`, `load="click"`, `theme`, `accent` and `lang`, and its strings ship in English, German and French.

Add the page's mini-player, which the first play from a button opens (`mini-player`, on by default) and which `<showfm-episodes mini-player="on">` now opens too: a bar along the bottom of the window, a pill in either corner when collapsed (`mini-player-position`), and on phones a 64px bar with a sheet for the full controls. It follows the page's shared audio, carries "Powered by show.fm" when no embed above it does, and rises above a cookie bar with `--showfm-bottom-offset`. On the CDN the button and the mini-player are one lazy chunk (`cdn/chunks/play-*.js`); the npm root bundles it. The click loader draws a play button's facade as its button alone, and `v1-fallback.css` keeps the button's line before it upgrades.
