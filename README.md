# @showfm/embed

The show.fm podcast player as a web component. Drop `<showfm-player>` into any page and it plays an episode from [show.fm](https://show.fm). `<showfm-episodes>` lists a show's episodes, each one playable (see [The episode list](#the-episode-list)). `<showfm-play>` is a play button for one episode, with a mini-player for the page (see [The play button](#the-play-button)). `<showfm-transcript>` is the follow-along transcript (see [The transcript](#the-transcript)).

It is the same player that show.fm serves as `/player/v1.js` today. This package is where that player is built and released.

## Use it from the CDN

Load the script once per page, then add a player:

```html
<script async src="https://embed.cdn.media/player/v1.js"></script>

<showfm-player
	episode="11111111-2222-4333-8444-555555555555"
	style="display:block;min-height:291px"
>
	<a href="https://show.fm/your-show/e/your-episode">Listen to Your Episode on show.fm</a>
</showfm-player>
```

- The link inside the element is the fallback. It shows before the script loads, without JavaScript, and if the episode cannot be played. See [Fallback markup](#fallback-markup) for the full form.
- The inline `min-height` reserves the player's height before the script loads, so the page does not jump. Use the value for your size and branding from [the height contract](#the-height-contract).
- The embed code builder in show.fm writes all of this for you.

`<podcasterplus-player>` is the player's old name. It is still registered, with the same attributes, so embeds pasted before the rename keep working.

## Use it from npm

```sh
npm install @showfm/embed
```

### Any framework (custom element)

Importing the package registers the elements, exactly as the CDN script does:

```js
import '@showfm/embed';
```

The package root also exports the player's pure helpers and the height contract:

```js
import { PLAYER_MIN_HEIGHTS, IFRAME_HEIGHTS } from '@showfm/embed';
```

Importing the root is safe in Node, SSR and workers: it only registers the elements where `customElements` exists. For code that never runs in a browser, `@showfm/embed/server` exports the same helpers and constants with no side effects and no DOM use at all:

```js
import { PLAYER_MIN_HEIGHTS, renderEpisodeHTML } from '@showfm/embed/server';
```

Besides the height contract, both entries export:

- `renderEpisodeHTML`, `renderEpisodeListHTML`, `renderTranscriptHTML`, `episodeJsonLd` and `serializeJsonLd`: see [Fallback markup](#fallback-markup).
- `apiGet`, the public API client the elements use. It returns a typed status (`ok`, `not-modified`, `not-found`, `unavailable`, `rate-limited` or `error`) and never throws. Pass `etag` from a server to get `not-modified` back; in a browser the HTTP cache already revalidates.
- `parseVtt` and its helpers (`activeCueIndex`, `activeWordIndex`, `matchingCueIndexes` and others): a tolerant WebVTT parser that runs in linear time.
- `STRING_TABLES`, `resolveStrings` and `formatString`: the elements' strings.
- `isShowfmMediaUrl` and `canOfferTranscript`: whether media is on a show.fm host.

### Svelte 5

`@showfm/embed/svelte` ships the player as Svelte source. Render `PlayerCore` directly with episode data you already have. Nothing is registered as a custom element.

```svelte
<script>
	import { PlayerCore } from '@showfm/embed/svelte';
	let { episode } = $props();
</script>

<PlayerCore {episode} size="compact" />
```

### TypeScript and JSX

The root entry types `document.querySelector('showfm-player')`. For JSX, load the typings for your framework once, for example in a `.d.ts` file:

```ts
import type {} from '@showfm/embed/jsx-react'; // or jsx-preact, jsx-solid
```

Then `<showfm-player episode="..." size="compact" />`, `<showfm-episodes podcast="..." layout="grid" />`, `<showfm-play episode="..." variant="icon" />` and `<showfm-transcript for="..." />` type-check, including the attribute values.

The package also ships a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) (`custom-elements.json`) for editors and tools.

### The classic script

`@showfm/embed/cdn/v1.js` is the same file the CDN serves, if you want to host it yourself. Put `@showfm/embed/cdn/locales/` and `@showfm/embed/cdn/chunks/` next to it: `v1.js` loads its German and French strings, the episode list's, the play button's and the transcript's code from there.

## Attributes

| Attribute              | Values                        | Default               | What it does                                                                                                                  |
| ---------------------- | ----------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `episode`              | episode UUID                  |                       | Plays that episode. Wins over `podcast`.                                                                                      |
| `podcast`              | podcast slug or UUID          |                       | Plays the show's latest released episode.                                                                                     |
| `theme`                | `auto`, `light`, `dark`       | the show's setting    | Pins the theme. `auto` follows the visitor's colour scheme.                                                                   |
| `size`                 | `standard`, `compact`         | `standard`            | Player size.                                                                                                                  |
| `accent`               | hex colour, such as `#0ea5e9` | the show's colour     | Pins the accent. It is adjusted, if needed, to meet contrast rules.                                                           |
| `wave`                 | `true`, `false`               | the show's setting    | Pins the waveform on or off. Off shows a plain progress bar.                                                                  |
| `api`                  | URL                           | `https://api.show.fm` | API origin. For development and testing only.                                                                                 |
| `heading-level`        | `2` to `6`                    | none                  | Wraps the episode title in a heading of that level. Without it the title is a link and no heading is emitted.                 |
| `credit`               | `auto`, `on`, `off`           | `auto`                | The "Powered by show.fm" footer. See [The credit](#the-credit).                                                               |
| `load`                 | `click`                       |                       | Draws a facade and requests nothing until it is pressed. See [Load on click](#load-on-click).                                 |
| `transcript`           | `on`, `open`                  | none                  | A Transcript button that opens the follow-along transcript under the player. `open` opens it at once.                         |
| `mini-player`          | `on`, `off`                   | `off`                 | The page's mini-player takes over when the player scrolls out of view. See [The mini-player option](#the-mini-player-option). |
| `mini-player-position` | `left`, `right`               | `right`               | The corner the collapsed mini-player sits in, when this player opens it.                                                      |
| `platform`             | `wordpress`                   | none                  | For the show.fm WordPress plugin only. See [The credit](#the-credit).                                                         |
| `lang`                 | language tag                  | `<html lang>`         | The language of the player's own strings. See [Strings and languages](#strings-and-languages).                                |

Set `episode` or `podcast`. With neither, the player shows its fallback.

### What a visitor sees when an episode is not public

- **Not found (404).** Scheduled, unpublished, deleted and unknown episodes all get the same answer from the API, so they look the same on the page: the element renders nothing and gives back its reserved height, and its fallback link is hidden with it. Nothing about a schedule can leak. When the tab becomes visible again the element checks once more, so a page left open still shows the episode once it is published. It never polls.
- **Suspended show (403).** The player shows "This show isn't available right now." with no actions.
- **Anything else** (a server error, rate limiting, no network). The player shows "This episode can't be played right now." and the fallback link.

### More than one embed on a page

- Only one plays at a time. Pressing play on one pauses the others.
- "Powered by show.fm" shows once per page, on the first embed (in page order) that shows it. The others render at their unbranded height, inside the space their snippet reserved, so the page does not move.

### The credit

"Powered by show.fm" follows the show's plan, as the public API resolves it: `branding.show_powered_by` is `false` only for a show whose plan includes branding removal and that has turned the credit off. Every element follows the same rule:

- `auto` (the default) and `off` hide the credit only when the payload allows it, except with `platform="wordpress"` (below). `credit="off"` on a show without branding removal still shows it.
- With no payload (the episode or list could not load) the credit shows. While an element is loading it holds the decision, so the credit does not jump to a later embed and back.
- `on` always shows it.
- `platform="wordpress"` is for the show.fm WordPress plugin only. The plugin passes `credit="off"` unless the site owner opts in, because a credit that ships in plugin code must be opt-in (WordPress.org guideline 10). With it, `credit="off"` hides the credit for any show.
- It still shows once per page: on the first embed that shows it. On a page with only play buttons it is in the mini-player, or, when the buttons have `mini-player="off"`, beside the first button.

### Audio hosted elsewhere

When an episode's audio is not on a show.fm media host (`m.cdn.media`, `media.podcasterplus.com` or staging's `m.showfm.dev`), it still plays, but there is no Download button and no transcript is offered. For testing, a page can add hosts with `window.showfmMediaHosts = ['media.example.test']`.

The player's colours, font and corners follow the [styling hooks](#styling-hooks). Its parts can also be styled with `::part()`: `container`, `artwork`, `title`, `subtitle`, `controls`, `play`, `seek`, `rate`, `mute`, `share`, `download`, `transcript`, `footer` and `error`.

### The transcript option

With `transcript="on"`, the standard player has a Transcript button next to the speed button. Pressing it opens the follow-along transcript under the controls: the player grows downwards by 395px (340px of text and the search row), and "Powered by" moves under the transcript. `transcript="open"` opens it at once. It is the same transcript as [`<showfm-transcript>`](#the-transcript), following this player.

- The button is offered only when the episode has a transcript and both the audio and the transcript are on a show.fm media host. The compact player has none.
- The transcript's code loads when it is first opened, not before. The player mounts it itself, so it works from `@showfm/embed/svelte` too (`<PlayerCore transcript="on" />`), where no elements are registered; there the code is a dynamic import.
- The transcript follows the element it is in, and takes its colours from it.
- Embed snippets reserve the closed player's height; an open transcript adds to it. For a fixed height, use the iframe's transcript variant.

### The mini-player option

With `mini-player="on"`, when the visitor scrolls the player out of view while it plays, the page's [mini-player](#the-mini-player) takes over. It drives the player's own audio, so nothing restarts or loads again, and the visitor keeps seek, skip, speed, the time left and the Transcript button. It is off by default.

- It opens only while the player plays: a paused player that scrolls away stays where it is. `mini-player` is read again at that moment, so taking it away stops the hand-off. Scrolling back to the player leaves the mini-player open; both control the same audio. Close stops it.
- One audio plays at a time, as always: a list or a play button starting takes the mini-player over, and pauses the player.
- `mini-player-position` and the [styling hooks](#styling-hooks) set on the player reach the mini-player, as they do from a list.
- The iframe pages leave it off: a mini-player cannot leave a frame.

## The episode list

`<showfm-episodes>` shows a podcast's episodes as a list or a grid. Each episode plays in place, through the same page audio as the players.

```html
<script async src="https://embed.cdn.media/player/v1.js"></script>

<showfm-episodes
	podcast="99999999-8888-4777-8666-555555555555"
	style="display:block;--showfm-height:640px;min-height:var(--showfm-height)"
>
	<ul>
		<li><a href="https://show.fm/your-show/e/latest">The latest episode</a></li>
		<li><a href="https://show.fm/your-show/e/one-before">The one before</a></li>
	</ul>
</showfm-episodes>
```

- The list of links is the fallback (`renderEpisodeListHTML`). It shows until the list loads and without JavaScript, and search engines follow its links.
- `--showfm-height` reserves the list's height. The list keeps it as its minimum height and grows downwards only, so nothing below it moves when it loads. The embed code builder measures the list and writes the value.
- The list's code is a separate file that `v1.js` adds from `chunks/` next to itself the first time a list is on the page, with the page's CSP nonce. A page without a list never downloads it. From npm it is bundled.

| Attribute              | Values                              | Default               | What it does                                                                                                          |
| ---------------------- | ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `podcast`              | podcast UUID or slug                |                       | The show. Prefer the UUID: it survives a slug change.                                                                 |
| `variant`              | `card`, `minimal`                   | `card`                | Card shows artwork and descriptions. Minimal is a quieter text list.                                                  |
| `layout`               | `auto`, `list`, `grid`, `compact`   | `auto`                | `auto` is a grid from 900px wide, else a list. For Card, only when at least half the episodes have their own artwork. |
| `count`                | `1` to `50`                         | `10`                  | Episodes per page. "Load more episodes" fetches the next page.                                                        |
| `season`               | season number                       | every season          | Only this season.                                                                                                     |
| `hide`                 | `trailer`, `bonus`, `trailer,bonus` | none                  | Leaves those episode types out.                                                                                       |
| `descriptions`         | `on`, `off`                         | `on`                  | Episode descriptions. In a list they show two lines, with "More" when they are longer.                                |
| `mini-player`          | `on`, `off`                         | `off`                 | Playing a row opens the page's mini-player (see [The mini-player](#the-mini-player)).                                 |
| `mini-player-position` | `left`, `right`                     | `right`               | The corner the collapsed mini-player sits in, when this list opens it.                                                |
| `heading-level`        | `2` to `6`                          | none                  | Wraps each episode title in a heading of that level. Without it no headings are emitted.                              |
| `credit`               | `auto`, `on`, `off`                 | `auto`                | The "Powered by show.fm" footer. See [The credit](#the-credit). Once per page.                                        |
| `platform`             | `wordpress`                         | none                  | For the show.fm WordPress plugin only. See [The credit](#the-credit).                                                 |
| `load`                 | `click`                             |                       | Requests nothing, not even the list's code, until the facade is pressed. See [Load on click](#load-on-click).         |
| `theme`                | `auto`, `light`, `dark`             | the show's setting    | Pins the theme.                                                                                                       |
| `accent`               | hex colour                          | the show's colour     | Pins the accent.                                                                                                      |
| `api`                  | URL                                 | `https://api.show.fm` | API origin. For development and testing only.                                                                         |
| `lang`                 | language tag                        | `<html lang>`         | The language of the list's own strings.                                                                               |

- A grid narrower than 480px shows as a list. Card and Minimal both have list, grid and compact layouts.
- After "Load more episodes", focus moves to the first new episode. After the last page the list says so.
- One episode plays at a time across the page's lists and players.
- A show with no episodes yet says so. A list that cannot load shows "Episodes can’t be loaded right now." with Retry. A suspended show (403) shows "This show isn’t available right now." with no actions. An unknown or unpublished show (404) renders nothing and gives back the reserved height.
- An episode that cannot be played shows its message in its row, with Retry and a link to show.fm. The rest of the list keeps working.
- The parts are `card` (each episode), `title`, `play`, `footer` and `error`.

### The list's transcript

The playing or paused row has a Transcript button when the episode has a transcript and both its audio and the transcript are on a show.fm media host. External audio gets none. It is on by default, with no attribute: the design names none.

- In a list it opens the follow-along [transcript](#the-transcript) inside the row, under the waveform (300px of text). Pressing the button again closes it.
- In a grid a card cannot grow, so it opens as a full-width panel under the playing card's row, and the rows below move down. Its header names the episode and has a Close button, which returns focus to the card's Transcript button.
- The compact layout has no room for it: there the mini-player's Transcript button is the way to it.
- It follows what the list plays and takes the list's colours. It closes when its row stops playing; if focus was inside it, focus moves to the row's play button.
- The transcript's code loads when one is first opened.

## The play button

`<showfm-play>` plays one episode from a button. Every button on the page plays through the same page audio as the players and lists, so pressing one pauses the rest.

```html
<script async src="https://embed.cdn.media/player/v1.js"></script>

<showfm-play episode="11111111-2222-4333-8444-555555555555">
	<a href="https://show.fm/your-show/e/your-episode">Your Episode</a>
	<audio controls preload="none" src="https://m.cdn.media/..."></audio>
</showfm-play>
```

- The link and the audio control are the fallback (`renderEpisodeHTML`, the same markup as the player's). They show until the button loads and without JavaScript; with `v1-fallback.css` the link is visually hidden and the line keeps the button's height.
- The button keeps one line of the same height in every state, so only its width changes: 40px for the small size, 48px (label) or 56px (icon) for the large one.
- Its code is a separate file that `v1.js` adds from `chunks/` next to itself the first time a button is on the page, with the page's CSP nonce. The page's mini-player is in the same file. From npm it is bundled.

| Attribute              | Values                  | Default               | What it does                                                                                                                       |
| ---------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `episode`              | episode UUID            |                       | Plays that episode. Wins over `podcast`.                                                                                           |
| `podcast`              | podcast slug or UUID    |                       | Plays the show's latest released episode.                                                                                          |
| `variant`              | `icon`, `label`, `link` | `label`               | `icon` is a round button (for a table). `label` shows "Play episode · 52 min" or the time left. `link` is text in a sentence.      |
| `size`                 | `sm`, `lg`              | `sm`                  | `sm` is a 32px icon or a 36px label in a 40px line. `lg` is a 56px icon or a 48px label. The link takes the text around it.        |
| `mini-player`          | `on`, `off`             | `on`                  | The first play opens the page's mini-player. With `off`, visitors can only play and pause, and the button shows the credit itself. |
| `mini-player-position` | `left`, `right`         | `right`               | The corner the collapsed mini-player sits in.                                                                                      |
| `credit`               | `auto`, `on`, `off`     | `auto`                | "Powered by show.fm" in the mini-player. See [The credit](#the-credit). Once per page.                                             |
| `platform`             | `wordpress`             | none                  | For the show.fm WordPress plugin only. See [The credit](#the-credit).                                                              |
| `load`                 | `click`                 |                       | Requests nothing, not even the button's code, until the facade is pressed. See [Load on click](#load-on-click).                    |
| `theme`                | `auto`, `light`, `dark` | the show's setting    | Pins the theme of the button and the mini-player it opens.                                                                         |
| `accent`               | hex colour              | the show's colour     | Pins the accent.                                                                                                                   |
| `api`                  | URL                     | `https://api.show.fm` | API origin. For development and testing only.                                                                                      |
| `lang`                 | language tag            | `<html lang>`         | The language of the button's own strings, and of the mini-player it opens.                                                         |

- The labels: "Play" (small), "Play episode · 52 min" (large), "Listen · 52 min" (link), then "Loading…", "Pause · 38 min left" and "Resume · 38 min left". The accessible name starts with the label and ends with the episode title, such as "Play: The Episode". The button never emits a heading.
- A button and any other button or list row for the same episode show the same state.
- An episode that cannot be played shows "This episode can’t be played right now." with Try again in the button's place; focus moves to Try again when the visitor pressed play. A browser that blocks playback shows "Your browser blocked audio playback." beside the button, which stays ready. A suspended show (403) shows "This show isn’t available right now." with no actions. The icon variant has room for a mark, not a sentence: it shows a quiet info mark named by the message, or a quiet Try again button described by it. An unknown or unpublished episode (404) renders nothing and gives back its line.
- The parts are `play` and `error`.
- A builder that lets people turn the mini-player off should say what that means: the string `miniPlayerOff` ("Visitors can only play and pause.") is in `STRING_TABLES` for that, translated.

### The mini-player

The page has one mini-player. It appears after the first play from a play button (or a list with `mini-player="on"`), at the end of the page's body, and shows whatever the page's shared audio is doing, whoever started it. Players with their own audio pause it as they always have. A player with `mini-player="on"` hands its own audio to it when it scrolls out of view while it plays (see [The mini-player option](#the-mini-player-option)).

- **Desktop:** a bar along the bottom of the window with the artwork, the title, the show and episode number, back 15 seconds, play, forward 30 seconds, the waveform to seek, the speed, Collapse and Close.
- **Collapsed:** a pill in the bottom right corner (or left, with `mini-player-position="left"`) with play, the title and the time left, and Expand. Collapse keeps playing.
- **Phones (640px and under):** a floating 64px bar with the title on one line, play and Expand. Expand opens a sheet with everything, the full title and Share. The sheet is a modal dialog: Tab stays inside it and Escape closes it.
- **Transcript:** for an episode whose audio and transcript are on show.fm, a Transcript button next to the speed opens the follow-along transcript (see [The transcript](#the-transcript)) in a panel above the bar's right end, following the shared audio. On a phone it is in the sheet, under the controls. Without a transcript the waveform takes the button's width.
- **Close** stops playback and hides the mini-player until the next play. Focus goes back to the button that opened it.
- **Suspended mid-listen:** playback stops, the title and artwork stay, the message takes the controls' place and only Close remains.
- **"Powered by show.fm"** shows in the mini-player when no embed above it on the page shows it, so a page with only play buttons still carries it once. Buttons with `mini-player="off"` open no mini-player, so the first of them shows the credit beside itself, in the button's muted text. It never wraps, so the button keeps its 40px line (48px for the large label): where "Powered by show.fm" does not fit, it shows "show.fm", never less. In a narrower space still, the button's label gives way and ends in an ellipsis ("Pause · 52 min left" is long); the button keeps its full name. The credit is always a link named "Powered by show.fm".
- `--showfm-bottom-offset` lifts it above a cookie bar or a chat bubble. Set it on the page (`:root`) or on the element that opens the mini-player. The other [styling hooks](#styling-hooks) work the same way: the mini-player takes those of the element that opened it.
- Opening it never moves focus. It says "Now playing: {title}" through a polite live region, and announces pausing, playing, a speed change and a suspended show. Under reduced motion nothing animates.
- From outside, style it with `showfm-mini-player::part(mini-player)`.
- The mini-player keeps playing while the visitor scrolls, not across page loads (unless the site is a single-page app).

## The transcript

`<showfm-transcript>` shows an episode's transcript and follows along: the line being spoken is highlighted, word by word when the transcript has word timings, and the text scrolls with it.

```html
<showfm-player id="episode-player" episode="11111111-2222-4333-8444-555555555555"></showfm-player>

<showfm-transcript
	for="episode-player"
	style="display:block;--showfm-height:377px;min-height:var(--showfm-height)"
></showfm-transcript>
```

What it follows:

- `for="id"`: the `showfm-player` or `showfm-episodes` with that id. With a list, it shows the transcript of the episode the list plays, in the accent and theme the list pinned.
- `episode="uuid"`: that episode's transcript. It follows along whenever that episode plays anywhere on the page, and reads as text otherwise. With `for` as well, only when that element plays it.
- Neither: whatever plays on the page. Until something plays it says "Play an episode to follow its transcript here."
- Changing `episode` or `for` starts afresh: a removed `episode`, or a `for` naming an element that has not played yet, shows nothing from before.

What the visitor can do:

- Click a line, or its timestamp, to play from there. The timestamp is the line's one button, named "Jump to 14 minutes 2 seconds, Tom", so the transcript is not hundreds of tab stops.
- Search it, ignoring case and accents. "3 of 12" says which match is active; the arrows, Enter and Shift+Enter move between matches, and Escape or the clear button ends the search. Matches are amber; the active one is ringed.
- Scroll away from the line being spoken, with the mouse, touch or keyboard. Following stops, and "Back to now · 14:02" (with an arrow towards it) brings it back. Searching stops following too.

How it behaves:

- Every attribute is live: change `episode`, `for` or `api` and it loads or follows afresh (an answer for the old value never lands); change `height`, `heading-level`, `theme`, `accent` or `lang` and it redraws. Removing `load="click"` before it has loaded loads it, as `showfm.load()` would.
- It keeps its height in every state: the search row (55px) over a text area of `height` pixels (320 by default), inside a 1px border, 377px in all. Loading shows a skeleton, and the search field is read-only (marked `aria-disabled`, so it keeps focus) until the text arrives.
- In a box under 400px wide (a sidebar) the timestamp moves onto the speaker line and the text takes the full width.
- Speaker names come from the transcript's voice tags and show when the speaker changes. Unlabelled speakers ("Speaker A") show no name.
- A transcript without word timings highlights whole lines. So does one whose timings no longer match the audio (a word outside its line, or lines that run past the end of the audio), which happens when the audio is replaced after transcription.
- Long transcripts stay light: only the lines near the one in view are in the page, plus the line being spoken and the active match. A 15,000-word transcript keeps well under 300 lines in the DOM.
- Nothing in it is a live region except the search count, so a screen reader is not interrupted by every word, nor by its loading, error or suspended messages. The line being spoken has `aria-current`. When the area under the search row changes (Try again, a new episode, a suspended show) and focus was in it, focus moves to what replaces it rather than to the page.
- Under reduced motion it jumps to the line instead of scrolling smoothly. Nothing animates.
- The transcript is offered only when the audio and the WebVTT are both on a show.fm media host. Otherwise, with `episode` the element renders nothing; following, it says "There’s no transcript for this episode."
- If the transcript cannot load it says so, with Try again; playback is not affected. A suspended show shows "This show isn’t available right now." An unknown or unpublished `episode` (404) renders nothing and gives back its reserved height.

| Attribute       | Values                  | Default               | What it does                                                                                                                                |
| --------------- | ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `episode`       | episode UUID            |                       | That episode's transcript.                                                                                                                  |
| `for`           | element id              |                       | Follows what that player or list plays.                                                                                                     |
| `height`        | `120` to `2000`         | `320`                 | Height of the text area in pixels.                                                                                                          |
| `heading-level` | `2` to `6`              | none                  | Makes the name "Transcript" a heading of that level. Without it no heading is emitted.                                                      |
| `load`          | `click`                 |                       | Requests nothing, not even the transcript's code, until its facade is pressed or `showfm.load()` runs. See [Load on click](#load-on-click). |
| `theme`         | `auto`, `light`, `dark` | the show's setting    | Pins the theme.                                                                                                                             |
| `accent`        | hex colour              | the show's colour     | Pins the accent.                                                                                                                            |
| `api`           | URL                     | `https://api.show.fm` | API origin. For development and testing only.                                                                                               |
| `lang`          | language tag            | `<html lang>`         | The language of the transcript's own strings.                                                                                               |

- The transcript's code is a separate file that `v1.js` adds from `chunks/` the first time a transcript is on the page (or a player's transcript is opened). A page without one never downloads it.
- Put the transcript as text inside the element (`renderTranscriptHTML`) so search engines and visitors without JavaScript can read it. It scrolls inside `--showfm-height` until the element upgrades.
- The part is `card`, the panel.

## Styling hooks

Every element reads the same `--showfm-*` custom properties. Set them on the page (`:root`) to style every embed, or on one element. They are a stable part of the package: a hook is never renamed or dropped within v1.

```css
:root {
	--showfm-accent: #0e7c66;
	--showfm-surface: #fbf7ef;
	--showfm-font: 'Source Serif 4', Georgia, serif;
	--showfm-radius: 6px;
}
```

| Hook                     | Elements                              | Default                  | What it does                                                                                                                                                  |
| ------------------------ | ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--showfm-accent`        | all                                   | the show's colour        | The accent, one colour in. The fill (3:1), text in the accent (4.5:1), the colour on the fill, the tint and the glow are derived from it, for light and dark. |
| `--showfm-accent-text`   | all                                   | from the accent          | Text and links in the accent.                                                                                                                                 |
| `--showfm-surface`       | all                                   | white, or `#17151f` dark | The card background. It decides between dark and light text, whatever `theme` says.                                                                           |
| `--showfm-background`    | list (Minimal), play button           | `--showfm-surface`       | The page's colour behind an element with no card of its own. Its text colours are derived from it.                                                            |
| `--showfm-text`          | all                                   | from the surface         | Titles and body text.                                                                                                                                         |
| `--showfm-muted`         | all                                   | from the surface         | Secondary text: dates, times, "Powered by".                                                                                                                   |
| `--showfm-border`        | all                                   | from the surface         | Card borders and dividers.                                                                                                                                    |
| `--showfm-wave`          | player, list, mini-player             | from the surface         | The unplayed waveform bars.                                                                                                                                   |
| `--showfm-wave-played`   | player, list, mini-player             | the accent fill          | The played part of the waveform.                                                                                                                              |
| `--showfm-focus`         | all                                   | the accent text          | The keyboard focus ring.                                                                                                                                      |
| `--showfm-font`          | all                                   | `inherit`                | The font. Unset, every element uses the page's font.                                                                                                          |
| `--showfm-font-title`    | player, list, mini-player             | `--showfm-font`          | Episode titles only.                                                                                                                                          |
| `--showfm-font-scale`    | list, transcript                      | `1`                      | Scales the list's type and the transcript's lines, 0.85 to 1.3.                                                                                               |
| `--showfm-radius`        | player, list, transcript, mini-player | `14px`                   | Corners of the cards, 0 to 28px. Artwork follows at 70%. Play buttons and pills stay round.                                                                   |
| `--showfm-space`         | list                                  | `1`                      | The list's spacing, 0.85 to 1.4.                                                                                                                              |
| `--showfm-bottom-offset` | mini-player                           | `0px`                    | Lifts the mini-player above a cookie bar or a chat bubble.                                                                                                    |
| `--showfm-height`        | list, transcript                      | `0`                      | The height to reserve before the element loads. See [The episode list](#the-episode-list) and [The transcript](#the-transcript).                              |

Colours stay readable whatever is set:

- Every state uses these colours: the loading skeleton, the facade, the error and suspended messages, the blocked note and the empty list as well as the ready element. Elements with no card (the play button and its messages, the Minimal list) sit on the page, so set `--showfm-background` to your page's colour when it is not white, or the theme's dark.

- Every text colour reaches WCAG AA (4.5:1) on each surface it sits on: the card, the tint and the controls. A hook that does not is darkened or lightened until it does, so `--showfm-text`, `--showfm-muted` and `--showfm-accent-text` are preferences, not exact colours. The accent fill, the focus ring and the played waveform reach 3:1 on the card and on the tint (a playing row, the line being spoken). A pale accent is darkened, as the `accent` attribute always was.
- A mid-tone `--showfm-surface` is lightened or darkened until text can reach 7:1 on it, which leaves room for the tint and the controls.
- `--showfm-border` and `--showfm-wave` are decorative and used as written.
- Colours can be hex, `rgb()`, `hsl()` or a name. A translucent colour, or one the browser cannot read as sRGB, is ignored and the element keeps its own.
- A pinned `accent` attribute wins over `--showfm-accent`, which wins over the show's colour. A surface wins over `theme`: set `--showfm-surface` inside `@media (prefers-color-scheme: dark)`, or under your site's own dark-mode class, to give dark mode its own.
- The colour hooks are read again when the visitor's colour scheme changes and when an attribute changes on the element, `<html>` or `<body>`, which is how sites switch their own dark mode. A hook changed anywhere else shows on the element's next render.

Fonts and sizes:

- Since 1.5 the player takes the page's font, as the other elements always have. No font is downloaded. Before 1.5 it asked for Geist and fell back to the system font.
- The [height contract](#the-height-contract) holds in any font: CI measures the four heights in the platform's UI font, Geist, a wide serif (Merriweather) and a narrow sans (Oswald), set on the page and through `--showfm-font`. Type sizes in the player, the play button and the mini-player are fixed for the same reason, so `--showfm-font-scale` does not reach them.
- Fonts without tabular figures make times jitter as they count.
- The iframe embeds always use Geist: an iframe cannot see the page's font.

The click loader's `load="click"` facade draws before any code is here, so it takes only the `accent` attribute and `--showfm-font`; once `v1.js` is on the page, a facade follows every hook. The parts (`::part()`) remain an unsupported escape hatch for anything the hooks do not cover.

For builders, `STYLE_HOOKS` lists every hook's name, and `resolvePalette(accent, theme, hooks)` returns the colours an element would derive, so a builder can show the adjusted colour next to the one picked.

## Load on click

For sites that need consent before any third-party request, `load="click"` makes the element request nothing from show.fm until the visitor presses it. Paste the loader inline after the elements instead of loading `v1.js`:

```html
<showfm-player
	episode="11111111-2222-4333-8444-555555555555"
	load="click"
	style="display:block;min-height:291px"
>
	<a href="https://show.fm/your-show/e/your-episode">Your Episode</a>
	<audio controls preload="none" src="https://m.cdn.media/..."></audio>
</showfm-player>
<script>
	/* the contents of @showfm/embed/cdn/click-loader.js */
</script>
```

- Until a press, the loader draws a facade that knows only the accent, the element type and the reserved height. Nothing is requested from show.fm or embed.cdn.media.
- The first press adds `v1.js` once. A player loads and plays; focus stays on its play button. If the browser no longer treats the press as permission to play, the player shows its blocked message with Play ready.
- Other facades stay facades until they are pressed.
- `showfm.load()` loads every facade at once, for consent tools, including elements added after the loader ran. It may run before `v1.js` has arrived: each element is marked, and loads when `v1.js` upgrades it.
- A list's facade loads the list and moves focus to its first episode. Without the loader, a `load="click"` list shows its fallback links until `showfm.load()` runs.
- A play button's facade is its button alone, in its 40px line. One press loads and plays, and opens the mini-player; focus stays on the button. Without the loader, it shows its fallback until `showfm.load()` runs.
- A transcript's facade, "Load transcript", keeps the height the element reserves (`--showfm-height`, else 377px) and hides the fallback text behind it. One press loads the transcript. On a page with only a transcript, `showfm.load()` adds `v1.js` too.
- Set `data-src` on the loader's `<script>` to load a self-hosted copy of `v1.js`.
- The loader is about 4.7 kB as written (2.3 kB gzipped). iframes cannot be facades.

## Fallback markup

Each element upgrades the markup inside it. That markup is what shows before the script loads, without JavaScript, and to search engines, which keep following its links.

| Element             | Markup inside it                                                                        |
| ------------------- | --------------------------------------------------------------------------------------- |
| `showfm-player`     | `<a href="listen URL">title</a><audio controls preload="none" src="audio URL"></audio>` |
| `showfm-episodes`   | `<ul><li><a href="listen URL">title</a></li>...</ul>`                                   |
| `showfm-play`       | the same as the player                                                                  |
| `showfm-transcript` | `<div><p><strong>Speaker:</strong> text</p>...</div>`                                   |

`renderEpisodeHTML(episode, options)` and `renderEpisodeListHTML(podcast, episodes, options)` in `@showfm/embed/server` produce exactly this markup from public API payloads, HTML-escaped, and drop any link that is not `http` or `https`. `renderTranscriptHTML(cuesOrVtt, options)` takes the WebVTT text or parsed cues: one paragraph per speaker's turn, named, and one per cue for unlabelled speakers. `episodeJsonLd(episode)` returns optional schema.org `PodcastEpisode` data; put it in a `<script type="application/ld+json">` with `serializeJsonLd`, which escapes `<`.

The shared test cases are in the package at `@showfm/embed/fixtures/fallback/*.json`, so ports to other languages (the WordPress plugin's PHP) can prove they produce the same bytes.

`@showfm/embed/cdn/v1-fallback.css` is an optional stylesheet (under 0.6 kB gzipped) for that markup. It styles players only until they are defined, so it never touches an upgraded player. A list or a play button is defined as soon as `v1.js` runs but mounts when its code arrives, so its fallback stays styled until then; it also makes the list a block that keeps `--showfm-height`, and the play button a line of its own height. A transcript's fallback text scrolls inside `--showfm-height` (377px if it is not set), so the upgrade does not move the page.

## Strings and languages

- The player's strings follow the element's `lang`, else the page's `<html lang>`, else English. English, German and French ship. Episode titles and descriptions are never translated.
- From npm, German and French are bundled. The CDN script carries English only: when an element's language resolves to German or French, it adds `locales/de.js` or `locales/fr.js` (under 0.6 kB gzipped) from next to itself, once per page, and the element re-renders in that language. An English page downloads nothing more.
- Override any string for every element with `window.showfmStrings = { error: '...' }` before the script runs, or for one element with `element.strings = { play: '...' }`. The element's own overrides win. The keys are in `STRING_TABLES.en`.
- Keep overrides short. The compact player has 1px of spare height, so error, blocked and suspended messages must fit one line (40 characters is the limit the shipped strings keep). A longer one is cut with an ellipsis rather than adding a line.

## The height contract

Embed code reserves the player's height before the script loads. These heights are part of the v1 contract: they are pasted into pages we cannot edit, so they only change in a new major version.

| Size       | With "Powered by" | Without |
| ---------- | ----------------- | ------- |
| `standard` | 291px             | 252px   |
| `compact`  | 101px             | 83px    |

The iframe embed uses 300px (standard) and 110px (compact). The loading skeleton uses the smaller value for each size, so it never exceeds the reserved space.

The constants are exported as `PLAYER_MIN_HEIGHTS` and `IFRAME_HEIGHTS`. CI measures the four heights in Chromium on every change, in four fonts (see [Styling hooks](#styling-hooks)).

## Privacy

The player, the list, the play button, the mini-player and the transcript set no cookies and use no storage. The transcript fetches the episode's WebVTT from show.fm's media host. They request episode data from the show.fm API, and the audio only loads when the listener presses play (`preload="none"`). With `load="click"` an element requests nothing at all until the visitor presses it.

## Origin

This code was imported from the show.fm app (`Minim-Digital/podcaster-plus-app`) at commit `f7bf738a1674fa14cfa202f8bcc7d8eca4cf43e8`, without its history. The built `v1.js` is the same code as the app's build of that commit. The only difference is the generated names of Svelte's scoped CSS classes, which are derived from the file path and stay inside the shadow root.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE).
