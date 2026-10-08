---
'@showfm/embed': patch
---

Add `@showfm/embed/cdn/click-loader-local.js`, the `load="click"` loader for the show.fm WordPress plugin and other self-hosters. It is the same loader with no CDN default: it takes `v1.js` from `window.showfmEmbedSrc`, then from its `data-src`, and with neither it does nothing, so the elements keep their fallback markup. The file names no remote host. `click-loader.js` is unchanged.
