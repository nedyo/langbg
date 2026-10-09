"""Family, PostScript, fvar instance and CFF names."""

from __future__ import annotations

from io import BytesIO

import pytest
from fontTools.ttLib import TTFont

from conftest import MONTSERRAT, PLEX, converted_bytes, original_bytes
from langbg import convert, load_font, naming, save_font
from langbg.naming import PS_NAME_MAX, VERSION_MARKER, ps_sanitize

PS_ALLOWED = {chr(c) for c in range(33, 127)} - set("[](){}<>/%")


def names(font, name_id):
    return [r.toUnicode() for r in font["name"].names if r.nameID == name_id]


def one(font, name_id):
    return font["name"].getDebugName(name_id)


def convert_bytes(path, **kwargs) -> TTFont:
    out, _ = convert(load_font(original_bytes(path)), **kwargs)
    return TTFont(BytesIO(save_font(out)))


def assert_valid_ps(name):
    assert name and len(name) <= PS_NAME_MAX
    assert set(name) <= PS_ALLOWED, name


@pytest.mark.parametrize("mode", ["default", "stylistic"])
def test_static_names(mode):
    case_path = MONTSERRAT / "Montserrat-Regular.ttf"
    orig = TTFont(case_path)
    f = convert_bytes(case_path, mode=mode)
    assert names(f, 1) == ["Montserrat BG"]
    assert names(f, 2) == ["Regular"]
    assert names(f, 4) == ["Montserrat BG Regular"]
    assert names(f, 6) == ["MontserratBG-Regular"]
    assert names(f, 3) == ["9.000;ULA;MontserratBG-Regular"]
    assert all(n.endswith("; " + VERSION_MARKER) for n in names(f, 5))
    for keep in (0, 2, 13, 14):
        assert names(f, keep) == names(orig, keep), keep


def test_variable_names():
    f = convert_bytes(MONTSERRAT / "Montserrat[wght].ttf")
    assert one(f, 16) == "Montserrat BG"
    assert one(f, 17) == "Thin"
    assert one(f, 1) == "Montserrat BG Thin"
    assert one(f, 4) == "Montserrat BG Thin"
    assert one(f, 6) == "MontserratBG-Thin"
    assert one(f, 25) == "MontserratBG"
    ps_ids = {i.postscriptNameID for i in f["fvar"].instances}
    assert len(ps_ids) == 9
    for nid in ps_ids:
        # Every platform's record (Windows and Mac) is renamed.
        recs = names(f, nid)
        assert len(recs) == 2
        for ps in recs:
            assert ps.startswith("MontserratBG-")
            assert_valid_ps(ps)
    subfamilies = {one(f, i.subfamilyNameID) for i in f["fvar"].instances}
    assert "Bold" in subfamilies and not any("BG" in s for s in subfamilies)


def test_plex_custom_name():
    f = convert_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf", family_name="Kiril Sans")
    assert one(f, 1) == "Kiril Sans"
    assert one(f, 4) == "Kiril Sans Regular"
    assert one(f, 6) == "KirilSans-Regular"
    assert one(f, 25) == "KirilSansRoman"
    assert one(f, 3) == "IBM;KirilSans-Regular;3.201;2024"
    for i in f["fvar"].instances:
        assert one(f, i.postscriptNameID).startswith("KirilSans-")


PLEX_TTF = PLEX / "IBMPlexSans[wdth,wght].ttf"
ATTRIBUTION = "Based on IBM Plex Sans by Mike Abbink, Paul van der Laan, Pieter van Rosmalen, Bulgarian forms enabled via langbg.com"


def test_custom_name_writes_the_attribution_into_name_id_10():
    f = convert_bytes(PLEX_TTF, family_name="Kiril Sans")
    assert names(f, 10) == [ATTRIBUTION]


def test_suffix_name_leaves_the_description_alone():
    f = convert_bytes(MONTSERRAT / "Montserrat-Regular.ttf")
    assert names(f, 10) == []  # the family name already says "Montserrat BG"


def edited_montserrat(edit):
    """A Montserrat whose name table was edited and saved: convert() clones the file's own bytes,
    so an edit made only in memory would never reach the output."""
    font = load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))
    edit(font["name"])
    return load_font(save_font(font))


def test_attribution_without_a_designer():
    font = edited_montserrat(lambda name: setattr(name, "names", [r for r in name.names if r.nameID != 9]))
    out, _ = convert(font, family_name="Balkan Sans")
    f = TTFont(BytesIO(save_font(out)))
    assert names(f, 10) == ["Based on Montserrat, Bulgarian forms enabled via langbg.com"]


def test_attribution_keeps_an_existing_description():
    font = edited_montserrat(lambda name: name.setName("A geometric sans.", 10, 3, 1, 0x409))
    out, _ = convert(font, family_name="Balkan Sans")
    f = TTFont(BytesIO(save_font(out)))
    assert names(f, 10) == ["A geometric sans. Based on Montserrat by Julieta Ulanovsky, Bulgarian forms enabled via langbg.com"]


def test_no_reserved_word_survives_in_any_family_name():
    out, _ = convert(load_font(original_bytes(PLEX_TTF)), family_name="Kiril Sans")
    f = TTFont(BytesIO(save_font(out)))
    leaks = [(r.nameID, r.toUnicode()) for r in f["name"].names if "plex" in r.toUnicode().lower()]
    # Only the license/trademark notices (0, 7, 13, 14) and the attribution in the description (10,
    # OFL FAQ 5.3) may still name the original; PostScript names that no fvar instance uses
    # (IDs >= 256) must not either.
    assert {nid for nid, _ in leaks} <= {0, 7, 10, 13, 14}, leaks
    for i in f["fvar"].instances:
        assert "plex" not in one(f, i.postscriptNameID).lower()


