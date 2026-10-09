"""Shaping equivalence with HarfBuzz: the proof that the conversion works."""

from __future__ import annotations

from io import BytesIO

import pytest
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot

from conftest import BG_TEXT, MONTSERRAT, converted_bytes, original_bytes, shape
from langbg import analyze, convert, load_font, save_font


def gsub_feature_tags(data: bytes) -> list[str]:
    font = TTFont(BytesIO(data))
    return sorted({r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord})


def test_harness_sees_language(case):
    """Sanity: the original font itself shapes differently with and without "bg"."""
    orig = original_bytes(case.path)
    assert shape(orig, lang="bg") != shape(orig)


def test_default_mode_equivalence(case):
    orig = original_bytes(case.path)
    conv = converted_bytes(case, "default")
    for loc in case.locations:
        expected = shape(orig, lang="bg", variations=loc)
        assert shape(conv, variations=loc) == expected, loc
        # Something really changed for untagged text.
        assert shape(conv, variations=loc) != shape(orig, variations=loc), loc
        # Tagged Bulgarian text keeps working.
        assert shape(conv, lang="bg", variations=loc) == expected, loc


def test_stylistic_mode_equivalence(case):
    orig = original_bytes(case.path)
    conv = converted_bytes(case, "stylistic")
    for loc in case.locations:
        assert shape(conv, features={"ss20": True}, variations=loc) == shape(orig, lang="bg", variations=loc), loc
        assert shape(conv, variations=loc) == shape(orig, variations=loc), loc
        assert shape(conv, lang="bg", variations=loc) == shape(orig, lang="bg", variations=loc), loc


def test_other_features_unaffected(case, mode):
    """Every GSUB feature (smcp, c2sc, case, ss01, ...) on top of Bulgarian forms."""
    orig = original_bytes(case.path)
    conv = converted_bytes(case, mode)
    extra = {"ss20": True} if mode == "stylistic" else {}
    tags = [t for t in gsub_feature_tags(orig) if t not in ("locl", "rvrn")]
    assert tags
    mismatches = []
    for loc in case.locations:
        for tag in tags:
            expected = shape(orig, lang="bg", features={tag: True}, variations=loc)
            got = shape(conv, features={tag: True, **extra}, variations=loc)
            if got != expected:
                mismatches.append((tag, loc))
            if mode == "stylistic":
                # Without the toggle, the converted font behaves like the original.
                if shape(conv, features={tag: True}, variations=loc) != shape(
                    orig, features={tag: True}, variations=loc
                ):
                    mismatches.append((tag, loc, "ss20 off"))
    assert not mismatches


def test_smcp_de_el(case, mode):
    orig = original_bytes(case.path)
    if "smcp" not in gsub_feature_tags(orig):
        pytest.skip("font has no smcp")
    conv = converted_bytes(case, mode)
    extra = {"ss20": True} if mode == "stylistic" else {}
    for text in ("дл", "ДЛ"):
        for feat in ("smcp", "c2sc", "case"):
            if feat not in gsub_feature_tags(orig):
                continue
            expected = shape(orig, text, lang="bg", features={feat: True})
            assert shape(conv, text, features={feat: True, **extra}) == expected, (text, feat)


# --- FeatureVariations that swap the BGR locl itself (synthetic) ------------------


def _font_with_varied_locl() -> bytes:
    """Montserrat VF where heavy weights swap the BGR locl for a version with an
    extra lookup (а -> Latin a), as a real variable font might do."""
    font = TTFont(BytesIO(original_bytes(MONTSERRAT / "Montserrat[wght].ttf")))
    table = font["GSUB"].table
    feats = table.FeatureList.FeatureRecord
    bgr_locl = next(
        i
        for s in table.ScriptList.ScriptRecord
        if s.ScriptTag == "cyrl"
        for r in s.Script.LangSysRecord
        if r.LangSysTag == "BGR "
        for i in r.LangSys.FeatureIndex
        if feats[i].FeatureTag == "locl"
    )
    cmap = font.getBestCmap()
    lookup = ot.Lookup()
    lookup.LookupType = 1
    lookup.LookupFlag = 0
    sub = ot.SingleSubst()
    sub.mapping = {cmap[ord("а")]: cmap[ord("a")]}
    lookup.SubTable = [sub]
    lookup.SubTableCount = 1
    table.LookupList.Lookup.append(lookup)
    table.LookupList.LookupCount = len(table.LookupList.Lookup)
    new_lookup = len(table.LookupList.Lookup) - 1

    changed = 0
    for rec in table.FeatureVariations.FeatureVariationRecord:
        conds = rec.ConditionSet.ConditionTable
        if not all(c.FilterRangeMinValue >= 0.72 for c in conds):
            continue
        alt = ot.Feature()
        alt.FeatureParams = None
        alt.LookupListIndex = sorted(feats[bgr_locl].Feature.LookupListIndex + [new_lookup])
        alt.LookupCount = len(alt.LookupListIndex)
        srec = ot.FeatureTableSubstitutionRecord()
        srec.FeatureIndex = bgr_locl
        srec.Feature = alt
        fts = rec.FeatureTableSubstitution
        fts.SubstitutionRecord.append(srec)
        fts.SubstitutionRecord.sort(key=lambda s: s.FeatureIndex)
        fts.SubstitutionCount = len(fts.SubstitutionRecord)
        changed += 1
    assert changed
    buf = BytesIO()
    font.save(buf)
    return buf.getvalue()


@pytest.fixture(scope="module")
def varied_locl_font() -> bytes:
    return _font_with_varied_locl()


def test_synthetic_feature_variations_sanity(varied_locl_font):
    report = analyze(load_font(varied_locl_font))
    assert report.locl_varied_by_feature_variations
    heavy = shape(varied_locl_font, "а", lang="bg", variations={"wght": 800})
    light = shape(varied_locl_font, "а", lang="bg", variations={"wght": 400})
    assert heavy != light


@pytest.mark.parametrize("mode", ["default", "stylistic"])
def test_feature_variations_carried_over(varied_locl_font, mode):
    out, _ = convert(load_font(varied_locl_font), mode=mode)
    conv = save_font(out)
    features = {"ss20": True} if mode == "stylistic" else {}
    for wght in (100, 400, 650, 800, 900):
        loc = {"wght": wght}
        expected = shape(varied_locl_font, BG_TEXT + " а", lang="bg", variations=loc)
        assert shape(conv, BG_TEXT + " а", features=features, variations=loc) == expected, wght


def test_woff_input(tmp_path):
    font = TTFont(MONTSERRAT / "Montserrat-Regular.ttf")
    font.flavor = "woff"
    buf = BytesIO()
    font.save(buf)
    out, _ = convert(load_font(buf.getvalue()))
    data = save_font(out)
    assert data[:4] == b"\x00\x01\x00\x00"
    orig = original_bytes(MONTSERRAT / "Montserrat-Regular.ttf")
    assert shape(data) == shape(orig, lang="bg")
