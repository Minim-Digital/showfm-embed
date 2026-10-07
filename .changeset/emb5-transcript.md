---
'@showfm/embed': minor
---

Add `<showfm-transcript>`, the follow-along transcript. It follows a player or list on the page (`for`), an episode (`episode`), or whatever plays, and highlights the line being spoken, word by word when the WebVTT has word timings (falling back to whole lines when it has none, or when the timings no longer match the audio). A click on a line seeks. It has search with match navigation, "Back to now" when the visitor scrolls away, a narrow layout for sidebars, loading, error, suspended and empty states at a fixed height, and only the lines near the one in view are in the DOM, so long transcripts stay light. It takes `height`, `heading-level`, `load="click"`, `theme`, `accent` and `lang`, and its strings ship in English, German and French. On the CDN its code is a lazy chunk (`cdn/chunks/transcript-*.js`); the npm root bundles it.

The player gets `transcript="on|open"`: a Transcript button that opens the transcript under the standard player, which grows downwards. The mini-player gets its Transcript toggle: a panel above the bar, or in the phone sheet, that follows the shared audio. `@showfm/embed/server` adds `renderTranscriptHTML`, the transcript as paragraphs for search engines and visitors without JavaScript, with shared fixtures, and `v1-fallback.css` keeps that text inside `--showfm-height` until the element upgrades.

The episode list's accent text in the dark theme now reaches 4.5:1 on the tint; it had stayed at the 3:1 fill colour.
