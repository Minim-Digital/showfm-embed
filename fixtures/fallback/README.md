# Fallback markup fixtures

Shared cases for the light-DOM fallback markup and the JSON-LD that
`@showfm/embed/server` produces. The WordPress plugin's PHP port runs the
same cases, so both produce the same bytes. They ship in the package at
`@showfm/embed/fixtures/fallback/*.json`.

Each file is one case:

| Field         | What it is                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `description` | What the case shows.                                                                           |
| `function`    | `renderEpisodeHTML`, `renderEpisodeListHTML` or `episodeJsonLd`.                               |
| `args`        | The arguments, in order.                                                                       |
| `expected`    | The exact HTML string, or for `episodeJsonLd` the object (compare decoded JSON, not the text). |

`src/lib/__tests__/fallback.test.ts` checks every case against the
TypeScript functions. A change to the markup changes these files, and the
PHP port has to follow.
