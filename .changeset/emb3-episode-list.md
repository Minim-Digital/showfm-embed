---
'@showfm/embed': minor
---

Add `<showfm-episodes>`, a podcast's episodes as a list or grid, each one playable. It has Card and Minimal variants (`variant`), list, grid and compact layouts with an `auto` rule, `count` with "Load more", `season` and `hide` filters, `descriptions`, `heading-level`, `credit`, `load="click"`, `theme`, `accent` and `lang`, and keeps `--showfm-height` as its minimum height. On the CDN its code is a lazy chunk (`cdn/chunks/`) that `v1.js` adds only when a list is on the page; the npm root bundles it. JSX typings and the Custom Elements Manifest include it.
