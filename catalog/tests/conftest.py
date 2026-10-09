"""A small fake google/fonts checkout built from core's test fixtures, so no test needs the network."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "core" / "tests" / "fixtures"
MONTSERRAT = FIXTURES / "montserrat"
PLEX = FIXTURES / "ibmplexsans"
PTSANS = FIXTURES / "ptsans"

METADATA = '''name: "{name}"
designer: "{designer}"
license: "OFL"
category: "SANS_SERIF"
{subsets}{fonts}{axes}source {{
  repository_url: "https://example.org/{directory}"
  commit: "0123456789abcdef"
}}
fallbacks {{
  axis_target {{
    tag: "wght"
    min_value: 100.0
    max_value: 100.0
  }}
}}
'''

# What fonts.google.com "lists" in the tests: every fixture family except Reserved Mont, which plays
# a family that is in google/fonts but not on the site yet.
LIVE_ON_GOOGLE_FONTS = {"Montserrat", "Montserrat VF", "IBM Plex Sans", "PT Sans", "Mixed"}


@pytest.fixture(autouse=True)
def google_fonts_listing(monkeypatch):
    from langbg_catalog import gfonts

    monkeypatch.setattr(gfonts, "live_families", lambda: set(LIVE_ON_GOOGLE_FONTS))


OFL_WITH_RFN = 'Copyright 2020 The Foo Project Authors, with Reserved Font Name "Montserrat".\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n'


def write_family(
    cache: Path,
    directory: str,
    name: str,
    files: list[tuple[Path, str, str, int]],  # (source file, file name, style, weight)
    ofl: Path | str | None,
    axes: list[tuple[str, float, float]] = (),
    subsets: tuple[str, ...] = ("cyrillic", "latin"),
    designer: str = "Jane Designer",
) -> Path:
    folder = cache / "ofl" / directory
    folder.mkdir(parents=True)
    fonts = "".join(
        f'fonts {{\n  name: "{name}"\n  style: "{style}"\n  weight: {weight}\n  filename: "{file_name}"\n}}\n'
        for _, file_name, style, weight in files
    )
    axis_text = "".join(f'axes {{\n  tag: "{t}"\n  min_value: {lo}\n  max_value: {hi}\n}}\n' for t, lo, hi in axes)
    subset_text = "".join(f'subsets: "{s}"\n' for s in subsets)
    (folder / "METADATA.pb").write_text(
        METADATA.format(name=name, designer=designer, directory=directory, subsets=subset_text, fonts=fonts, axes=axis_text),
        encoding="utf-8",
    )
    for source, file_name, _, _ in files:
        shutil.copyfile(source, folder / file_name)
    if isinstance(ofl, Path):
        shutil.copyfile(ofl, folder / "OFL.txt")
    elif ofl is not None:
        (folder / "OFL.txt").write_text(ofl, encoding="utf-8")
    return folder


@pytest.fixture
def cache(tmp_path: Path) -> Path:
    """montserrat (static, converts), montserratvf (variable, converts), ibmplexsans (native set),
    reservedmont (converts; its license reserves the name Montserrat), ptsans (no Bulgarian forms),
    mixed (one file with, one without), latinonly (no cyrillic subset)."""
    root = tmp_path / "google-fonts"
    write_family(
        root, "montserrat", "Montserrat",
        [(MONTSERRAT / "Montserrat-Regular.ttf", "Montserrat-Regular.ttf", "normal", 400),
         (MONTSERRAT / "Montserrat-Italic.ttf", "Montserrat-Italic.ttf", "italic", 400)],
        MONTSERRAT / "OFL.txt",
    )
    write_family(
        root, "montserratvf", "Montserrat VF",
        [(MONTSERRAT / "Montserrat[wght].ttf", "Montserrat[wght].ttf", "normal", 400)],
        MONTSERRAT / "OFL.txt", axes=[("wght", 100.0, 900.0)],
    )
    write_family(
        root, "ibmplexsans", "IBM Plex Sans",
        [(PLEX / "IBMPlexSans[wdth,wght].ttf", "IBMPlexSans[wdth,wght].ttf", "normal", 400)],
        PLEX / "OFL.txt", axes=[("wdth", 85.0, 100.0), ("wght", 100.0, 700.0)],
    )
    write_family(
        root, "reservedmont", "Reserved Mont",
        [(MONTSERRAT / "Montserrat-Regular.ttf", "Montserrat-Regular.ttf", "normal", 400)],
        OFL_WITH_RFN,
    )
    write_family(
        root, "ptsans", "PT Sans",
        [(PTSANS / "PT_Sans-Web-Regular.ttf", "PT_Sans-Web-Regular.ttf", "normal", 400)],
        PTSANS / "OFL.txt",
    )
    write_family(
        root, "mixed", "Mixed",
        [(MONTSERRAT / "Montserrat-Regular.ttf", "A-Regular.ttf", "normal", 400),
         (PTSANS / "PT_Sans-Web-Regular.ttf", "B-Regular.ttf", "normal", 400)],
        MONTSERRAT / "OFL.txt",
    )
    write_family(
        root, "latinonly", "Latin Only",
        [(MONTSERRAT / "Montserrat-Regular.ttf", "Montserrat-Regular.ttf", "normal", 400)],
        MONTSERRAT / "OFL.txt", subsets=("latin",),
    )
    return root
