from __future__ import annotations

from io import BytesIO

import pytest
from fontTools.ttLib import TTFont
from langbg.bytes_api import analyze_bytes, convert_bytes

from conftest import MONTSERRAT, PTSANS
from langbg_catalog import build, scan
from langbg_catalog.gfonts import FamilyMeta, FontRef, load_families
from langbg_catalog.verify import axis_locations, verify


def scanned(cache, directory):
    meta = next(m for m in load_families(cache)[0] if m.directory == directory)
    return scan.scan_family(cache, meta)


# --- the conversion check ----------------------------------------------------------------


def test_a_convert_family_is_proved_with_the_default_suffix(cache):
    built = build.check_conversion(scanned(cache, "montserrat"), cache)
    assert built.ok, built.problems
    assert built.converted_name == "Montserrat BG"
    assert built.fonts == ["MontserratBG-Italic.ttf", "MontserratBG-Regular.ttf"]


def test_a_variable_family_is_proved_too(cache):
    built = build.check_conversion(scanned(cache, "montserratvf"), cache)
    assert built.ok, built.problems
    assert built.fonts == ["MontserratBG[wght].ttf"]


def test_a_reserved_name_does_not_change_how_a_family_is_proved(cache):
    family = scanned(cache, "reservedmont")
    built = build.check_conversion(family, cache)
    assert built.ok, built.problems
    assert built.converted_name == "Montserrat BG"  # the reserved word is in the name, and that is fine


def test_nothing_is_written_by_the_check(cache, tmp_path):
    before = sorted(p for p in cache.rglob("*"))
    build.check_conversion(scanned(cache, "montserrat"), cache)
    assert sorted(p for p in cache.rglob("*")) == before


def test_a_failed_verification_fails_the_family(cache, monkeypatch):
    monkeypatch.setattr(build, "verify", lambda *args: ["the shaping differs"])
    built = build.check_conversion(scanned(cache, "montserrat"), cache)
    assert not built.ok and "the shaping differs" in built.problems[0]


# --- addresses ----------------------------------------------------------------------------


def test_raw_urls_are_pinned_and_encoded():
    sha = "5e8a3ba899557829a76cfdac30fa512bda91d7ca"
    assert build.raw_url(sha, "montserrat", "OFL.txt") == f"https://raw.githubusercontent.com/google/fonts/{sha}/ofl/montserrat/OFL.txt"
    assert build.raw_url(sha, "ibmplexsans", "IBMPlexSans[wdth,wght].ttf").endswith("/ofl/ibmplexsans/IBMPlexSans%5Bwdth%2Cwght%5D.ttf")


def test_google_fonts_links():
    assert build.google_fonts_url("Source Sans 3") == "https://fonts.google.com/specimen/Source+Sans+3"
    assert build.google_fonts_url("Montserrat") == "https://fonts.google.com/specimen/Montserrat"


def test_preview_is_the_upright_file_closest_to_regular():
    def meta(*files):
        return FamilyMeta("x", "X", "", "OFL", "", ("cyrillic",), tuple(FontRef(*f) for f in files))

    assert build.preview_choice(meta(("I.ttf", "italic", 400), ("R.ttf", "normal", 400))) == "R.ttf"
    assert build.preview_choice(meta(("B.ttf", "normal", 700), ("L.ttf", "normal", 300), ("M.ttf", "normal", 500))) == "L.ttf"
    assert build.preview_choice(meta(("I.ttf", "italic", 400))) == "I.ttf"


# --- the previews ------------------------------------------------------------------------


def test_a_preview_is_the_original_cut_down(cache):
    family = scanned(cache, "montserrat")
    preview = build.make_preview(family, cache)
    assert preview.ok, preview.problems
    font = TTFont(BytesIO(preview.data))
    assert font.flavor == "woff2"
    assert font["name"].getDebugName(1) == "Montserrat"  # the original, not a converted copy
    assert font["name"].getDebugName(0) and font["name"].getDebugName(13)  # copyright and license travel with it
    original = (cache / "ofl" / "montserrat" / "Montserrat-Regular.ttf").stat().st_size
    assert len(preview.data) < original / 3
    cmap = font.getBestCmap()
    assert ord("д") in cmap and ord("Ж") in cmap and ord("a") in cmap and ord("日") not in cmap


