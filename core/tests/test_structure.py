"""GSUB structure after conversion."""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from fontTools.ttLib import TTFont

from conftest import MONTSERRAT, converted_bytes, original_bytes
from langbg import analyze, convert, load_font
from langbg.gsub import LANGSYS_MISMATCH, free_stylistic_set

TARGETS = ("cyrl", "DFLT")


def load(data: bytes) -> TTFont:
    return TTFont(BytesIO(data))


def langsys_map(font):
    """{(script, langsys tag or None): LangSys}"""
    out = {}
    for s in font["GSUB"].table.ScriptList.ScriptRecord:
        if s.Script.DefaultLangSys is not None:
            out[(s.ScriptTag, None)] = s.Script.DefaultLangSys
        for r in s.Script.LangSysRecord:
            out[(s.ScriptTag, r.LangSysTag)] = r.LangSys
    return out


def resolved(font, ls):
    """LangSys as a sorted list of (tag, lookups): independent of feature indices."""
    feats = font["GSUB"].table.FeatureList.FeatureRecord
    idx = list(ls.FeatureIndex) + ([ls.ReqFeatureIndex] if ls.ReqFeatureIndex != 0xFFFF else [])
    return sorted((feats[i].FeatureTag, tuple(feats[i].Feature.LookupListIndex)) for i in idx)


def bgr_locl_lookups(font):
    feats = font["GSUB"].table.FeatureList.FeatureRecord
    ls = langsys_map(font)[("cyrl", "BGR ")]
    return sorted({li for i in ls.FeatureIndex if feats[i].FeatureTag == "locl" for li in feats[i].Feature.LookupListIndex})


def test_analyze_report(case):
    report = analyze(load_font(original_bytes(case.path)))
    assert report.has_bgr_locl
    assert report.scripts == ["cyrl"]
    assert report.lookups and all(lk.kind == "single" for lk in report.lookups)
    # The core Bulgarian letterforms are reported as affected.
    assert {ord(c) for c in "вгджзийклптцшщъью"} <= set(report.codepoints)
    assert not report.warnings
    assert report.to_dict()["characters"] == report.characters


def test_default_mode_structure(case):
    orig = load(original_bytes(case.path))
    conv = load(converted_bytes(case, "default"))
    feats = conv["GSUB"].table.FeatureList.FeatureRecord
    # FeatureList and LookupList are untouched in default mode.
    assert [r.FeatureTag for r in feats] == [r.FeatureTag for r in orig["GSUB"].table.FeatureList.FeatureRecord]
    assert len(conv["GSUB"].table.LookupList.Lookup) == len(orig["GSUB"].table.LookupList.Lookup)

    bgr_feature = [i for i in langsys_map(orig)[("cyrl", "BGR ")].FeatureIndex if feats[i].FeatureTag == "locl"]
    before, after = langsys_map(orig), langsys_map(conv)
    assert before.keys() == after.keys()
    for key, ls in after.items():
        script, tag = key
        if script in TARGETS and tag is None:
            locls = [i for i in ls.FeatureIndex if feats[i].FeatureTag == "locl"]
            assert locls == bgr_feature
            assert list(ls.FeatureIndex) == sorted(set(ls.FeatureIndex))
            assert resolved(conv, ls) == resolved(orig, before[("cyrl", "BGR ")])
        else:
            assert list(ls.FeatureIndex) == list(before[key].FeatureIndex), key
            assert ls.ReqFeatureIndex == before[key].ReqFeatureIndex


def test_stylistic_mode_structure(case):
    orig = load(original_bytes(case.path))
    conv = load(converted_bytes(case, "stylistic"))
    table = conv["GSUB"].table
    feats = table.FeatureList.FeatureRecord
    tags = [r.FeatureTag for r in feats]
    assert tags == sorted(tags)
    assert len(table.LookupList.Lookup) == len(orig["GSUB"].table.LookupList.Lookup)

    ss = [r for r in feats if r.FeatureTag == "ss20"]
    assert len(ss) == 1
    assert list(ss[0].Feature.LookupListIndex) == bgr_locl_lookups(orig)
    params = ss[0].Feature.FeatureParams
    assert params is not None and params.UINameID >= 256
    name = conv["name"]
    assert name.getName(params.UINameID, 3, 1, 0x409).toUnicode() == "Bulgarian forms"
    assert name.getName(params.UINameID, 3, 1, 0x402).toUnicode() == "Български форми"

    before, after = langsys_map(orig), langsys_map(conv)
    assert before.keys() == after.keys()
    ss_entry = ("ss20", tuple(bgr_locl_lookups(orig)))
    for key, ls in after.items():
        expected = resolved(orig, before[key])
        if key[0] in TARGETS:
            expected = sorted(expected + [ss_entry])
            assert list(ls.FeatureIndex) == sorted(set(ls.FeatureIndex))
        assert resolved(conv, ls) == expected, key


def test_input_font_not_modified(case):
    font = load_font(original_bytes(case.path))
    before = {k: resolved(font, ls) for k, ls in langsys_map(font).items()}
    names_before = [(r.nameID, r.platformID, r.langID, r.toUnicode()) for r in font["name"].names]
    convert(font, mode="stylistic", **case.kwargs)
    convert(font, mode="default", **case.kwargs)
    assert {k: resolved(font, ls) for k, ls in langsys_map(font).items()} == before
    assert [(r.nameID, r.platformID, r.langID, r.toUnicode()) for r in font["name"].names] == names_before


def test_free_stylistic_set():
    def table(*tags):
        recs = [SimpleNamespace(FeatureTag=t) for t in tags]
        return SimpleNamespace(FeatureList=SimpleNamespace(FeatureRecord=recs))

    assert free_stylistic_set(table("ss01", "liga")) == "ss20"
    assert free_stylistic_set(table("ss20", "ss19")) == "ss18"


def test_a_langsys_mismatch_is_reported_as_data():
    font = load_font(original_bytes(MONTSERRAT / "Montserrat-Regular.ttf"))
    feats = font["GSUB"].table.FeatureList.FeatureRecord
    bgr = langsys_map(font)[("cyrl", "BGR ")]
    dropped = next(i for i in bgr.FeatureIndex if feats[i].FeatureTag != "locl")
    bgr.FeatureIndex = [i for i in bgr.FeatureIndex if i != dropped]
    assert analyze(font).warnings == [
        {"code": LANGSYS_MISMATCH, "script": "cyrl", "only_bgr": [], "only_default": [feats[dropped].FeatureTag]}
    ]
