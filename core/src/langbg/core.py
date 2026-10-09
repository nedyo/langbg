"""Public API: analyze() and convert(). Pure functions on TTFont objects."""

from __future__ import annotations

from typing import Literal

from fontTools.misc.timeTools import timestampNow
from fontTools.ttLib import TTFont

from . import gsub, naming
from .errors import AlreadyConverted, NoBgrForms
from .fontio import raw_clone
from .report import OutputInfo, Report

Mode = Literal["default", "stylistic"]
MODES = ("default", "stylistic")


def analyze(font: TTFont, ofl_text: str | None = None) -> Report:
    """Describe the font's Bulgarian `locl` forms. Never modifies the font."""
    table = gsub.gsub_table(font)
    bgr = gsub.find_bgr_locl(table)
    report = Report(
        has_bgr_locl=bgr.found,
        family=naming.current_family(font),
        ps_name=naming.current_ps_name(font),
        is_variable="fvar" in font,
        is_cff="CFF " in font or "CFF2" in font,
        reserved_font_names=naming.reserved_font_names(font, ofl_text),
        designer=naming.designer(font),
        already_converted=naming.already_converted(font),
        stylistic_set_names=gsub.stylistic_set_names(font, table),
    )
    if not bgr.found:
        return report
    report.scripts = sorted(bgr.by_script)
    lookup_indices = gsub.locl_lookup_indices(table, bgr.feature_indices)
    report.lookups = gsub.describe_lookups(font, table, lookup_indices)
    report.codepoints = sorted({cp for info in report.lookups for cp in info.codepoints})
    report.locl_varied_by_feature_variations = gsub.locl_varied_by_feature_variations(
        table, bgr.feature_indices
    )
    report.bulgarian_stylistic_sets = gsub.bulgarian_stylistic_sets(font, table, bgr)
    report.warnings = gsub.langsys_mismatch_warnings(table, bgr)
    return report


def convert(
    font: TTFont,
    mode: Mode = "default",
    family_suffix: str = " BG",
    family_name: str | None = None,
) -> tuple[TTFont, Report]:
    """Return a renamed copy of `font` whose Bulgarian forms work without a language tag.

    The input font is not modified. Raises NoBgrForms, AlreadyConverted,
    InvalidFamilyName, NoFreeStylisticSet, UnsupportedFont. A Reserved Font Name never stops a
    conversion: `analyze()` only reports it.
    """
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
    report = analyze(font)
    if not report.has_bgr_locl:
        raise NoBgrForms(
            "This font has no Bulgarian forms (no 'locl' feature for the BGR language "
            "system). Nothing was changed.",
            family=report.family,
        )
    if report.already_converted:
        raise AlreadyConverted("This font was already converted by langBG.", family=report.family)

    plan = naming.plan_names(font, family_suffix, family_name)

    # Read from the input: decompiling fvar in the copy would recompile it on save.
    fvar_ps_ids = naming.fvar_ps_name_ids(font)
    out = raw_clone(font)
    table = gsub.gsub_table(out)
    bgr = gsub.find_bgr_locl(table)
    stylistic_set = name_id = None
    if mode == "default":
        gsub.apply_default(table, bgr)
    else:
        stylistic_set, name_id = gsub.apply_stylistic(out, table, bgr)

    ps_name = naming.apply_names(out, plan, fvar_ps_ids)
    naming.apply_cff_names(out, plan, ps_name)
    out["head"].modified = timestampNow()
    if "DSIG" in out:
        del out["DSIG"]

    report.output = OutputInfo(
        mode=mode,
        family=plan.new_family,
        ps_name=ps_name,
        stylistic_set=stylistic_set,
        stylistic_set_name_id=name_id,
    )
    return out, report
