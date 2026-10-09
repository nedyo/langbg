"""Loading and saving fonts from/to bytes, without touching anything we did not change."""

from __future__ import annotations

from io import BytesIO

from fontTools.ttLib import TTFont, TTLibError
from fontTools.ttLib.sfnt import SFNTWriter

from .errors import UnsupportedFont


def load_font(data: bytes) -> TTFont:
    """Load TTF/OTF (and WOFF; WOFF2 if brotli is available) from bytes."""
    try:
        return TTFont(BytesIO(data), recalcBBoxes=False, recalcTimestamp=False)
    except TTLibError as e:
        raise UnsupportedFont(f"Cannot read font: {e}") from e
    except ImportError as e:  # WOFF2 without brotli
        raise UnsupportedFont(f"Cannot read font: {e}") from e


def save_font(font: TTFont) -> bytes:
    """Serialize as plain sfnt (TTF/OTF), never recalculating bboxes or timestamps."""
    font.flavor = None
    font.flavorData = None
    font.recalcBBoxes = False
    font.recalcTimestamp = False
    buf = BytesIO()
    font.save(buf, reorderTables=False)
    return buf.getvalue()


def font_extension(font: TTFont) -> str:
    return ".otf" if ("CFF " in font or "CFF2" in font) else ".ttf"


def raw_clone(font: TTFont) -> TTFont:
    """Return an independent copy built from the font's original table bytes.

    Tables that were decompiled only for reading (cmap, fvar, ...) are not
    recompiled, so everything we do not modify stays byte-identical.
    """
    if font.reader is None:
        buf = BytesIO()
        flags = (font.recalcBBoxes, font.recalcTimestamp)
        font.recalcBBoxes = font.recalcTimestamp = False
        try:
            font.save(buf, reorderTables=False)
        finally:
            font.recalcBBoxes, font.recalcTimestamp = flags
        buf.seek(0)
        return TTFont(buf, recalcBBoxes=False, recalcTimestamp=False)

    tags = sorted(t for t in font.reader.keys() if t != "GlyphOrder")
    buf = BytesIO()
    writer = SFNTWriter(buf, len(tags), font.reader.sfntVersion)
    for tag in tags:
        writer[tag] = font.reader[tag]
    writer.close()
    buf.seek(0)
    return TTFont(buf, recalcBBoxes=False, recalcTimestamp=False)