def test_cff_names():
    f = convert_bytes(MONTSERRAT / "Montserrat-Regular.otf")
    cff = f["CFF "].cff
    assert cff.fontNames == ["MontserratBG-Regular"]
    top = cff.topDictIndex[0]
    assert top.FamilyName == "Montserrat BG"
    assert top.FullName == "Montserrat BG Regular"
    assert one(f, 6) == "MontserratBG-Regular"


def test_custom_suffix():
    f = convert_bytes(MONTSERRAT / "Montserrat-Regular.ttf", family_suffix=" Bulgarian")
    assert one(f, 1) == "Montserrat Bulgarian"
    assert one(f, 6) == "MontserratBulgarian-Regular"


def test_cyrillic_family_name():
    f = convert_bytes(MONTSERRAT / "Montserrat[wght].ttf", family_name="Монсерат Щ")
    assert one(f, 16) == "Монсерат Щ"
    assert one(f, 1) == "Монсерат Щ Thin"
    assert one(f, 6) == "MonseratSht-Thin"
    for i in f["fvar"].instances:
        for ps in names(f, i.postscriptNameID):
            assert_valid_ps(ps)


def test_long_name_truncated():
    f = convert_bytes(MONTSERRAT / "Montserrat-Regular.ttf", family_name="A" * 80)
    assert_valid_ps(one(f, 6))


def test_ps_sanitize():
    assert ps_sanitize("Foo (Bar)/Baz-Qux 100%") == "FooBarBazQux100"
    assert ps_sanitize("Жълт") == "Zhalt"


def test_ps_name_valid_for_all_fixtures(case):
    for mode in ("default", "stylistic"):
        f = TTFont(BytesIO(converted_bytes(case, mode)))
        assert_valid_ps(one(f, 6))


@pytest.mark.parametrize(
    "name, cff_family",
    [
        ("Ελληνικά Sans", "Sans"),
        ("日本 Sans", "Sans"),
        ("„Нов“ шрифт №1", "Nov shrift No1"),
        ("Ünïcödé Sans", "Unicode Sans"),
    ],
)
def test_cff_names_are_ascii_whatever_the_custom_name(name, cff_family):
    # CFF strings are at most Latin-1; anything else used to fail when the font was saved.
    f = convert_bytes(MONTSERRAT / "Montserrat-Regular.otf", family_name=name)
    top = f["CFF "].cff.topDictIndex[0]
    assert top.FamilyName == cff_family
    assert top.FullName == f"{cff_family} Regular"
    assert one(f, 1) == name
    assert_valid_ps(one(f, 6))


def test_macintosh_records_are_kept_with_a_cyrillic_custom_name():
    def add_mac_records(name):
        name.setName("Montserrat", 1, 1, 0, 0)
        name.setName("Montserrat Regular", 4, 1, 0, 0)
        name.setName("Old Mac text.", 10, 1, 0, 0)
        name.setName("Юлиета Улановски", 9, 3, 1, 0x409)

    out, _ = convert(edited_montserrat(add_mac_records), family_name="Монсерат")
    f = TTFont(BytesIO(save_font(out)))
    mac = {r.nameID: r.toUnicode() for r in f["name"].names if r.platformID == 1}
    assert mac[1] == "Monserat" and mac[4] == "Monserat Regular"  # Mac Roman cannot hold Cyrillic
    assert mac[10] == "Old Mac text. Based on Montserrat by Yulieta Ulanovski, Bulgarian forms enabled via langbg.com"
    assert f["name"].getName(1, 3, 1, 0x409).toUnicode() == "Монсерат"


def test_fvar_ps_name_ids():
    assert len(naming.fvar_ps_name_ids(load_font(original_bytes(MONTSERRAT / "Montserrat[wght].ttf")))) == 9
    assert naming.fvar_ps_name_ids(load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))) == set()


def test_a_rename_without_the_mark_does_not_claim_a_conversion():
    """The catalog renames previews of unconverted fonts: no version marker, no attribution."""
    font = load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))
    plan = naming.plan_names(font, family_name="Catalog Preview")
    naming.apply_names(font, plan, naming.fvar_ps_name_ids(font), mark=False)
    assert one(font, 1) == "Catalog Preview"
    assert VERSION_MARKER not in one(font, 5) and names(font, 10) == []
    assert not naming.already_converted(font)


# No tooling attribution may reach a font: what ships carries only the font's own names and the langbg.com marker.
TOOLING_WORDS = ("claude", "anthropic", "co-authored-by", "noreply@anthropic.com")


def all_name_text(font: TTFont) -> str:
    text = [r.toUnicode(errors="replace") for r in font["name"].names]
    if "CFF " in font:
        cff = font["CFF "].cff
        text += [str(n) for n in cff.fontNames]
        text += [str(getattr(cff[n], attr, "")) for n in cff.fontNames for attr in ("FullName", "FamilyName", "Notice", "Copyright")]
    return "\n".join(text).casefold()


@pytest.mark.parametrize("custom", [None, "Kiril Sans"])
def test_no_tooling_attribution_in_any_name_record(case, mode, custom):
    kwargs = {**case.kwargs, **({"family_name": custom} if custom else {})}
    out, _ = convert(load_font(original_bytes(case.path)), mode=mode, **kwargs)
    text = all_name_text(TTFont(BytesIO(save_font(out))))
    assert "langbg.com" in text  # the check reads the records the conversion writes
    assert [w for w in TOOLING_WORDS if w in text] == []
