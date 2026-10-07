---
'@showfm/embed': minor
---

Every element now reads the same `--showfm-*` styling hooks (accent, accent text, surface, background, text, muted, border, waveform, focus ring, font, title font, font scale, radius, space, bottom offset and height), and every colour derived from them reaches WCAG AA in light and dark, in every state: the player's error message is now a card in its palette, and the play button's messages use the palette (on `--showfm-background`) instead of the page's text colour. The player now uses the page's font, as the other elements do, and its four heights are unchanged in any font. The episode list's play buttons and Minimal's play pill are drawn as designed, round and in the accent: they had no styles since the list shipped.
