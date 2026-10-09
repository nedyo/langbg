# langBG web

Astro static site (`https://langbg.com`): Bulgarian at `/`, English at `/en/`. The converter runs `core/` in the
browser: Pyodide + fontTools in a Web Worker, all self-hosted (no CDN at runtime). Fonts never leave the user's machine.

## Commands

Run from `web/`:

| Command | Action |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at `localhost:4321` (prepares the runtime first) |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Serve `dist/` |
| `pnpm check` | `astro check`: type-checks `.astro` and `.ts` (TypeScript 6; `astro check` does not support 7 yet) |
| `pnpm test:e2e` | Playwright tests against the production build on port 4399 (needs `pnpm exec playwright install chromium` once) |
| `pnpm prepare:runtime` | The runtime preparation on its own (it runs before `dev` and `build`) |
| `pnpm run deploy` | Publish `dist/` to Cloudflare (CI does this; see Deploy) |

Needs `uv` on PATH: it builds the wheel of `core/`.

## Pages and strings

- `src/pages/` has the Bulgarian pages, `src/pages/en/` the English ones; both only pick a language and render a shared
  view from `src/views/`. Routes: `/`, `/fonts/`, `/fonts/<slug>/`, `/about/`, `404` (each also under `/en/`; the build moves the English 404
  to `en/404.html`, where Cloudflare looks for it).
- `src/i18n/ui.ts` is the **only** place with interface text. `bg` defines the shape and `en` must match it, so a missing
  translation fails `pnpm check`. Strings are plain data with `{placeholders}`; the converter's part is sent to the browser
  as JSON in the visitor's language. Never write visible text in a component.
- `src/layouts/Base.astro` writes canonical, `hreflang`, Open Graph and Twitter tags for every page.
- `src/styles/global.css` is the whole stylesheet (tokens for light and dark, then one block per component).
- Fonts (Spectral, Source Sans 3) come from Astro's Fonts API: downloaded at build time, served from our domain. Both
  were checked with `langbg analyze` for `cyrl/BGR locl`; an e2e test proves the site shows Bulgarian forms. Literata,
  Alegreya, Fira Sans, Inter, Noto Serif and Playfair Display have none, so do not swap them in.

## The converter

- `src/components/Converter.astro` and `Preview.astro` render the markup on the server; `src/lib/app.ts` fills it in.
- `src/worker/convert.worker.ts` loads the runtime lazily and answers `analyze` and `convert` over `postMessage`.
  `src/lib/client.ts` is the promise API; `src/lib/idle.ts` starts the preload after `load`, never during first paint.
- `src/lib/protocol.ts` mirrors `core/src/langbg/report.py`. `src/lib/readme.ts` writes the `README.txt` inside the ZIP.
- `src/lib/preview.ts` loads fonts with FontFace. Samples set their own `lang`: with no language they show what Figma
  shows, with `bg` what a browser shows.

## Browser runtime

`scripts/prepare-runtime.mjs` generates (all git-ignored):

- `public/pyodide/<version>/` — Pyodide runtime copied from the pinned `pyodide` npm package, plus the fontTools wheel.
  The version in the path lets it be cached for a year.
  The wheel's URL and sha256 come from `core/uv.lock`, so the browser runs the same fontTools as the Python tests
  (Pyodide's own bundled fontTools is older).
- `public/langbg-<version>-py3-none-any.whl` — wheel of `core/`, rebuilt on every run.
- `public/runtime.json` — what the worker installs (wheel URLs with a content hash for cache-busting).

To upgrade Pyodide, change the exact version in `package.json` **and** `PYODIDE_VERSION` in the script.
Pyodide is MPL-2.0 and served unmodified; it is credited on the About page.

## Catalog

`src/data/catalog.json` and the previews in `public/catalog/` are written by `catalog/` (`langbg-catalog build`), which
the monthly Catalog workflow runs and commits. No converted font is hosted: the download button fetches the originals
from google/fonts and converts them in the browser (`src/lib/catalog-download.ts`).

## Deploy

Cloudflare Workers static assets, no Worker script (`wrangler.jsonc`): `dist/` is served as it is on langbg.com
(www.langbg.com redirects there through a Redirect Rule in the Cloudflare dashboard). `public/_headers` caches
`/_astro/*` and `/pyodide/*` for a year and keeps `runtime.json` fresh.

`.github/workflows/deploy.yml` tests, builds and runs `pnpm run deploy` after every push to main and after every Catalog
run. It needs the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the variable `CF_BEACON_TOKEN`
(Cloudflare Web Analytics, cookie-free; the beacon is only in builds where it is set).

## Brand assets

`public/favicon.svg` is the Bulgarian "л" drawn by `scripts/make-favicon.py`; `public/og/*.png` and `public/favicon.ico`
come from `scripts/make-brand-assets.mjs`, which renders the built site. They are committed; regenerate only when the
design or the hero text changes (instructions at the top of each script).

## Tests

`e2e/` — Playwright: `convert.spec.ts` (the converter, the reserved-name line, ZIP and font checks) and `site.spec.ts`
(languages, SEO tags, sitemap, theme, catalog, About). Lighthouse is measured by hand (`pnpm dlx lighthouse`); the last run scored at least 99 in all four
categories on every page type, mobile and desktop.
