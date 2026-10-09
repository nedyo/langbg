"""What the pipeline does with a family: prove that it converts, and cut its preview.

Nothing converted is kept or published. The catalog stores addresses of the original files in
google/fonts; the visitor's browser fetches them and converts them with the same core. Converting
here is the gate: a family reaches the catalog only if its conversion works, so the button is never
shown for a font that would fail.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

from langbg.bytes_api import convert_bytes

from . import scan as scanning
from .gfonts import FamilyMeta
from .preview import preview_codepoints, shows_difference, subset_preview, verify_preview
from .verify import verify

RAW_BASE = "https://raw.githubusercontent.com/google/fonts"
GOOGLE_FONTS_SPECIMEN = "https://fonts.google.com/specimen/"
PREVIEW_NAME = "preview.woff2"
LICENSE_NAME = "OFL.txt"
DEFAULT_SUFFIX = " BG"
# What the family is called inside the preview file of a font whose license reserves a name. Nobody
# sees it (the page names the font by its own CSS name), and it carries no reserved word.
PREVIEW_FAMILY = "Catalog Preview"


def raw_url(commit: str, directory: str, filename: str) -> str:
    """An address that always gives these bytes: a commit of google/fonts, not a branch. Brackets and
    commas of variable font file names are percent-encoded."""
    return f"{RAW_BASE}/{commit}/ofl/{directory}/{quote(filename, safe='')}"


def google_fonts_url(name: str) -> str:
    return GOOGLE_FONTS_SPECIMEN + quote(name).replace("%20", "+")


def preview_choice(meta: FamilyMeta) -> str:
    """The file shown on the site: upright, as close to weight 400 as the family gets."""
    upright = [f for f in meta.files if f.style == "normal"] or list(meta.files)
    return min(upright, key=lambda f: (abs(f.weight - 400), f.filename)).filename


@dataclass
class Built:
    """The outcome of the conversion check of a family."""

    problems: list[str] = field(default_factory=list)
    converted_name: str = ""
    fonts: list[str] = field(default_factory=list)  # the file names a visitor's ZIP will have

    @property
    def ok(self) -> bool:
        return not self.problems


def check_conversion(family: scanning.FamilyScan, cache: Path) -> Built:
    """Convert every file the way the visitor's browser will (suffix " BG") and verify each result.
    Nothing is written. A reserved font name changes nothing here: it is only shown on the page."""
    built = Built()
    source = cache / "ofl" / family.meta.directory
    families: set[str] = set()
    names: list[str] = []
    for file in family.files:
        original = (source / file.ref.filename).read_bytes()
        result, data = convert_bytes(original, file.ref.filename, "default", DEFAULT_SUFFIX)
        if not result["ok"] or data is None:
            error = result["error"]
            built.problems.append(f"{file.ref.filename}: {error.get('code')}: {error.get('message')}")
            continue
        suffix = Path(result["file_name"]).suffix
        problems = verify(original, data, suffix, file.report["codepoints"] if file.report else [])
        built.problems += [f"{file.ref.filename}: {p}" for p in problems]
        names.append(result["file_name"])
        families.add(result["report"]["output"]["family"])
    if built.problems:
        return built
    if len(families) != 1:
        built.problems.append(f"the files got different family names: {sorted(families)}")
    elif len(set(names)) != len(names):
        built.problems.append("two files would get the same name in the ZIP")
    else:
        built.converted_name = next(iter(families))
        built.fonts = sorted(names)
    return built


def is_visible(family: scanning.FamilyScan, cache: Path) -> bool:
    """False when the Bulgarian forms of the font look exactly like its default forms: the font has the
    `locl` feature, but converting it would change nothing anyone can see."""
    name = preview_choice(family.meta)
    original = (cache / "ofl" / family.meta.directory / name).read_bytes()
    return shows_difference(original, preview_codepoints(family.codepoints, family.family_name))


@dataclass
class Preview:
    data: bytes = b""
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def make_preview(family: scanning.FamilyScan, cache: Path) -> Preview:
    """The preview font of a family: the original, cut down, and checked against the original.
    A font whose license reserves a name is renamed inside the file (see preview.py)."""
    name = preview_choice(family.meta)
    original = (cache / "ofl" / family.meta.directory / name).read_bytes()
    codepoints = preview_codepoints(family.codepoints, family.family_name)
    rename = PREVIEW_FAMILY if family.reserved else None
    preview = Preview()
    try:
        preview.data = subset_preview(original, codepoints, rename)
        preview.problems = [
            f"{name}: {p}" for p in verify_preview(original, preview.data, codepoints, family.native_set)
        ]
    except Exception as e:  # noqa: BLE001 - one font that cannot be cut must not stop 300 families
        preview.problems = [f"{name}: could not cut the preview: {type(e).__name__}: {e}"]
    return preview
