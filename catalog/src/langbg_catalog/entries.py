"""The records of web/src/data/catalog.json (the type is web/src/lib/catalog.ts)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .build import LICENSE_NAME, PREVIEW_NAME, google_fonts_url, raw_url
from .gfonts import FamilyMeta
from .scan import CONVERT, NATIVE, FamilyScan

SCHEMA = 3
LICENSE = "OFL-1.1"
LICENSE_URL = "https://openfontlicense.org/open-font-license-official-text/"
GOOGLE_FONTS_TREE = "https://github.com/google/fonts/tree/main/ofl/"
GROUPS = {CONVERT: "convert", NATIVE: "native"}


def slugify(name: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-")
    return slug or fallback


def unique_slugs(metas: list[FamilyMeta]) -> dict[str, str]:
    """{directory: slug}. A name that is taken falls back to the folder name, which is unique."""
    slugs: dict[str, str] = {}
    taken: set[str] = set()
    for meta in sorted(metas, key=lambda m: m.directory):
        slug = slugify(meta.name, meta.directory)
        if slug in taken:
            slug = meta.directory
        taken.add(slug)
        slugs[meta.directory] = slug
    return slugs


def _number(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


def _source(family: FamilyScan) -> str:
    return family.meta.repository_url or GOOGLE_FONTS_TREE + family.meta.directory


def entry(
    family: FamilyScan, slug: str, converted_name: str | None, commit: str, base_url: str, on_google_fonts: bool
) -> dict[str, Any]:
    """One catalog record.

    `commit` is the google/fonts commit whose files the addresses point at: one where this family's
    files and license are exactly the ones that were checked. `converted_name` is what the conversion
    check produced for a family of the "convert" group. `on_google_fonts`: fonts.google.com lists the
    family; until it does, the page links only to the source.
    """
    group = GROUPS[family.status]
    if group == "native":
        figma_name = family.family_name
    else:
        if not converted_name:
            raise ValueError(f"{family.meta.directory}: a family of the convert group needs a checked conversion")
        figma_name = converted_name
    downloads = group != "native"
    directory = family.meta.directory
    return {
        "slug": slug,
        "name": family.family_name,
        "group": group,
        "convertedName": figma_name,
        "nativeSet": family.native_set,
        "designer": family.meta.designer or next((f.report["designer"] for f in family.files if f.report and f.report["designer"]), ""),
        "license": LICENSE,
        "licenseUrl": LICENSE_URL,
        "source": _source(family),
        "googleFontsUrl": google_fonts_url(family.meta.name) if on_google_fonts else None,
        "reservedNames": family.reserved,
        "styles": family.styles,
        "axes": [{"tag": tag, "min": _number(low), "max": _number(high)} for tag, low, high in family.meta.axes],
        "letters": family.letters,
        "previewFont": f"{base_url}/{slug}/{PREVIEW_NAME}",
        "files": [{"name": f.ref.filename, "url": raw_url(commit, directory, f.ref.filename)} for f in family.files] if downloads else [],
        "licenseFile": raw_url(commit, directory, LICENSE_NAME) if downloads else None,
    }


def catalog_document(entries: list[dict[str, Any]], commit: str, sample: bool) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "mock": sample,
        "googleFontsCommit": commit,
        "fonts": sorted(entries, key=lambda e: (e["name"].casefold(), e["slug"])),
    }


def dump(document: dict[str, Any]) -> str:
    """Stable text: the same data always gives the same file, so a git diff shows real changes only."""
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def write_if_changed(path: Path, text: str) -> bool:
    if path.is_file() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True
