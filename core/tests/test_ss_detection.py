"""Detecting Bulgarian forms that an existing ssXX feature already exposes."""

from __future__ import annotations

import json

import pytest

from conftest import MONTSERRAT, PLEX, PTSANS, Case, converted_bytes, original_bytes
from langbg import analyze, load_font
from langbg import gsub
from langbg.cli import main

REGULAR = MONTSERRAT / "Montserrat-Regular.ttf"


def montserrat():
    return load_font(original_bytes(REGULAR))


def parts(font):
    """(GSUB table, ss01 FeatureRecord index, BGR locl lookup indices) of a Montserrat font."""
    table = font["GSUB"].table
    feats = table.FeatureList.FeatureRecord
    ss01 = next(i for i, r in enumerate(feats) if r.FeatureTag == "ss01")
    bgr = gsub.find_bgr_locl(table)
    return table, ss01, gsub.locl_lookup_indices(table, bgr.feature_indices)


def default_langsys(table, script_tag):
    return next(s.Script.DefaultLangSys for s in table.ScriptList.ScriptRecord if s.ScriptTag == script_tag)


# IBM Plex ships the Bulgarian forms a second time as a stylistic set of its own (ss06), in a lookup
# that has another index than the locl one but gives the very same glyphs.
OWN_SETS = {"plex-variable": [("ss06", "Bulgarian Cyrillic forms")]}


def sets(report):
    return [(s.tag, s.ui_name) for s in report.bulgarian_stylistic_sets]


def test_originals_report_only_sets_they_really_have(case):
    report = analyze(load_font(original_bytes(case.path)))
    assert report.has_bgr_locl
    assert sets(report) == OWN_SETS.get(case.id, [])


