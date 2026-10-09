# langBG core

Pure-Python (fontTools only) library and CLI that rewires a font's GSUB so Bulgarian
Cyrillic forms work in Figma. Runs in Pyodide as well as natively.

```
uv sync
uv run pytest
```

## CLI

```
uv run langbg analyze Montserrat-Regular.ttf
uv run langbg convert Montserrat-*.ttf --mode default -o out/
uv run langbg convert "IBMPlexSans[wdth,wght].ttf" --mode stylistic --name "Kiril Sans" -o out/
```

- `--mode default` — Bulgarian forms become the default (no settings in Figma).
- `--mode stylistic` — Bulgarian forms behind a new stylistic set (first free from ss20 down),
  labelled "Bulgarian forms" / "Български форми".
- `--suffix " BG"` (default) or `--name "New Family"`.
- `analyze` reads Reserved Font Names from name IDs 0/13/14 and from `OFL.txt` next to the font (or
  `--ofl`). They are only reported: a copy is never refused or renamed for them.

## API

```python
from langbg import load_font, analyze, convert, save_font

font = load_font(data)                       # bytes: TTF/OTF/WOFF
report = analyze(font, ofl_text=None)        # Report; report.to_dict() is JSON-ready
new_font, report = convert(font, mode="default", family_suffix=" BG",
                           family_name=None)
data = save_font(new_font)                   # bytes, always TTF/OTF
```

Errors (all `LangbgError` with a stable `.code` and `.to_dict()`): `NoBgrForms`,
`AlreadyConverted`, `InvalidFamilyName`,
`NoFreeStylisticSet`, `UnsupportedFont`.

## What changes in a font

Only GSUB (default-LangSys `locl` of `cyrl`/`DFLT`, or a new stylistic set), `name`
(IDs 1, 3, 4, 5, 6, 16, 21, 22, 25, fvar instance PostScript names, the stylistic set
label), CFF FamilyName/FullName/font name, `head.modified`; `DSIG` is dropped.
All other tables are copied byte-for-byte (tested).

## Tests

HarfBuzz shaping proves equivalence: the converted font with no language gives the same
glyphs as the original with `lang="bg"` — for every GSUB feature, at several variable-font
locations, including a synthetic FeatureVariation on the BGR locl. Outputs pass OTS.
Fixtures: see `tests/fixtures/SOURCES.md`.
