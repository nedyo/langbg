"""The gate in front of the catalog: nothing is published unless the converted font checks out.

1. The OpenType Sanitizer accepts it (it is what browsers run before they use a web font).
2. HarfBuzz shapes the Bulgarian letters of the converted font, with no language set (what Figma
   does), exactly as the original is shaped with lang=bg, at the default location of the font and
   at both ends of every axis; and the conversion changed something for untagged text.

Direction and script are set by hand and guess_segment_properties() is never called: it would fill
in the operating system's language ("bg" on a Bulgarian Windows) and turn "no language" into "bg".
"""

from __future__ import annotations

import tempfile
from collections.abc import Sequence
from io import BytesIO
from pathlib import Path

import ots
import uharfbuzz as hb
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

BG_LOWER = "абвгдежзийклмнопрстуфхцчшщъьюяѝ"
BG_UPPER = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯЍ"


def sample_text(codepoints: Sequence[int]) -> str:
    changed = "".join(chr(cp) for cp in codepoints)
    return f"{BG_LOWER} {BG_UPPER} {changed} {changed.upper()} {changed.lower()} 0123 Aa"


def axis_locations(data: bytes) -> list[dict[str, float]]:
    """The default instance and, for a variable font, each axis at its minimum and maximum."""
    font = TTFont(BytesIO(data), lazy=True)
    locations: list[dict[str, float]] = [{}]
    if "fvar" in font:
        for axis in font["fvar"].axes:
            for value in (axis.minValue, axis.maxValue):
                if value != axis.defaultValue:
                    locations.append({axis.axisTag: value})
    return locations


def shape(
    data: bytes,
    text: str,
    lang: str | None,
    variations: dict[str, float],
    features: dict[str, bool] | None = None,
    outlines: bool = False,
) -> list[tuple]:
    """The shaped text: per glyph (glyph, cluster, advance, x offset, y offset). With `outlines` the glyph
    is its drawn outline instead of its number, so a cut-down copy (other glyph numbers) can be compared
    with its original."""
    font = hb.Font(hb.Face(data))
    if variations:
        font.set_variations(variations)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction = "ltr"
    buf.script = "Cyrl"
    if lang is not None:
        buf.language = lang
    hb.shape(font, buf, features or {})
    drawn: dict[int, tuple] = {}

    def glyph(gid: int) -> int | tuple:
        if not outlines:
            return gid
        if gid not in drawn:
            pen = RecordingPen()
            font.draw_glyph_with_pen(gid, pen)
            drawn[gid] = tuple(pen.value)
        return drawn[gid]

    return [
        (glyph(info.codepoint), info.cluster, pos.x_advance, pos.x_offset, pos.y_offset)
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions, strict=True)
    ]


def sanitizer_problem(data: bytes, suffix: str) -> str | None:
    """None when OTS accepts the font, else what it said."""
    with tempfile.TemporaryDirectory() as folder:
        src = Path(folder) / f"font{suffix}"
        src.write_bytes(data)
        result = ots.sanitize(str(src), str(Path(folder) / "out"), capture_output=True)
    if result.returncode == 0:
        return None
    return (result.stderr or result.stdout or f"exit code {result.returncode}").strip()[:300]


def shaping_problems(original: bytes, converted: bytes, codepoints: Sequence[int]) -> list[str]:
    text = sample_text(codepoints)
    problems: list[str] = []
    for location in axis_locations(original):
        where = f" at {location}" if location else ""
        expected = shape(original, text, "bg", location)
        got = shape(converted, text, None, location)
        if got != expected:
            problems.append(f"shaping differs from the original with lang=bg{where}")
        elif not location and got == shape(original, text, None, location):
            problems.append("the conversion changed nothing for untagged text")
    return problems


def verify(original: bytes, converted: bytes, suffix: str, codepoints: Sequence[int]) -> list[str]:
    """Everything wrong with `converted` as a conversion of `original`; empty means it can be published."""
    problems: list[str] = []
    ots_message = sanitizer_problem(converted, suffix)
    if ots_message and not sanitizer_problem(original, suffix):  # an original that fails too is not our doing
        problems.append(f"OpenType Sanitizer rejects it: {ots_message}")
    try:
        problems += shaping_problems(original, converted, codepoints)
    except Exception as e:  # noqa: BLE001 - a font HarfBuzz cannot load is a failed check, not a crashed run
        problems.append(f"HarfBuzz could not shape it: {type(e).__name__}: {e}")
    return problems