def test_plex_ss06_gives_the_same_glyphs_as_the_bulgarian_locl():
    report = analyze(load_font(original_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf")))
    [ss] = report.bulgarian_stylistic_sets
    assert (ss.tag, ss.scripts) == ("ss06", ["DFLT", "cyrl"])
    assert report.stylistic_set_names["ss06"] == "Bulgarian Cyrillic forms"


def test_a_stylistic_set_with_other_substitutions_does_not_count():
    font = load_font(original_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf"))
    table = font["GSUB"].table
    [ss06] = [r for r in table.FeatureList.FeatureRecord if r.FeatureTag == "ss06"]
    [lookup_index] = ss06.Feature.LookupListIndex
    mapping = table.LookupList.Lookup[lookup_index].SubTable[0].mapping
    mapping["uni0432"] = "uni0433.loclBGR"  # a different Bulgarian form than the locl gives
    assert analyze(font).bulgarian_stylistic_sets == []


def test_montserrat_ss01_is_a_stylistic_set_but_not_a_bulgarian_one():
    # ss01 "Alternate" exists in the font, yet it runs other lookups than the Bulgarian locl.
    font = montserrat()
    report = analyze(font)
    assert report.stylistic_set_names == {"ss01": "Alternate"}
    assert report.bulgarian_stylistic_sets == []
    table, ss01, bgr_lookups = parts(font)
    ss01_lookups = set(table.FeatureList.FeatureRecord[ss01].Feature.LookupListIndex)
    assert not ss01_lookups & set(bgr_lookups)
    assert json.loads(json.dumps(report.to_dict()))["stylistic_set_names"] == {"ss01": "Alternate"}


def test_stylistic_set_names_cover_converted_output():
    report = analyze(load_font(converted_bytes(Case("m", REGULAR), "stylistic")))
    assert report.stylistic_set_names == {"ss01": "Alternate", "ss20": "Bulgarian forms"}


def test_no_stylistic_sets_no_names():
    assert analyze(load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf"))).stylistic_set_names == {}


def test_no_bgr_forms_font_has_none():
    report = analyze(load_font(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf")))
    assert report.bulgarian_stylistic_sets == []


def test_default_mode_output_adds_no_set(case):
    report = analyze(load_font(converted_bytes(case, "default")))
    assert sets(report) == OWN_SETS.get(case.id, [])


def test_stylistic_mode_output_is_detected(case):
    report = analyze(load_font(converted_bytes(case, "stylistic")))
    [ss] = [s for s in report.bulgarian_stylistic_sets if s.tag == "ss20"]
    assert (ss.tag, ss.ui_name, ss.scripts) == ("ss20", "Bulgarian forms", ["DFLT", "cyrl"])
    assert sets(report) == OWN_SETS.get(case.id, []) + [("ss20", "Bulgarian forms")]
    assert report.already_converted

    data = json.loads(json.dumps(report.to_dict()))
    assert "ss20" in [s["tag"] for s in data["bulgarian_stylistic_sets"]]


def test_existing_stylistic_set_pointing_at_bgr_lookups():
    font = montserrat()
    table, ss01, bgr_lookups = parts(font)
    feature = table.FeatureList.FeatureRecord[ss01].Feature
    feature.LookupListIndex = sorted(set(feature.LookupListIndex) | set(bgr_lookups))

    [ss] = analyze(font).bulgarian_stylistic_sets
    assert (ss.tag, ss.feature_index, ss.scripts) == ("ss01", ss01, ["DFLT", "cyrl"])
    assert ss.ui_name == font["name"].getDebugName(feature.FeatureParams.UINameID)
    assert ss.ui_name  # Montserrat names its sets


def test_stylistic_set_not_enabled_for_cyrillic_is_ignored():
    font = montserrat()
    table, ss01, bgr_lookups = parts(font)
    feature = table.FeatureList.FeatureRecord[ss01].Feature
    feature.LookupListIndex = sorted(set(feature.LookupListIndex) | set(bgr_lookups))
    # Leave ss01 in latn only: untagged Cyrillic text would never run it.
    for tag in ("cyrl", "DFLT"):
        ls = default_langsys(table, tag)
        ls.FeatureIndex = [i for i in ls.FeatureIndex if i != ss01]
    assert analyze(font).bulgarian_stylistic_sets == []

    # ...and only one of the two scripts is reported when only one enables it.
    cyrl = default_langsys(table, "cyrl")
    cyrl.FeatureIndex = sorted(cyrl.FeatureIndex + [ss01])
    [ss] = analyze(font).bulgarian_stylistic_sets
    assert ss.scripts == ["cyrl"]


def test_partial_lookup_overlap_is_not_enough():
    font = montserrat()
    table, ss01, bgr_lookups = parts(font)
    feats = table.FeatureList.FeatureRecord
    ss_feature = feats[ss01].Feature
    ss_feature.LookupListIndex = sorted(set(ss_feature.LookupListIndex) | set(bgr_lookups))

    # Give the Bulgarian locl a second lookup the stylistic set does not run.
    extra = next(i for i in range(len(table.LookupList.Lookup)) if i not in ss_feature.LookupListIndex)
    bgr = gsub.find_bgr_locl(table)
    locl = feats[bgr.feature_indices[0]].Feature
    locl.LookupListIndex = sorted(set(locl.LookupListIndex) | {extra})
    assert analyze(font).bulgarian_stylistic_sets == []

    ss_feature.LookupListIndex = sorted(set(ss_feature.LookupListIndex) | {extra})
    assert [s.tag for s in analyze(font).bulgarian_stylistic_sets] == ["ss01"]


def test_non_stylistic_features_do_not_count():
    font = montserrat()
    table, _, bgr_lookups = parts(font)
    feats = table.FeatureList.FeatureRecord
    # Only ss01-ss20 count: another feature that runs the same lookups is not a stylistic set.
    other =next(r for r in feats if r.FeatureTag == "locl" and not set(r.Feature.LookupListIndex) & set(bgr_lookups))
    other.Feature.LookupListIndex = sorted(set(other.Feature.LookupListIndex) | set(bgr_lookups))
    assert analyze(font).bulgarian_stylistic_sets == []


@pytest.mark.parametrize("mode, expected", [("stylistic", True), ("default", False)])
def test_cli_mentions_stylistic_set(tmp_path, capsys, mode, expected):
    path =tmp_path / "MontserratBG-Regular.ttf"
    path.write_bytes(converted_bytes(Case("m", REGULAR), mode))
    assert main(["analyze", str(path)]) == 0
    out = capsys.readouterr().out
    assert ("Already works via stylistic set ss20 (Bulgarian forms) in DFLT, cyrl" in out) is expected
