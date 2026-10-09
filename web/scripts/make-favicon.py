"""Draws web/public/favicon.svg: the Bulgarian form of the letter "л" (the Cyrillic "l" of langbg).

The outline is taken from an OFL font, after shaping with language "bg" so that the Bulgarian
glyph is picked. Run once when the mark changes:

    uv run --project core python web/scripts/make-favicon.py <Spectral-ExtraBold.ttf> web/public/favicon.svg

The font is only read; only the outline ends up in the SVG.
"""

from __future__ import annotations

import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

INK = "#1b2250"
ACCENT = "#ff7a85"
SIZE = 64
LETTER = "л"
LETTER_HEIGHT = 34  # of the 64 box


def bulgarian_glyph(path: Path, text: str) -> str:
    blob = hb.Blob.from_file_path(str(path))
    font = hb.Font(hb.Face(blob))
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.direction, buffer.script, buffer.language = "ltr", "Cyrl", "bg"
    hb.shape(font, buffer, {})
    return TTFont(path).getGlyphName(buffer.glyph_infos[0].codepoint)


def main(font_path: Path, out_path: Path) -> None:
    ttfont = TTFont(font_path)
    name = bulgarian_glyph(font_path, LETTER)
    glyphs = ttfont.getGlyphSet()
    bounds = BoundsPen(glyphs)
    glyphs[name].draw(bounds)
    x0, y0, x1, y1 = bounds.bounds
    scale = LETTER_HEIGHT / (y1 - y0)
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)
    # Font units point up, SVG points down: flip, then centre the letter in the box.
    tx = (SIZE - (x1 - x0) * scale) / 2 - x0 * scale
    ty = (SIZE + LETTER_HEIGHT) / 2 + y0 * scale
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
        f'<rect width="{SIZE}" height="{SIZE}" rx="14" fill="{INK}"/>'
        f'<path fill="{ACCENT}" transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f} {-scale:.5f})" d="{pen.getCommands()}"/>'
        "</svg>\n"
    )
    out_path.write_text(svg, encoding="utf-8")
    print(f"glyph {name!r} -> {out_path} ({len(svg)} bytes)")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
