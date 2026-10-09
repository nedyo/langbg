"""catalog.json is the contract with the site: its records must be exactly web/src/lib/catalog.ts's CatalogFont."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from langbg_catalog import entries, gfonts
from langbg_catalog.gfonts import FamilyMeta
from langbg_catalog.pipeline import Options, run

WEB = Path(__file__).resolve().parents[2] / "web" / "src"


def typescript_fields() -> set[str]:
    source = (WEB / "lib" / "catalog.ts").read_text(encoding="utf-8")
    body = re.search(r"export interface CatalogFont \{(.*?)\n\}", source, re.DOTALL).group(1)
    return set(re.findall(r"^  (\w+)\??:", body, re.MULTILINE))


@pytest.fixture
def published(cache, tmp_path, monkeypatch):
    monkeypatch.setattr(gfonts, "ensure_checkout", lambda cache, update=False: "a" * 40)
    monkeypatch.setattr(gfonts, "fetch_fonts", lambda cache, directories: None)
    out = tmp_path / "out"
    run(Options(cache=cache, assets_dir=out / "catalog", data_file=out / "catalog.json", manifest=out / "m.json", report=out / "r.md"), log=lambda _: None)
    return json.loads((out / "catalog.json").read_text(encoding="utf-8"))


def test_the_typescript_type_is_read_correctly():
    assert {"slug", "name", "group", "convertedName", "files", "licenseFile", "previewFont", "nativeSet", "reservedNames", "googleFontsUrl"} <= typescript_fields()


def test_every_record_has_exactly_the_fields_of_the_type(published):
    assert {f["group"] for f in published["fonts"]} == {"convert", "native"}
    for font in published["fonts"]:
        assert set(font) == typescript_fields(), font["slug"]


def test_the_sample_catalog_has_the_same_fields_and_schema():
    sample = json.loads((WEB / "data" / "catalog.json").read_text(encoding="utf-8"))
    assert sample["schema"] == entries.SCHEMA
    for font in sample["fonts"]:
        assert set(font) == typescript_fields(), font["slug"]


def test_the_groups_differ_where_they_should(published):
    for font in published["fonts"]:
        native = font["group"] == "native"
        assert (font["files"] == []) == native and (font["licenseFile"] is None) == native, font["slug"]
        assert (font["nativeSet"] is not None) == native, font["slug"]
        assert font["previewFont"].endswith("/preview.woff2")
        assert isinstance(font["reservedNames"], list), font["slug"]  # information only: either group may have some
        for file in font["files"]:
            assert file["url"].startswith("https://raw.githubusercontent.com/google/fonts/" + "a" * 40 + "/ofl/")


def meta(directory: str, name: str) -> FamilyMeta:
    return FamilyMeta(directory, name, "", "OFL", "", ("cyrillic",), ())


def test_slugs():
    assert entries.slugify("IBM Plex Sans", "x") == "ibm-plex-sans"
    assert entries.slugify("  Open Sans!  ", "x") == "open-sans"
    assert entries.slugify("Монсерат", "monserat") == "monserat"  # nothing usable: the folder name
    slugs = entries.unique_slugs([meta("a", "Foo Bar"), meta("foobar", "Foo-Bar"), meta("c", "Other")])
    assert slugs == {"a": "foo-bar", "c": "other", "foobar": "foobar"}  # a taken slug falls back to the folder name


def test_the_document_is_stable_text():
    document = entries.catalog_document(
        [{"name": "b", "slug": "b"}, {"name": "A", "slug": "a2"}, {"name": "a", "slug": "a1"}], "c" * 40, sample=True
    )
    assert [f["slug"] for f in document["fonts"]] == ["a1", "a2", "b"]  # by name ignoring case, then slug
    assert document["mock"] is True
    text = entries.dump({"x": "Български"})
    assert "Български" in text and text.endswith("}\n")


def test_every_published_preview_can_draw_its_family_name():
    # The /fonts/ card draws the family name in the preview font, so the cut must keep those characters.
    from fontTools.ttLib import TTFont

    site = json.loads((WEB / "data" / "catalog.json").read_text(encoding="utf-8"))
    public = WEB.parent / "public"
    for font in site["fonts"]:
        cmap = TTFont(public / font["previewFont"].lstrip("/")).getBestCmap()
        missing = sorted({ch for ch in font["name"] if not ch.isspace() and ord(ch) not in cmap})
        assert missing == [], font["slug"]
