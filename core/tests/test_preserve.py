"""Only GSUB, name, CFF names, head.modified and DSIG may change."""

from __future__ import annotations

from io import BytesIO

from fontTools.ttLib import TTFont, newTable

from conftest import MONTSERRAT, converted_bytes, original_bytes
from langbg import convert, load_font, save_font

ALLOWED = {"GSUB", "name", "CFF ", "head", "DSIG"}


def test_untouched_tables_are_byte_identical(case, mode):
    orig = TTFont(BytesIO(original_bytes(case.path)))
    conv = TTFont(BytesIO(converted_bytes(case, mode)))
    assert set(conv.reader.keys()) == set(orig.reader.keys()) - {"DSIG"}
    for tag in orig.reader.keys():
        if tag in ALLOWED:
            continue
        assert conv.reader[tag] == orig.reader[tag], tag


def test_head_only_modified_changes(case, mode):
    orig = TTFont(BytesIO(original_bytes(case.path)))["head"]
    conv = TTFont(BytesIO(converted_bytes(case, mode)))["head"]
    skip = {"modified", "checkSumAdjustment"}
    for attr in vars(orig):
        if attr not in skip:
            assert getattr(conv, attr) == getattr(orig, attr), attr
    assert conv.modified >= orig.modified


def test_dsig_dropped():
    font = TTFont(MONTSERRAT / "Montserrat-Regular.ttf")
    dsig = newTable("DSIG")
    dsig.ulVersion, dsig.usFlag, dsig.usNumSigs, dsig.signatureRecords = 1, 0, 0, []
    font["DSIG"] = dsig
    buf = BytesIO()
    font.save(buf)
    out, _ = convert(load_font(buf.getvalue()))
    assert "DSIG" not in TTFont(BytesIO(save_font(out)))
