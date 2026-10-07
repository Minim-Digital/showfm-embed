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

- The link inside the element is the fallback. It shows before the script loads and if the episode cannot be loaded.
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

Importing the root is safe in Node, SSR and workers: it only registers the elements where `customElements` exists. For code that never runs in a browser, `@showfm/embed/server` exports the same helpers and constants with no side effects at all:

```js
import { PLAYER_MIN_HEIGHTS } from '@showfm/embed/server';
```

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

`@showfm/embed/cdn/v1.js` is the same file the CDN serves, if you want to host it yourself.

## Attributes

| Attribute | Values                        | Default               | What it does                                                        |
| --------- | ----------------------------- | --------------------- | ------------------------------------------------------------------- |
| `episode` | episode UUID                  |                       | Plays that episode. Wins over `podcast`.                            |
| `podcast` | podcast slug or UUID          |                       | Plays the show's latest released episode.                           |
| `theme`   | `auto`, `light`, `dark`       | the show's setting    | Pins the theme. `auto` follows the visitor's colour scheme.         |
| `size`    | `standard`, `compact`         | `standard`            | Player size.                                                        |
| `accent`  | hex colour, such as `#0ea5e9` | the show's colour     | Pins the accent. It is adjusted, if needed, to meet contrast rules. |
| `wave`    | `true`, `false`               | the show's setting    | Pins the waveform on or off. Off shows a plain progress bar.        |
| `api`     | URL                           | `https://api.show.fm` | API origin. For development and testing only.                       |

Set `episode` or `podcast`. With neither, the player shows its fallback.

The player's parts can be styled with `::part()`: `container`, `artwork`, `title`, `subtitle`, `controls`, `play`, `seek`, `rate`, `mute`, `share`, `download`, `footer` and `error`.

## The height contract

Embed code reserves the player's height before the script loads. These heights are part of the v1 contract: they are pasted into pages we cannot edit, so they only change in a new major version.

| Size       | With "Powered by" | Without |
| ---------- | ----------------- | ------- |
| `standard` | 291px             | 252px   |
| `compact`  | 101px             | 83px    |

The iframe embed uses 300px (standard) and 110px (compact). The loading skeleton uses the smaller value for each size, so it never exceeds the reserved space.

The constants are exported as `PLAYER_MIN_HEIGHTS` and `IFRAME_HEIGHTS`. CI measures the four heights in Chromium on every change.

## Privacy

The player sets no cookies and uses no storage. It requests episode data from the show.fm API, and the audio only loads when the listener presses play (`preload="none"`).

## Origin

This code was imported from the show.fm app (`Minim-Digital/podcaster-plus-app`) at commit `f7bf738a1674fa14cfa202f8bcc7d8eca4cf43e8`, without its history. The built `v1.js` is the same code as the app's build of that commit. The only difference is the generated names of Svelte's scoped CSS classes, which are derived from the file path and stay inside the shadow root.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE).
