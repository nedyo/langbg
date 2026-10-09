from __future__ import annotations

import pytest

from langbg_catalog import scan
from langbg_catalog.gfonts import load_families


@pytest.fixture
def scans(cache):
    families, _ = load_families(cache)
    return {m.directory: scan.scan_family(cache, m) for m in families}


def test_every_kind_of_family_gets_its_status(scans):
    assert {k: v.status for k, v in scans.items()} == {
        "montserrat": scan.CONVERT,
        "montserratvf": scan.CONVERT,
        "ibmplexsans": scan.NATIVE,  # ss06 already gives the Bulgarian forms
        "reservedmont": scan.CONVERT,  # a reserved name is recorded, it changes nothing
        "ptsans": scan.NO_BGR,
        "mixed": scan.PARTIAL,
        "latinonly": scan.CONVERT,  # scan_family does not look at subsets: select() does
    }


def test_native_wins_over_a_reserved_name(scans):
    plex = scans["ibmplexsans"]
    assert plex.native_set == "ss06"
    assert plex.reserved == ["Plex"]  # still reported


def test_a_reserved_name_is_recorded_and_is_no_obstacle(scans):
    family = scans["reservedmont"]
    assert family.reserved == ["Montserrat"] and family.status == scan.CONVERT
    assert scans["montserrat"].reserved == []


def test_partial_says_how_many_files(scans):
    assert scans["mixed"].note == "Bulgarian locl in 1 of 2 files"


def test_static_family_details(scans):
    family = scans["montserrat"]
    assert family.family_name == "Montserrat"
    assert family.styles == ["Regular", "Italic"]
    assert "д" in family.letters and "ж" in family.letters
    assert [c for c in family.letters] == sorted(family.letters)  # by code point
    assert family.original_bytes == sum(f.size for f in family.files) > 100_000


def test_a_combining_mark_is_not_a_letter_of_the_grid(scans):
    family = scans["montserrat"]
    family.files[0].report["codepoints"].append(0x0306)  # as Source Sans 3 reports it
    assert 0x0306 in family.codepoints and "̆" not in family.letters


@pytest.mark.parametrize("extra", ["ы", "Ы", "љ", "ӥ", "і", "…", "ˊ", "ꚜ", "𞀲"])
def test_only_letters_of_the_bulgarian_alphabet_are_listed(scans, extra):
    family = scans["montserrat"]
    family.files[0].report["codepoints"].append(ord(extra))  # Akt's BGR locl also changes ы
    assert ord(extra) in family.codepoints and extra not in family.letters


def test_the_listed_letters_are_the_30_and_i_grave(scans):
    family = scans["montserrat"]
    every = "абвгдежзийклмнопрстуфхцчшщъьюяѝ"
    family.files[0].report["codepoints"] = [ord(c) for c in every + every.upper()]
    assert len(set(family.letters)) == 62 and set(family.letters) == set(every + every.upper())


def test_variable_family_is_one_style_per_file(scans):
    assert scans["montserratvf"].styles == ["Regular"]
    assert scans["montserratvf"].files[0].report["is_variable"]


def test_input_hash_follows_the_inputs(cache, scans):
    before = scans["montserrat"].input_hash
    (cache / "ofl" / "montserrat" / "OFL.txt").write_text("changed", encoding="utf-8")
    meta = next(m for m in load_families(cache)[0] if m.directory == "montserrat")
    assert scan.scan_family(cache, meta).input_hash != before
    assert scan.scan_family(cache, meta).input_hash == scan.scan_family(cache, meta).input_hash


def test_a_missing_or_broken_file_is_an_error_not_a_crash(cache):
    (cache / "ofl" / "montserrat" / "Montserrat-Italic.ttf").write_bytes(b"not a font")
    (cache / "ofl" / "ptsans" / "PT_Sans-Web-Regular.ttf").unlink()
    families, _ = load_families(cache)
    by = {m.directory: scan.scan_family(cache, m) for m in families}
    assert by["montserrat"].status == scan.ERROR and "Montserrat-Italic.ttf" in by["montserrat"].note
    assert by["ptsans"].status == scan.ERROR and "cannot read" in by["ptsans"].note
