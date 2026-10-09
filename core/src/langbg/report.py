"""Analysis/conversion report. Plain dataclasses; `to_dict()` is JSON-ready."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class LookupInfo:
    index: int
    type: int  # real GSUB lookup type (Extension lookups are unwrapped)
    kind: str  # "single", "multiple", "alternate", "ligature", "contextual", ...
    codepoints: list[int] = field(default_factory=list)
    rule_count: int | None = None  # for contextual lookups
    via_context: bool = False  # only reached through a contextual lookup


@dataclass
class StylisticSetInfo:
    """An existing ssXX feature that already runs the Bulgarian `locl` lookups."""

    tag: str  # "ss02"
    feature_index: int
    ui_name: str | None  # FeatureParams UI name, e.g. "Bulgarian forms"
    scripts: list[str] = field(default_factory=list)  # "cyrl"/"DFLT" whose default LangSys enables it


@dataclass
class OutputInfo:
    mode: str
    family: str
    ps_name: str
    stylistic_set: str | None = None
    stylistic_set_name_id: int | None = None


@dataclass
class Report:
    has_bgr_locl: bool
    family: str
    ps_name: str
    scripts: list[str] = field(default_factory=list)
    lookups: list[LookupInfo] = field(default_factory=list)
    codepoints: list[int] = field(default_factory=list)
    is_variable: bool = False
    is_cff: bool = False
    locl_varied_by_feature_variations: bool = False
    # Reserved Font Names, from name IDs 0/13/14 and the license text. Information only.
    reserved_font_names: list[str] = field(default_factory=list)
    designer: str | None = None  # name ID 9
    already_converted: bool = False
    # Every ssXX tag in the font -> its UI name (None when it has none). Most of these do
    # NOT give Bulgarian forms; see `bulgarian_stylistic_sets` for the ones that do.
    stylistic_set_names: dict[str, str | None] = field(default_factory=dict)
    # Non-empty: the font already works in Figma through these stylistic sets.
    bulgarian_stylistic_sets: list[StylisticSetInfo] = field(default_factory=list)
    # {"code": "langsys_mismatch", "script", "only_bgr", "only_default"}: data, worded by the caller.
    warnings: list[dict[str, Any]] = field(default_factory=list)
    output: OutputInfo | None = None

    @property
    def characters(self) -> str:
        return "".join(chr(cp) for cp in self.codepoints)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["characters"] = self.characters
        return d
