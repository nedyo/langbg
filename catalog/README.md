# langbg-catalog

Builds the font catalog of langbg.com from [google/fonts](https://github.com/google/fonts).

**Nothing converted is hosted.** The catalog stores addresses of the original font files (pinned to a
google/fonts commit); the visitor's browser fetches them, converts them with the same code as the
converter and builds the ZIP. What the site serves from here is `catalog.json` and one small preview
font per family.

```
uv run --project catalog langbg-catalog build --dry-run          # everything in memory, a report, nothing written
uv run --project catalog langbg-catalog build --only montserrat,ibmplexsans --trial catalog/.trial
uv run --project catalog langbg-catalog build                    # the real run: writes into web/ and catalog/
uv run --project catalog pytest
```

## What a run does

1. **Checkout.** A blobless, sparse clone of google/fonts in `catalog/.cache/` (git-ignored). First only
   `ofl/*/METADATA.pb` and `ofl/*/OFL.txt`; then the `.ttf`/`.otf` files of the families with the
   `cyrillic` subset. `--update` moves it to the latest main.
2. **Scan.** Every font file listed in a family's METADATA.pb goes through `langbg.analyze` together with the
   family's `OFL.txt`. The family lands in one of two groups of the catalog, or stays out:

   | Group | Meaning | Button on the page |
   |---|---|---|
   | `convert` (a) | Bulgarian `locl` in every file | one click: ZIP of "`<name>` BG" |
   | `native` (b) | a stylistic set (e.g. `ss06`) already gives the Bulgarian forms | none: "enable ss06" |
   | `no_bgr`, `no_change`, `partial`, `error`, `failed` | nothing to do, nothing visible, only some files, unreadable, failed a check | not listed (see the report) |

   A Reserved Font Name changes nothing here: it is recorded (`reservedNames`) and the page of such a font carries
   one informational line ("the converted copy is for your own use"). `native` wins over `convert`.
3. **Prove the conversion** (group a): every file is converted the way the browser will (suffix ` BG`), then checked: the OpenType Sanitizer must accept it, and HarfBuzz must shape the converted
   font with no language exactly as the original is shaped with `lang="bg"`, at the default location and at both
   ends of every axis. Nothing is kept; a family that fails stays out, so the button is never shown for a font
   that would not convert. A family without `OFL.txt` stays out too (the ZIP must carry the license).
4. **Cut the preview** (all groups): the original font, cut down by fontTools to the Bulgarian alphabet, Latin,
   digits, common marks and the letters that change, as WOFF2, with **every layout feature kept** (without `locl`
   the page would show the Russian forms; the default list of the subsetter would also drop `ss06`). The page shows
   it with `lang="bg"`. It is checked against the original: same outlines, advances and offsets with `lang="bg"`
   (default location and axis ends), the stylistic set still works, and `lang="bg"` still changes something.
   A font whose license reserves a name is renamed inside the preview file (we host it, and a cut-down font is a modified
   version; nobody sees the name). Name IDs 0, 13 and 14 (copyright, license description, license URL) are kept in every
   preview exactly as in the original, and the gate fails the family if one is missing.
5. **Write** `web/src/data/catalog.json` (its `letters` lists only the Bulgarian alphabet and ѝ/Ѝ that change, even when the
   BGR `locl` also touches ы, љ or punctuation) (the type is `web/src/lib/catalog.ts`; a test compares the two),
   `web/public/catalog/<slug>/preview.woff2`, `catalog/manifest.json` and `catalog/report.md`.

## Addresses

An entry's `files[].url` and `licenseFile` look like
`https://raw.githubusercontent.com/google/fonts/<sha>/ofl/<folder>/<file>`. `<sha>` is the google/fonts commit at
which the family's files and license were last seen to change (kept in `manifest.json`), not the commit of the
latest run, so a monthly run rewrites no address of a family that did not change. The address is still right
because the hash of the input is the same.

Nothing else is kept between runs: every run scans, proves and cuts every family again (a few minutes). The
manifest only records, per family, the input hash, the pinned commit and what happened.

## Partial runs

`--only a,b` and `--limit N` process part of the catalog, so they need `--trial DIR` (every output goes there) or
an explicit `--data-file`. Such a catalog is written with `"mock": true` (a sample); the site says so on its pages.
A full run writes `"mock": false`.
