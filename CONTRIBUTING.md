# Contributing

Thanks for helping. This file covers how to work on the package and how releases happen.

## Set up

You need Node 22 or later and pnpm (the version is pinned in `package.json`; `corepack enable` picks it up).

```sh
pnpm install --frozen-lockfile
```

## Layout

| Path                 | What it is                                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| `src/lib/`           | The player: Svelte components and pure modules. Shipped as source at `/svelte`. |
| `src/lib/__tests__/` | Unit tests (Vitest, jsdom, Testing Library, jest-axe).                          |
| `src/server.ts`      | The side-effect-free entry (`/server`). The root adds the element registration. |
| `src/cdn/`           | The inline `load="click"` loader and the fallback stylesheet.                   |
| `fixtures/fallback/` | Shared fallback markup cases, shipped for the WordPress plugin's PHP port.      |
| `src/jsx/`           | JSX typings for React, Preact and Solid.                                        |
| `tests/contract/`    | Tests against the built files in `dist/`.                                       |
| `tests/browser/`     | Playwright tests in Chromium: the height contract.                              |
| `fixtures/jsx/`      | Compile-only fixtures that prove the JSX typings work.                          |
| `scripts/`           | Build, manifest, publish and security-review tooling.                           |

## Checks

CI runs all of these on every pull request. Run them before you push:

```sh
pnpm lint            # prettier and eslint
pnpm check           # svelte-check, warnings fail
pnpm test            # unit tests
pnpm build           # everything in dist/
pnpm cem:check       # custom-elements.json matches the components
pnpm test:contract   # tests against dist/
pnpm size            # v1.js within 30 kB gzipped; the loader and fallback CSS within theirs
pnpm publint
pnpm attw
pnpm jsx:check
pnpm test:browser    # needs `pnpm exec playwright install chromium` once
```

If you change an attribute or a `part`, run `pnpm cem` and commit `custom-elements.json`. The script fails if an attribute or part has no description.

## Rules for the player

- **v1 is a contract.** `dist/cdn/v1.js` is served to pages we cannot edit. Keep both tag names, every attribute and its behaviour, the skeleton heights and the light-DOM fallback slot. A breaking change ships as a new entry (`v2.js`), not as a change to v1.
- **The height contract** (`src/lib/heights.ts`) changes only in a major version. If a change moves a rendered height, the browser test fails.
- **Stay self-contained.** The player imports only `./` modules and Svelte. No runtime dependencies, no global CSS and no web fonts: everything lands in the public bundle.
- **Every visible string has a key** in `src/lib/strings.ts` (English) and `src/lib/locales/` (German and French). The CDN build bundles English only and loads the others as `dist/cdn/locales/*.js` on demand, so keep new languages out of `v1.js`. A test holds each to the design's maximum length, and the browser test renders the one-line messages in Geist at 320px.
- **Fallback markup is a contract with the WordPress plugin.** If `src/lib/fallback.ts` changes its output, update `fixtures/fallback/` in the same pull request; the plugin's PHP port follows it.
- **Accessibility.** Every state stays axe-clean, and keyboard and screen-reader behaviour is tested.

## Changesets and releases

Every pull request that changes what the package ships needs a changeset:

```sh
pnpm changeset
```

Pick the bump (patch, minor or major) and write one or two sentences for the changelog. Changes to tests, CI or docs alone do not need one.

Releases are automatic and use no npm token:

1. When changesets reach `main`, the release workflow (`.github/workflows/release.yml`) opens or updates a "Version packages" pull request with the version bump and the changelog.
2. Merging that pull request publishes to npm with trusted publishing (OIDC) and provenance, then tags the release and creates the GitHub release.

Pull requests opened by the workflow do not trigger CI on their own. Close and reopen the "Version packages" pull request to run CI before merging it.

Trusted publishing on npmjs.com is set up for the workflow file name `release.yml`. Do not rename it.

## Security review

Add the `security-review` label to a pull request when it is ready to merge. That runs a Claude security review of the final diff. Read the verdict in the run's last step, not just the tick: the notes at the top of `.github/workflows/security-review.yml` explain why.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
