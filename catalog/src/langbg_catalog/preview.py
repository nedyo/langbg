"""The catalog preview: the ORIGINAL font, cut down to the letters the page shows, as WOFF2.

The page sets lang="bg" on the sample text, so the browser applies the font's own `locl` BGR forms,
which is what the converted font gives in Figma. The cut keeps every layout feature (without `locl`
the preview would show the Russian forms) and drops what the page never draws: the other letters,
hinting, and the glyph names.

A font whose license reserves its name is renamed inside the file, because a cut-down font is a
modified version and a modified version may not carry the reserved name (SIL OFL 1.1, point 3).
The legal notices (name IDs 0, 7, 13, 14) keep naming the original, as they do in a converted font.
The preview is not a conversion, so it gets no langbg marker (version, description).
"""

from __future__ import annotations

import unicodedata
from io import BytesIO

from fontTools import subset
from fontTools.ttLib import TTFont
from langbg import naming

from .verify import BG_LOWER, BG_UPPER, axis_locations, sanitizer_problem, shape

# Copyright (0), license description (13) and license URL (14): the license travels with every copy of a font.
LEGAL_NAME_IDS = (0, 13, 14)
LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
PUNCTUATION = " .,:;!?-–—'\"„“”«»()[]/&@#%+=*_…№€$"
BASE_CHARACTERS = BG_LOWER + BG_UPPER + LATIN + PUNCTUATION


def preview_codepoints(changed: list[int], family_name: str = "") -> list[int]:
    """What the preview font keeps: the Bulgarian alphabet, Latin, digits, punctuation, every letter
    the Bulgarian forms change (so the letters grid is complete), and the characters of the family
    name (the catalog card draws the name in the font itself).

    A letter the font has no glyph for (Spectral has none for Ѝ and ѝ) is built by the shaper from its
    parts: И and a combining grave. Those parts must stay, or the preview shows an empty box.
    """
    wanted = {*map(ord, BASE_CHARACTERS), *changed, *map(ord, family_name)}
    for codepoint in list(wanted):
        wanted.update(map(ord, unicodedata.normalize("NFD", chr(codepoint))))
    return sorted(wanted)


def _options() -> subset.Options:
    options = subset.Options()
    options.layout_features = ["*"]  # the default list has no stylistic sets, and ss06 is what some fonts offer
    options.name_IDs = ["*"]  # the license (13, 14) and copyright (0) travel with the font
    options.name_languages = ["*"]
    options.name_legacy = True  # keep the Macintosh records too: the default drops them, and with them half of the copyright and license names
    options.notdef_outline = True
    options.hinting = False
    options.glyph_names = False
    options.drop_tables = [*options.drop_tables, "meta"]  # nothing the page uses, and the subsetter cannot cut it
    options.flavor = "woff2"
    return options


def subset_preview(original: bytes, codepoints: list[int], rename_to: str | None = None) -> bytes:
    font = TTFont(BytesIO(original), recalcBBoxes=False, recalcTimestamp=False)
    subsetter = subset.Subsetter(options=_options())
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    if rename_to:
        _rename(font, rename_to)
    font.flavor = "woff2"
    out = BytesIO()
    font.save(out)
    return out.getvalue()


def _rename(font: TTFont, family: str) -> None:
    plan = naming.plan_names(font, family_name=family)
    ps_name = naming.apply_names(font, plan, naming.fvar_ps_name_ids(font), mark=False)
    naming.apply_cff_names(font, plan, ps_name)


def shows_difference(original: bytes, codepoints: list[int]) -> bool:
    """Does `lang="bg"` change the look of the original font anywhere (default location, ends of every axis)?
    A font can have a BGR `locl` that swaps in glyphs identical to the default ones: nothing to convert."""
    text = "".join(chr(cp) for cp in codepoints if chr(cp).isalpha())
    return any(
        shape(original, text, "bg", location, outlines=True) != shape(original, text, None, location, outlines=True)
        for location in axis_locations(original)
    )


def legal_names(font: TTFont) -> set[tuple[int, int, int, int, bytes]]:
    """Every copyright / license record of the font, exactly as stored."""
    return {
        (r.nameID, r.platformID, r.platEncID, r.langID, r.toBytes())
        for r in font["name"].names
        if r.nameID in LEGAL_NAME_IDS
    }


def to_sfnt(woff2: bytes) -> bytes:
    font = TTFont(BytesIO(woff2))
    font.flavor = None
    out = BytesIO()
    font.save(out)
    return out.getvalue()


def verify_preview(original: bytes, preview: bytes, codepoints: list[int], native_set: str | None = None) -> list[str]:
    """What is wrong with `preview` as a stand-in for `original` shown with lang=bg. Empty means fine.

    The glyph outlines HarfBuzz picks (with their advances and offsets) must be the same as the
    original's with lang=bg, at the default location and at the ends of every axis, and different
    from the preview's own outlines with no language (otherwise `locl` was lost).
    """
    problems: list[str] = []
    sfnt = to_sfnt(preview)
    lost = legal_names(TTFont(BytesIO(original))) - legal_names(TTFont(BytesIO(sfnt)))
    if lost:
        ids = ", ".join(str(i) for i in sorted({record[0] for record in lost}))
        problems.append(f"the preview lost the copyright / license names (name IDs {ids}), which must stay in every copy")
    message = sanitizer_problem(sfnt, ".ttf")
    if message and not sanitizer_problem(original, ".ttf"):
        problems.append(f"OpenType Sanitizer rejects the preview: {message}")
    text = "".join(chr(cp) for cp in codepoints if chr(cp).isalpha())
    features = {native_set: True} if native_set else None
    try:
        for location in axis_locations(original):
            where = f" at {location}" if location else ""
            expected = shape(original, text, "bg", location, outlines=True)
            if shape(sfnt, text, "bg", location, outlines=True) != expected:
                problems.append(f"the preview shapes differently from the original with lang=bg{where}")
            if native_set and shape(sfnt, text, None, location, features, True) != shape(original, text, None, location, features, True):
                problems.append(f"{native_set} gives other letters in the preview than in the original{where}")
        if shape(sfnt, text, "bg", {}, outlines=True) == shape(sfnt, text, None, {}, outlines=True):
            problems.append("lang=bg changes nothing in the preview (the Bulgarian forms are gone)")
    except Exception as e:  # noqa: BLE001 - a font HarfBuzz cannot load is a failed check, not a crashed run
        problems.append(f"HarfBuzz could not shape the preview: {type(e).__name__}: {e}")
    return problems
