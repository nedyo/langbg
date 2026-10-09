"""Fonts that must not be converted, and invalid input."""

from __future__ import annotations

import pytest

from conftest import MONTSERRAT, PTSANS, original_bytes
from langbg import (
    AlreadyConverted,
    InvalidFamilyName,
    NoBgrForms,
    UnsupportedFont,
    analyze,
    convert,
    load_font,
    save_font,
)


def test_no_bgr_locl_analyze():
    report = analyze(load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf")))
    assert report.has_bgr_locl is False
    assert report.lookups == [] and report.codepoints == []
    assert report.family == "PT Sans"


@pytest.mark.parametrize("mode", ["default", "stylistic"])
def test_no_bgr_locl_convert_raises(mode):
    with pytest.raises(NoBgrForms) as exc:
        convert(load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf")), mode=mode)
    assert exc.value.code == "no_bgr_forms"


def test_already_converted():
    out, _ = convert(load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf")))
    again = load_font(save_font(out))
    assert analyze(again).already_converted
    with pytest.raises(AlreadyConverted):
        convert(again, mode="stylistic")


def test_invalid_names_and_mode():
    font = load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))
    with pytest.raises(InvalidFamilyName):
        convert(font, family_name="montserrat")
    with pytest.raises(InvalidFamilyName):
        convert(font, family_name="   ")
    with pytest.raises(InvalidFamilyName):
        convert(font, family_suffix="")
    with pytest.raises(InvalidFamilyName):
        convert(font, family_name="()/%")
    with pytest.raises(ValueError):
        convert(font, mode="other")


def test_not_a_font():
    with pytest.raises(UnsupportedFont):
        load_font(b"definitely not a font")
