"""Reserved Font Name detection. It is information only: it never stops a conversion or changes a name."""

from __future__ import annotations

import pytest

from conftest import MONTSERRAT, PLEX, PTSANS, original_bytes
from langbg import analyze, convert, load_font
from langbg.naming import parse_reserved_font_names


def read(path) -> str:
    return path.read_text(encoding="utf-8-sig")


def test_parse_from_ofl_files():
    assert parse_reserved_font_names(read(PTSANS / "OFL.txt")) == ["PT Sans", "ParaType"]
    assert parse_reserved_font_names(read(PLEX / "OFL.txt")) == ["Plex"]
    # The OFL body talks about "Reserved Font Name" too; it must not be picked up.
    assert parse_reserved_font_names(read(MONTSERRAT / "OFL.txt")) == []


@pytest.mark.parametrize(
    "text, expected",
    [
        ('Copyright 2010 Adobe, with Reserved Font Name "Source".', ["Source"]),
        ("Copyright 2010 X, with Reserved Font Name 'Foo Sans'.", ["Foo Sans"]),
        ("Copyright 2010 X, with Reserved Font Names “A” and “B C”.", ["A", "B C"]),
        ("Copyright 2010 X, with Reserved Font Name Montserrat.", ["Montserrat"]),
        ("Copyright 2010 X. All rights reserved.", []),
        # Real OFL.txt files (google/fonts): a comma or semicolon after the name is not part of it.
        ("Copyright 2010 X, with Reserved Font Names Jeju Hallasan, Jeju Myeongjo.", ["Jeju Hallasan", "Jeju Myeongjo"]),
        ("Copyright 2010 X, with Reserved Font Name Foo; Bar.", ["Foo", "Bar"]),
    ],
)
def test_parse_variants(text, expected):
    assert parse_reserved_font_names(text) == expected


def test_rfn_from_name_table():
    # PT Sans keeps its RFN declaration in name ID 13.
    report = analyze(load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf")))
    assert report.reserved_font_names == ["PT Sans", "PT Serif", "ParaType"]


def plex_font():
    return load_font(original_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf"))


def test_rfn_from_copyright_name_id_0():
    font = load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))
    for rec in font["name"].names:
        if rec.nameID == 0:
            rec.string = 'Copyright 2011 The Montserrat Project Authors, with Reserved Font Name "Montserrat".'
    assert analyze(font).reserved_font_names == ["Montserrat"]


def test_without_a_license_only_the_name_table_counts():
    assert analyze(plex_font()).reserved_font_names == []  # Plex's name table says nothing about Plex
    assert analyze(plex_font(), read(PLEX / "OFL.txt")).reserved_font_names == ["Plex"]


def test_a_name_found_in_several_places_is_listed_once():
    font = load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf"))  # name ID 13 and OFL.txt both reserve "PT Sans"
    assert analyze(font, read(PTSANS / "OFL.txt")).reserved_font_names == ["PT Sans", "PT Serif", "ParaType"]


# --- a reserved name is reported and never in the way ------------------------------------------------


def test_a_font_with_a_reserved_name_converts_with_the_usual_suffix():
    assert analyze(plex_font(), read(PLEX / "OFL.txt")).reserved_font_names == ["Plex"]
    _, report = convert(plex_font())
    assert report.output.family == "IBM Plex Sans BG"  # the reserved word "Plex" is in the name, and that is fine


@pytest.mark.parametrize("name", ["Plex Cyrillic", "PTSans Plus", "Kiril Sans", "Complex Grotesk"])
def test_a_custom_name_is_taken_as_typed_whatever_it_contains(name):
    _, report = convert(plex_font(), family_name=name)
    assert report.output.family == name
