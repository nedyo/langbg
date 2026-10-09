"""GSUB inspection and re-wiring of the Bulgarian `locl` feature.

Nothing here touches the LookupList: lookups always run in LookupList order, so
pointing other features at the same lookups keeps the font's behaviour intact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fontTools.ttLib.tables import otTables as ot

from .errors import NoFreeStylisticSet, UnsupportedFont
from .report import LookupInfo, StylisticSetInfo

LOCL = "locl"
BGR = "BGR "
TARGET_SCRIPTS = ("cyrl", "DFLT")
NO_FEATURE = 0xFFFF
STYLISTIC_SET_UI_NAMES = {"en": "Bulgarian forms", "bg": "Български форми"}
LANGSYS_MISMATCH = "langsys_mismatch"  # warning: BGR differs from the default LangSys beyond locl

_KINDS = {
    1: "single",
    2: "multiple",
    3: "alternate",
    4: "ligature",
    5: "contextual",
    6: "chained-contextual",
    8: "reverse-chained",
}


@dataclass
class BgrLocl:
    """Where the Bulgarian locl lives: script tag -> feature indices of its BGR locl."""

    by_script: dict[str, list[int]] = field(default_factory=dict)

    @property
    def found(self) -> bool:
        return any(self.by_script.values())

    @property
    def feature_indices(self) -> list[int]:
        return sorted({i for v in self.by_script.values() for i in v})

    def source_for(self, script_tag: str) -> list[int]:
        """BGR locl to use for a target script: its own, else cyrl's, else DFLT's, else any."""
        for tag in (script_tag, "cyrl", "DFLT"):
            if self.by_script.get(tag):
                return self.by_script[tag]
        return self.feature_indices


# --- helpers -----------------------------------------------------------------


def gsub_table(font) -> ot.GSUB | None:
    if "GSUB" not in font:
        return None
    table = font["GSUB"].table
    if table.ScriptList is None or table.FeatureList is None or table.LookupList is None:
        return None
    return table


def _features(table) -> list:
    return table.FeatureList.FeatureRecord


def _all_langsys(script: ot.Script):
    if script.DefaultLangSys is not None:
        yield None, script.DefaultLangSys
    for rec in script.LangSysRecord:
        yield rec.LangSysTag, rec.LangSys


def _langsys_feature_indices(ls: ot.LangSys) -> list[int]:
    out = list(ls.FeatureIndex)
    if ls.ReqFeatureIndex != NO_FEATURE:
        out.append(ls.ReqFeatureIndex)
    return out


def _set_feature_indices(ls: ot.LangSys, indices) -> None:
    ls.FeatureIndex = sorted(set(indices))
    ls.FeatureCount = len(ls.FeatureIndex)


def _lookup_type(lookup) -> int:
    if lookup.LookupType == 7:
        return lookup.SubTable[0].ExtensionLookupType
    return lookup.LookupType


def _subtables(lookup):
    for st in lookup.SubTable:
        yield st.ExtSubTable if lookup.LookupType == 7 else st


def find_bgr_locl(table) -> BgrLocl:
    """Scan every script for `BGR ` LangSys records and collect their `locl` features."""
    result = BgrLocl()
    if table is None:
        return result
    feats = _features(table)
    for srec in table.ScriptList.ScriptRecord:
        for lrec in srec.Script.LangSysRecord:
            if lrec.LangSysTag != BGR:
                continue
            idx = [i for i in _langsys_feature_indices(lrec.LangSys) if feats[i].FeatureTag == LOCL]
            if idx:
                known = result.by_script.get(srec.ScriptTag, [])
                result.by_script[srec.ScriptTag] = sorted(set(known) | set(idx))
    return result


def locl_lookup_indices(table, feature_indices) -> list[int]:
    feats = _features(table)
    return sorted({li for fi in feature_indices for li in feats[fi].Feature.LookupListIndex})


# --- analysis ----------------------------------------------------------------


def _rule_lists(st, lookup_type: int):
    """Yield (rule_count, nested lookup indices) for one contextual subtable."""
    fmt = st.Format
    prefix = "Chain" if lookup_type == 6 else ""
    rules = []
    if fmt == 1:
        for rs in getattr(st, f"{prefix}SubRuleSet", None) or []:
            if rs is not None:
                rules += getattr(rs, f"{prefix}SubRule", None) or []
    elif fmt == 2:
        for cs in getattr(st, f"{prefix}SubClassSet", None) or []:
            if cs is not None:
                rules += getattr(cs, f"{prefix}SubClassRule", None) or []
    elif fmt == 3:
        rules = [st]
    nested = [r.LookupListIndex for rule in rules for r in (rule.SubstLookupRecord or [])]
    return len(rules), nested


def describe_lookups(font, table, lookup_indices) -> list[LookupInfo]:
    lookups = table.LookupList.Lookup
    reverse_cmap: dict[str, list[int]] = {}
    for cp, gname in (font.getBestCmap() or {}).items():
        reverse_cmap.setdefault(gname, []).append(cp)

    def cps(glyphs) -> list[int]:
        return sorted({cp for g in glyphs for cp in reverse_cmap.get(g, [])})

    infos: list[LookupInfo] = []
    seen: set[int] = set()
    queue = [(i, False) for i in lookup_indices]
    while queue:
        index, via_context = queue.pop(0)
        if index in seen:
            continue
        seen.add(index)
        lookup = lookups[index]
        ltype = _lookup_type(lookup)
        info = LookupInfo(index=index, type=ltype, kind=_KINDS.get(ltype, "unknown"), via_context=via_context)
        glyphs: set[str] = set()
        if ltype in (1, 2):
            for st in _subtables(lookup):
                glyphs |= set(st.mapping)
        elif ltype == 3:
            for st in _subtables(lookup):
                glyphs |= set(st.alternates)
        elif ltype == 4:
            for st in _subtables(lookup):
                glyphs |= set(st.ligatures)
        elif ltype in (5, 6):
            count = 0
            for st in _subtables(lookup):
                n, nested = _rule_lists(st, ltype)
                count += n
                queue += [(i, True) for i in nested]
            info.rule_count = count
        elif ltype == 8:
            for st in _subtables(lookup):
                glyphs |= set(st.Coverage.glyphs)
            info.rule_count = sum(1 for _ in _subtables(lookup))
        info.codepoints = cps(glyphs)
        infos.append(info)
    return sorted(infos, key=lambda x: x.index)


def locl_varied_by_feature_variations(table, feature_indices) -> bool:
    fv = getattr(table, "FeatureVariations", None)
    if not fv:
        return False
    wanted = set(feature_indices)
    return any(
        s.FeatureIndex in wanted
        for rec in fv.FeatureVariationRecord
        for s in rec.FeatureTableSubstitution.SubstitutionRecord
    )


def langsys_mismatch_warnings(table, bgr: BgrLocl) -> list[dict[str, Any]]:
    """Warn when BGR differs from the script default in more than `locl`.

    Our conversion only moves `locl`; any other difference means "no language"
    in the converted font is not exactly what "bg" was in the original. Warnings are data
    (a stable `code` and its values); the wording belongs to whoever shows them.
    """
    feats = _features(table)
    warnings = []
    for srec in table.ScriptList.ScriptRecord:
        if srec.ScriptTag not in bgr.by_script:
            continue
        script = srec.Script
        bgr_ls = next((r.LangSys for r in script.LangSysRecord if r.LangSysTag == BGR), None)
        if bgr_ls is None or script.DefaultLangSys is None:
            continue

        def non_locl(ls):
            return {i for i in _langsys_feature_indices(ls) if feats[i].FeatureTag != LOCL}

        a, b = non_locl(script.DefaultLangSys), non_locl(bgr_ls)
        if a != b:
            warnings.append(
                {
                    "code": LANGSYS_MISMATCH,
                    "script": srec.ScriptTag,
                    "only_bgr": sorted({feats[i].FeatureTag for i in b - a}),
                    "only_default": sorted({feats[i].FeatureTag for i in a - b}),
                }
            )
    return warnings


def stylistic_set_names(font, table) -> dict[str, str | None]:
    """Every ssXX tag in the font -> its UI name from FeatureParams (None if it has none)."""
    names: dict[str, str | None] = {}
    if table is None:
        return names
    for record in _features(table):
        tag = record.FeatureTag
        if not _is_stylistic_tag(tag):
            continue
        name_id = getattr(record.Feature.FeatureParams, "UINameID", None)
        ui_name = font["name"].getDebugName(name_id) if name_id and "name" in font else None
        names[tag] = names.get(tag) or ui_name
    return dict(sorted(names.items()))


def _is_stylistic_tag(tag: str) -> bool:
    return len(tag) == 4 and tag.startswith("ss") and tag[2:].isdigit()


def _single_substitutions(table, lookup_indices) -> list[dict[str, str]] | None:
    """The glyph mappings of the given lookups, in lookup order; None unless all are type 1 (single)."""
    maps: list[dict[str, str]] = []
    for index in sorted(set(lookup_indices)):
        lookup = table.LookupList.Lookup[index]
        if _lookup_type(lookup) != 1:
            return None
        merged: dict[str, str] = {}
        for subtable in _subtables(lookup):
            for glyph, replacement in subtable.mapping.items():
                merged.setdefault(glyph, replacement)  # the first subtable that covers a glyph wins
        maps.append(merged)
    return maps


def _run_substitutions(maps: list[dict[str, str]], glyph: str) -> str:
    for mapping in maps:
        glyph = mapping.get(glyph, glyph)
    return glyph


def _same_forms(bgr_maps: list[dict[str, str]], table, lookup_indices) -> bool:
    """True when running these single-substitution lookups gives, for every glyph the Bulgarian
    `locl` changes, the very glyph that `locl` gives. Some fonts (IBM Plex: ss06) ship the same
    substitutions again under a stylistic set, as lookups of their own."""
    maps = _single_substitutions(table, lookup_indices)
    if maps is None:
        return False
    domain = {glyph for mapping in bgr_maps for glyph in mapping}
    return bool(domain) and all(_run_substitutions(maps, g) == _run_substitutions(bgr_maps, g) for g in domain)


def bulgarian_stylistic_sets(font, table, bgr: BgrLocl) -> list[StylisticSetInfo]:
    """ssXX features that already give Bulgarian forms to untagged Cyrillic text.

    A feature qualifies when it runs every top-level BGR locl lookup, or when its (single
    substitution) lookups produce the same glyphs for every letter the Bulgarian locl changes;
    and the default LangSys of `cyrl` or `DFLT` enables it, which is what a run without a
    language tag uses. Anything more intricate (contextual or ligature lookups under another
    index) is not recognised: a miss only means we offer a conversion.
    """
    if table is None or not bgr.found:
        return []
    wanted = set(locl_lookup_indices(table, bgr.feature_indices))
    if not wanted:
        return []
    feats = _features(table)
    bgr_maps = _single_substitutions(table, wanted)
    candidates = {
        i
        for i, r in enumerate(feats)
        if _is_stylistic_tag(r.FeatureTag)
        and (
            wanted <= set(r.Feature.LookupListIndex)
            or (bgr_maps is not None and _same_forms(bgr_maps, table, r.Feature.LookupListIndex))
        )
    }
    found: dict[int, StylisticSetInfo] = {}
    for srec in table.ScriptList.ScriptRecord:
        default = srec.Script.DefaultLangSys
        if srec.ScriptTag not in TARGET_SCRIPTS or default is None:
            continue
        for index in sorted(candidates & set(_langsys_feature_indices(default))):
            params = feats[index].Feature.FeatureParams
            name_id = getattr(params, "UINameID", None)
            info = found.setdefault(
                index,
                StylisticSetInfo(
                    tag=feats[index].FeatureTag,
                    feature_index=index,
                    ui_name=font["name"].getDebugName(name_id) if name_id and "name" in font else None,
                ),
            )
            info.scripts.append(srec.ScriptTag)
    for info in found.values():
        info.scripts.sort()
    return sorted(found.values(), key=lambda i: (i.tag, i.feature_index))


# --- mode "default" ----------------------------------------------------------


def _target_scripts(table) -> list:
    targets = [s for s in table.ScriptList.ScriptRecord if s.ScriptTag in TARGET_SCRIPTS]
    if not targets:
        raise UnsupportedFont(
            "The font has no 'cyrl' or 'DFLT' script in GSUB, so there is no default "
            "language system that Cyrillic text would use.",
        )
    return targets


def apply_default(table, bgr: BgrLocl) -> None:
    """Make the BGR locl the default-LangSys locl for `cyrl` and `DFLT`."""
    feats = _features(table)
    for srec in _target_scripts(table):
        script = srec.Script
        source = bgr.source_for(srec.ScriptTag)
        default = script.DefaultLangSys
        if default is None:
            # A script without a default LangSys gives no features at all to
            # untagged text; use the BGR LangSys wholesale (that *is* "bg").
            own = next((r.LangSys for r in script.LangSysRecord if r.LangSysTag == BGR), None)
            default = ot.LangSys()
            default.LookupOrder = None
            if own is not None:
                default.ReqFeatureIndex = own.ReqFeatureIndex
                _set_feature_indices(default, own.FeatureIndex)
            else:
                default.ReqFeatureIndex = NO_FEATURE
                _set_feature_indices(default, source)
            script.DefaultLangSys = default
            continue
        if default.ReqFeatureIndex != NO_FEATURE and feats[default.ReqFeatureIndex].FeatureTag == LOCL:
            default.ReqFeatureIndex = NO_FEATURE
        keep = [i for i in default.FeatureIndex if feats[i].FeatureTag != LOCL]
        _set_feature_indices(default, keep + list(source))


# --- mode "stylistic" --------------------------------------------------------


def free_stylistic_set(table) -> str:
    used = {r.FeatureTag for r in _features(table)}
    for n in range(20, 0, -1):
        tag = f"ss{n:02d}"
        if tag not in used:
            return tag
    raise NoFreeStylisticSet("All stylistic sets ss01-ss20 are already used by this font.")


def _all_langsys_objects(table):
    seen = set()
    for srec in table.ScriptList.ScriptRecord:
        for _, ls in _all_langsys(srec.Script):
            if id(ls) not in seen:
                seen.add(id(ls))
                yield ls


def insert_feature(table, record: ot.FeatureRecord) -> int:
    """Insert a FeatureRecord keeping FeatureList sorted by tag; remap every index."""
    feats = _features(table)
    pos = len(feats)
    for i, r in enumerate(feats):
        if r.FeatureTag > record.FeatureTag:
            pos = i
            break

    def shift(i: int) -> int:
        return i + 1 if i >= pos else i

    for ls in _all_langsys_objects(table):
        ls.FeatureIndex = [shift(i) for i in ls.FeatureIndex]
        if ls.ReqFeatureIndex != NO_FEATURE:
            ls.ReqFeatureIndex = shift(ls.ReqFeatureIndex)
    fv = getattr(table, "FeatureVariations", None)
    if fv:
        for rec in fv.FeatureVariationRecord:
            for s in rec.FeatureTableSubstitution.SubstitutionRecord:
                s.FeatureIndex = shift(s.FeatureIndex)
    feats.insert(pos, record)
    table.FeatureList.FeatureCount = len(feats)
    return pos


def add_ui_name(font) -> int:
    """Add the stylistic-set UI name (en + bg) with a new name ID >= 256."""
    name = font["name"]
    name_id = name._findUnusedNameID(minNameID=256)
    name.setName(STYLISTIC_SET_UI_NAMES["en"], name_id, 3, 1, 0x409)
    name.setName(STYLISTIC_SET_UI_NAMES["bg"], name_id, 3, 1, 0x402)
    if any(r.platformID == 1 for r in name.names):
        name.setName(STYLISTIC_SET_UI_NAMES["en"], name_id, 1, 0, 0)
    return name_id


def apply_stylistic(font, table, bgr: BgrLocl) -> tuple[str, int]:
    """Expose the BGR locl lookups as a new stylistic set under `cyrl` and `DFLT`."""
    targets = _target_scripts(table)
    tag = free_stylistic_set(table)
    name_id = add_ui_name(font)
    feats = _features(table)

    # One new feature per distinct source (normally exactly one). Sources are kept
    # as FeatureRecord objects because indices shift with every insertion.
    sources: dict[tuple[int, ...], list] = {}
    for srec in targets:
        sources.setdefault(tuple(bgr.source_for(srec.ScriptTag)), []).append(srec)
    groups = [([feats[i] for i in source], recs) for source, recs in sources.items()]

    for source_records, script_recs in groups:
        src = [i for i, r in enumerate(feats) if any(r is s for s in source_records)]
        feature = ot.Feature()
        params = ot.FeatureParamsStylisticSet()
        params.Version = 0
        params.UINameID = name_id
        feature.FeatureParams = params
        feature.LookupListIndex = locl_lookup_indices(table, src)
        feature.LookupCount = len(feature.LookupListIndex)
        record = ot.FeatureRecord()
        record.FeatureTag = tag
        record.Feature = feature

        new_index = insert_feature(table, record)
        src = [i + 1 if i >= new_index else i for i in src]
        _carry_feature_variations(table, src, new_index)

        for srec in script_recs:
            for _, ls in _all_langsys(srec.Script):
                _set_feature_indices(ls, list(ls.FeatureIndex) + [new_index])
    return tag, name_id


def _carry_feature_variations(table, src: list[int], new_index: int) -> None:
    """Where FeatureVariations swap a BGR locl, swap the new feature the same way."""
    fv = getattr(table, "FeatureVariations", None)
    if not fv:
        return
    feats = _features(table)
    wanted = set(src)
    for rec in fv.FeatureVariationRecord:
        fts = rec.FeatureTableSubstitution
        subs = {s.FeatureIndex: s.Feature for s in fts.SubstitutionRecord}
        if not wanted & subs.keys():
            continue
        lookups = sorted(
            {
                li
                for fi in src
                for li in (subs[fi] if fi in subs else feats[fi].Feature).LookupListIndex
            }
        )
        alt = ot.Feature()
        alt.FeatureParams = None
        alt.LookupListIndex = lookups
        alt.LookupCount = len(lookups)
        srec = ot.FeatureTableSubstitutionRecord()
        srec.FeatureIndex = new_index
        srec.Feature = alt
        fts.SubstitutionRecord.append(srec)
        fts.SubstitutionRecord.sort(key=lambda s: s.FeatureIndex)
        fts.SubstitutionCount = len(fts.SubstitutionRecord)