def test_the_cut_keeps_the_bulgarian_forms(cache):
    from langbg_catalog.preview import to_sfnt
    from langbg_catalog.verify import shape

    family = scanned(cache, "montserrat")
    sfnt = to_sfnt(build.make_preview(family, cache).data)
    text = "жлдвгитк"
    assert shape(sfnt, text, "bg", {}, outlines=True) != shape(sfnt, text, None, {}, outlines=True)
    original = (cache / "ofl" / "montserrat" / "Montserrat-Regular.ttf").read_bytes()
    assert shape(sfnt, text, "bg", {}, outlines=True) == shape(original, text, "bg", {}, outlines=True)


def test_a_variable_preview_stays_variable(cache):
    preview = build.make_preview(scanned(cache, "montserratvf"), cache)
    assert preview.ok, preview.problems
    font = TTFont(BytesIO(preview.data))
    assert "fvar" in font and [a.axisTag for a in font["fvar"].axes] == ["wght"]


def test_the_stylistic_set_of_a_native_font_survives_the_cut(cache):
    family = scanned(cache, "ibmplexsans")
    preview = build.make_preview(family, cache)
    assert preview.ok, preview.problems
    font = TTFont(BytesIO(preview.data))
    tags = {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}
    assert family.native_set in tags


@pytest.mark.parametrize("directory, reserved_word", [("reservedmont", "montserrat"), ("ibmplexsans", "plex")])
def test_a_hosted_preview_does_not_carry_a_reserved_name(cache, directory, reserved_word):
    """We host the preview, so it is renamed inside the file (invisible to anyone: the page uses its own CSS name)."""
    family = scanned(cache, directory)
    assert family.reserved
    preview = build.make_preview(family, cache)
    assert preview.ok, preview.problems
    font = TTFont(BytesIO(preview.data))
    names = {r.nameID: r.toUnicode() for r in font["name"].names if r.platformID == 3}
    assert names[1] == build.PREVIEW_FAMILY
    # Only the legal notices and the attribution may still name the original.
    leaks = [i for i, text in names.items() if reserved_word in text.casefold() and i not in (0, 7, 10, 13, 14)]
    assert leaks == [], leaks


def test_a_preview_of_a_font_without_a_reserved_name_keeps_its_own_name(cache):
    preview = build.make_preview(scanned(cache, "montserrat"), cache)
    assert TTFont(BytesIO(preview.data))["name"].getDebugName(1) == "Montserrat"


def test_an_unreadable_font_fails_the_preview_not_the_run(cache):
    (cache / "ofl" / "montserrat" / "Montserrat-Regular.ttf").write_bytes(b"not a font")
    family = scanned(cache, "montserrat")  # the scan itself reports the broken file
    assert family.status == scan.ERROR


def test_a_broken_cut_is_caught(cache, monkeypatch):
    from langbg_catalog import preview

    monkeypatch.setattr(build, "subset_preview", lambda original, codepoints, rename: preview.subset_preview(PTSANS_BYTES, codepoints, None))
    result = build.make_preview(scanned(cache, "montserrat"), cache)
    assert not result.ok


PTSANS_BYTES = (PTSANS / "PT_Sans-Web-Regular.ttf").read_bytes()


# --- the verification gate -----------------------------------------------------------------


@pytest.fixture(scope="module")
def regular():
    data = (MONTSERRAT / "Montserrat-Regular.ttf").read_bytes()
    result, converted = convert_bytes(data, "Montserrat-Regular.ttf")
    return data, converted, analyze_bytes(data)["report"]["codepoints"]


def test_a_good_conversion_passes(regular):
    original, converted, codepoints = regular
    assert verify(original, converted, ".ttf", codepoints) == []


def test_an_unconverted_font_is_caught(regular):
    original, _, codepoints = regular
    assert verify(original, original, ".ttf", codepoints) == ["shaping differs from the original with lang=bg"]


