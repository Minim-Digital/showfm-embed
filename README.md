# @showfm/embed

The show.fm podcast player as a web component. Drop `<showfm-player>` into any page and it plays an episode from [show.fm](https://show.fm).

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

- `renderEpisodeHTML`, `renderEpisodeListHTML`, `episodeJsonLd` and `serializeJsonLd`: see [Fallback markup](#fallback-markup).
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

Then `<showfm-player episode="..." size="compact" />` type-checks, including the attribute values.

The package also ships a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/) (`custom-elements.json`) for editors and tools.

### The classic script

`@showfm/embed/cdn/v1.js` is the same file the CDN serves, if you want to host it yourself. Put `@showfm/embed/cdn/locales/` next to it: `v1.js` loads its German and French strings from there.

## Attributes

| Attribute       | Values                        | Default               | What it does                                                                                                  |
| --------------- | ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `episode`       | episode UUID                  |                       | Plays that episode. Wins over `podcast`.                                                                      |
| `podcast`       | podcast slug or UUID          |                       | Plays the show's latest released episode.                                                                     |
| `theme`         | `auto`, `light`, `dark`       | the show's setting    | Pins the theme. `auto` follows the visitor's colour scheme.                                                   |
| `size`          | `standard`, `compact`         | `standard`            | Player size.                                                                                                  |
| `accent`        | hex colour, such as `#0ea5e9` | the show's colour     | Pins the accent. It is adjusted, if needed, to meet contrast rules.                                           |
| `wave`          | `true`, `false`               | the show's setting    | Pins the waveform on or off. Off shows a plain progress bar.                                                  |
| `api`           | URL                           | `https://api.show.fm` | API origin. For development and testing only.                                                                 |
| `heading-level` | `2` to `6`                    | none                  | Wraps the episode title in a heading of that level. Without it the title is a link and no heading is emitted. |
| `credit`        | `auto`, `on`, `off`           | `auto`                | The "Powered by show.fm" footer. `auto` follows the show's plan.                                              |
| `load`          | `click`                       |                       | Draws a facade and requests nothing until it is pressed. See [Load on click](#load-on-click).                 |
| `lang`          | language tag                  | `<html lang>`         | The language of the player's own strings. See [Strings and languages](#strings-and-languages).                |

Set `episode` or `podcast`. With neither, the player shows its fallback.

### What a visitor sees when an episode is not public

- **Not found (404).** Scheduled, unpublished, deleted and unknown episodes all get the same answer from the API, so they look the same on the page: the element renders nothing and gives back its reserved height, and its fallback link is hidden with it. Nothing about a schedule can leak. When the tab becomes visible again the element checks once more, so a page left open still shows the episode once it is published. It never polls.
- **Suspended show (403).** The player shows "This show isn't available right now." with no actions.
- **Anything else** (a server error, rate limiting, no network). The player shows "This episode can't be played right now." and the fallback link.

### More than one embed on a page

- Only one plays at a time. Pressing play on one pauses the others.
- "Powered by show.fm" shows once per page, on the first embed (in page order) that shows it. The others render at their unbranded height, inside the space their snippet reserved, so the page does not move.

### Audio hosted elsewhere

When an episode's audio is not on a show.fm media host (`m.cdn.media`, `media.podcasterplus.com` or staging's `m.showfm.dev`), it still plays, but there is no Download button and no transcript is offered. For testing, a page can add hosts with `window.showfmMediaHosts = ['media.example.test']`.

The player's parts can be styled with `::part()`: `container`, `artwork`, `title`, `subtitle`, `controls`, `play`, `seek`, `rate`, `mute`, `share`, `download`, `footer` and `error`.

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
- `showfm.load()` loads every facade at once, for consent tools.
- Set `data-src` on the loader's `<script>` to load a self-hosted copy of `v1.js`.
- The loader is about 4.3 kB as written (2.1 kB gzipped). iframes cannot be facades.

## Fallback markup

Each element upgrades the markup inside it. That markup is what shows before the script loads, without JavaScript, and to search engines, which keep following its links.

| Element           | Markup inside it                                                                        |
| ----------------- | --------------------------------------------------------------------------------------- |
| `showfm-player`   | `<a href="listen URL">title</a><audio controls preload="none" src="audio URL"></audio>` |
| `showfm-episodes` | `<ul><li><a href="listen URL">title</a></li>...</ul>`                                   |
| `showfm-play`     | the same as the player                                                                  |

`renderEpisodeHTML(episode, options)` and `renderEpisodeListHTML(podcast, episodes, options)` in `@showfm/embed/server` produce exactly this markup from public API payloads, HTML-escaped, and drop any link that is not `http` or `https`. `episodeJsonLd(episode)` returns optional schema.org `PodcastEpisode` data; put it in a `<script type="application/ld+json">` with `serializeJsonLd`, which escapes `<`.

The shared test cases are in the package at `@showfm/embed/fixtures/fallback/*.json`, so ports to other languages (the WordPress plugin's PHP) can prove they produce the same bytes.

`@showfm/embed/cdn/v1-fallback.css` is an optional stylesheet (under 0.5 kB gzipped) for that markup. It styles only elements that are not defined yet, so it never touches an upgraded element.

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

The constants are exported as `PLAYER_MIN_HEIGHTS` and `IFRAME_HEIGHTS`. CI measures the four heights in Chromium on every change.

## Privacy

The player sets no cookies and uses no storage. It requests episode data from the show.fm API, and the audio only loads when the listener presses play (`preload="none"`). With `load="click"` it requests nothing at all until the visitor presses it.

## Origin

This code was imported from the show.fm app (`Minim-Digital/podcaster-plus-app`) at commit `f7bf738a1674fa14cfa202f8bcc7d8eca4cf43e8`, without its history. The built `v1.js` is the same code as the app's build of that commit. The only difference is the generated names of Svelte's scoped CSS classes, which are derived from the file path and stay inside the shadow root.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE).
