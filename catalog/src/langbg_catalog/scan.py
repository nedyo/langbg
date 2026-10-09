"""Analyse the font files of one family with core and decide what the catalog does with it."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from langbg import analyze, load_font

from .gfonts import FamilyMeta, FontRef, read_license
from .verify import BG_LOWER, BG_UPPER

# The letters the site may list: the 30 of the Bulgarian alphabet and ѝ/Ѝ, in both cases.
BULGARIAN_LETTERS = frozenset(BG_LOWER + BG_UPPER)

# What the scan decides. "convert" and "native" are the two groups of the catalog; the others stay out.
NO_BGR = "no_bgr"  # no cyrl/BGR locl: nothing to do
PARTIAL = "partial"  # only some files have it: a half-converted family would be worse than none
NATIVE = "native"  # a stylistic set already gives the Bulgarian forms: listed, never converted
CONVERT = "convert"
ERROR = "error"


@dataclass
class FileScan:
    ref: FontRef
    size: int = 0
    sha256: str = ""
    error: str | None = None
    report: dict[str, Any] | None = None  # core's Report.to_dict()
    subfamily: str = ""  # name ID 17, else 2
    weight_class: int = 400
    italic: bool = False

    @property
    def has_bgr(self) -> bool:
        return bool(self.report and self.report["has_bgr_locl"])

    @property
    def style_label(self) -> str:
        if self.report and self.report["is_variable"]:
            return "Italic" if self.italic else "Regular"
        return self.subfamily or "Regular"


@dataclass
class FamilyScan:
    meta: FamilyMeta
    status: str
    note: str = ""
    files: list[FileScan] = field(default_factory=list)
    native_set: str | None = None
    reserved: list[str] = field(default_factory=list)  # Reserved Font Names: information only
    license_text: str | None = None

    @property
    def original_bytes(self) -> int:
        return sum(f.size for f in self.files)

    @property
    def family_name(self) -> str:
        """The family name inside the fonts (name ID 16/1), which is what Figma shows."""
        return next((f.report["family"] for f in self.files if f.report), self.meta.name)

    @property
    def codepoints(self) -> list[int]:
        return sorted({cp for f in self.files if f.report for cp in f.report["codepoints"]})

    @property
    def letters(self) -> str:
        """The Bulgarian letters whose form changes, for the site. The BGR `locl` of many fonts also touches
        letters Bulgarian does not have (ы, љ, ӥ), punctuation (…) or a combining mark on its own (U+0306):
        none of that is a Bulgarian form, so none of it is listed."""
        return "".join(chr(cp) for cp in self.codepoints if chr(cp) in BULGARIAN_LETTERS)

    @property
    def styles(self) -> list[str]:
        """Style names, upright before italic and light before heavy. A variable font's weights are its axes."""
        labels: dict[str, None] = {}
        for f in sorted(self.files, key=lambda f: (f.italic, f.weight_class, f.ref.filename)):
            labels.setdefault(f.style_label, None)
        return list(labels)

    @property
    def input_hash(self) -> str:
        """Identifies the exact inputs of a conversion: every font file and the license text."""
        parts = sorted(f"{f.ref.filename}:{f.sha256}" for f in self.files)
        parts.append("OFL:" + hashlib.sha256((self.license_text or "").encode()).hexdigest())
        return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def scan_file(path: Path, ref: FontRef, license_text: str | None) -> FileScan:
    scan = FileScan(ref=ref)
    try:
        data = path.read_bytes()
    except OSError as e:
        scan.error = f"cannot read {ref.filename}: {e.strerror or e}"
        return scan
    scan.size = len(data)
    scan.sha256 = hashlib.sha256(data).hexdigest()
    try:
        font = load_font(data)
        report = analyze(font, license_text)
        scan.report = report.to_dict()
        names = font["name"] if "name" in font else None
        scan.subfamily = (names.getDebugName(17) or names.getDebugName(2) or "") if names else ""
        os2 = font["OS/2"] if "OS/2" in font else None
        scan.weight_class = int(getattr(os2, "usWeightClass", 400) or 400)
        scan.italic = bool(os2 and os2.fsSelection & 1) or bool("head" in font and font["head"].macStyle & 2)
    except Exception as e:  # noqa: BLE001 - one broken file must not stop a scan of 300 families
        scan.error = f"{ref.filename}: {type(e).__name__}: {e}"
        scan.report = None
    return scan


def scan_family(cache: Path, meta: FamilyMeta) -> FamilyScan:
    license_text = read_license(cache, meta.directory)
    family = FamilyScan(meta=meta, status=ERROR, license_text=license_text)
    if not meta.files:
        family.note = "METADATA.pb lists no font files"
        return family
    folder = cache / "ofl" / meta.directory
    family.files = [scan_file(folder / ref.filename, ref, license_text) for ref in meta.files]

    broken = [f.error for f in family.files if f.error]
    if broken:
        family.note = "; ".join(broken[:3])
        return family

    reports = [f.report for f in family.files if f.report]
    family.reserved = list(dict.fromkeys(name for r in reports for name in r["reserved_font_names"]))
    with_bgr = sum(f.has_bgr for f in family.files)
    if with_bgr == 0:
        family.status = NO_BGR
        return family
    if with_bgr < len(family.files):
        family.status = PARTIAL
        family.note = f"Bulgarian locl in {with_bgr} of {len(family.files)} files"
        return family
    if any(r["already_converted"] for r in reports):
        family.note = "already converted by langbg"
        return family

    sets = [{s["tag"] for s in r["bulgarian_stylistic_sets"]} for r in reports]
    common = set.intersection(*sets)
    if common:
        family.status, family.native_set = NATIVE, sorted(common)[0]
    elif any(sets):
        family.status = PARTIAL
        family.note = "a stylistic set with the Bulgarian forms exists in some files only"
    else:
        family.status = CONVERT
    if family.status == CONVERT and license_text is None:
        # The visitor's ZIP must carry the license, and there is none to carry.
        family.status = ERROR
        family.note = "no OFL.txt to put in the ZIP"
    return family