def test_a_conversion_that_changed_nothing_is_caught():
    pt_sans = (PTSANS / "PT_Sans-Web-Regular.ttf").read_bytes()  # no Bulgarian forms: lang=bg changes nothing
    assert verify(pt_sans, pt_sans, ".ttf", []) == ["the conversion changed nothing for untagged text"]


def test_garbage_is_caught(regular):
    original, _, codepoints = regular
    problems = verify(original, b"definitely not a font", ".ttf", codepoints)
    assert any("OpenType Sanitizer" in p for p in problems) and any("HarfBuzz" in p or "shaping" in p for p in problems)


def test_a_variable_font_is_checked_at_the_ends_of_its_axes():
    data = (MONTSERRAT / "Montserrat[wght].ttf").read_bytes()
    _, converted = convert_bytes(data, "Montserrat[wght].ttf")
    locations = axis_locations(data)
    assert locations[0] == {} and len(locations) >= 2 and all(set(loc) == {"wght"} for loc in locations[1:])
    assert {loc["wght"] for loc in locations[1:]} <= {100.0, 900.0}
    assert verify(data, converted, ".ttf", analyze_bytes(data)["report"]["codepoints"]) == []


# --- what the preview must keep, and when there is nothing to show -----------------------------


def test_letters_without_a_glyph_keep_their_parts():
    from langbg_catalog.preview import preview_codepoints

    # Spectral has no glyph for Ѝ: the shaper builds it from И and a combining grave, which must stay in the cut.
    wanted = preview_codepoints([0x040D, 0x045D])
    assert {0x0418, 0x0438, 0x0300} <= set(wanted)
    assert ord("д") in wanted and ord("Z") in wanted and ord("7") in wanted


def test_the_family_name_is_kept_for_the_card_title():
    from langbg_catalog.preview import preview_codepoints

    # The catalog card draws the family name in the preview font itself.
    assert {ord("Ž"), ord("ő")} <= set(preview_codepoints([], "Žőfia Sans"))
    assert ord("Ž") not in preview_codepoints([])


def test_a_font_whose_bulgarian_forms_look_like_the_default_ones_is_not_visible(cache):
    assert build.is_visible(scanned(cache, "montserrat"), cache)
    assert not build.is_visible(scanned(cache, "ptsans"), cache)  # no Bulgarian forms at all: lang=bg changes nothing


# --- the license travels with every preview ------------------------------------------------------


def test_every_preview_keeps_the_copyright_and_license_names(cache):
    from langbg_catalog.preview import LEGAL_NAME_IDS, legal_names

    seen: set[int] = set()
    for directory in ("montserrat", "montserratvf", "ibmplexsans", "reservedmont"):  # converts, variable, native, renamed
        family = scanned(cache, directory)
        original = TTFont(cache / "ofl" / directory / build.preview_choice(family.meta))
        preview = build.make_preview(family, cache)
        assert preview.ok, preview.problems
        before, after = legal_names(original), legal_names(TTFont(BytesIO(preview.data)))
        assert before, directory  # the fixtures do carry them
        assert after == before, directory  # all of them, byte for byte, in every platform and language
        seen |= {record[0] for record in after}
    assert seen == set(LEGAL_NAME_IDS)  # 0 copyright, 13 license description, 14 license URL


def test_a_cut_that_loses_the_license_names_is_caught(cache, monkeypatch):
    from langbg_catalog import preview

    real = preview._options

    def without_license():
        options = real()
        options.name_IDs = [1, 2, 3, 4, 5, 6]  # the subsetter's own default
        return options

    monkeypatch.setattr(preview, "_options", without_license)
    result = build.make_preview(scanned(cache, "ibmplexsans"), cache)
    assert not result.ok and any("name IDs" in p and "13" in p for p in result.problems), result.problems


def test_a_renamed_preview_does_not_claim_to_be_a_conversion(cache):
    font = TTFont(BytesIO(build.make_preview(scanned(cache, "reservedmont"), cache).data))
    assert "langbg" not in (font["name"].getDebugName(5) or "")
    assert not [r for r in font["name"].names if r.nameID == 10 and "langbg" in r.toUnicode()]
