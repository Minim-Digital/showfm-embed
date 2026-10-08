---
'@showfm/embed': minor
---

`<showfm-player>` gets `mini-player="on"` (off by default) and `mini-player-position`: when the visitor scrolls the player out of view while it plays, the page's mini-player takes over the player's own audio, so nothing restarts, and one audio still plays at a time. The episode list's playing or paused row now has a Transcript button that opens the follow-along transcript inside the row, or in a grid as a full-width panel under the playing card's row with a Close button. It is offered only when the episode's audio and transcript are on show.fm, and not in the compact layout.

"Powered by show.fm" now follows the show's plan on every element: `credit="off"` hides it only when the public API's branding payload allows it (a show whose plan includes branding removal and that has turned the credit off), and it shows when no payload has loaded, including under the player's and the list's error cards. The WordPress plugin passes `platform="wordpress"`, with which `credit="off"` hides it for any show, as WordPress.org requires a credit in plugin code to be opt-in. The elements' API calls no longer parse `Retry-After`, which none of them waits on; `apiGet` still does.
