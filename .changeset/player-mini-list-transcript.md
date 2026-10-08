---
'@showfm/embed': minor
---

`<showfm-player>` gets `mini-player="on"` (off by default) and `mini-player-position`: when the visitor scrolls the player out of view while it plays, the page's mini-player takes over the player's own audio, so nothing restarts, and one audio still plays at a time. The episode list's playing or paused row now has a Transcript button that opens the follow-along transcript inside the row, or in a grid as a full-width panel under the playing card's row with a Close button. It is offered only when the episode's audio and transcript are on show.fm, and not in the compact layout.

The elements' API calls no longer parse `Retry-After`, which none of them waits on; `apiGet` still does.
