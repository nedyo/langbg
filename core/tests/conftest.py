from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pytest
import uharfbuzz as hb

from langbg import convert, load_font, save_font

FIXTURES = Path(__file__).parent / "fixtures"
MONTSERRAT = FIXTURES / "montserrat"
PLEX = FIXTURES / "ibmplexsans"
PTSANS = FIXTURES / "ptsans"

BG_LOWER = "абвгдежзийклмнопрстуфхцчшщъьюяѝ"
BG_UPPER = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯЍ"
BG_TEXT = BG_LOWER + " " + BG_UPPER


@dataclass(frozen=True, eq=False)  # identity hash, so it can key lru_cache
class Case:
    id: str
    path: Path
    # Axis locations to test; {} is the default instance.
    locations: tuple = ({},)
    convert_kwargs: tuple = ()  # (key, value) pairs; a tuple keeps Case hashable

    @property
    def kwargs(self) -> dict:
        return dict(self.convert_kwargs)


POSITIVE = [
    Case("montserrat-regular", MONTSERRAT / "Montserrat-Regular.ttf"),
    Case("montserrat-italic", MONTSERRAT / "Montserrat-Italic.ttf"),
    Case("montserrat-regular-cff", MONTSERRAT / "Montserrat-Regular.otf"),
    Case(
        "montserrat-variable",
        MONTSERRAT / "Montserrat[wght].ttf",
        locations=({}, {"wght": 100}, {"wght": 400}, {"wght": 650}, {"wght": 900}),
    ),
    Case(
        "plex-variable",
        PLEX / "IBMPlexSans[wdth,wght].ttf",
        locations=({}, {"wght": 100, "wdth": 75}, {"wght": 700, "wdth": 100}, {"wght": 700, "wdth": 75}),
    ),
]
MODES = ("default", "stylistic")


@lru_cache(maxsize=None)
def original_bytes(path: Path) -> bytes:
    return path.read_bytes()


@lru_cache(maxsize=None)
def converted_bytes(case: Case, mode: str) -> bytes:
    font = load_font(original_bytes(case.path))
    out, _ = convert(font, mode=mode, **case.kwargs)
    return save_font(out)


@lru_cache(maxsize=64)
def _hb_face(data: bytes) -> hb.Face:
    return hb.Face(data)


def shape(data: bytes, text: str = BG_TEXT, lang: str | None = None, features=None, variations=None):
    """Shape `text` and return (glyph id, cluster) pairs.

    Direction and script are set explicitly and guess_segment_properties() is NOT
    called: it would fill in the OS locale as language (on a Bulgarian Windows
    that is "bg"), silently turning a "no language" test into a "bg" test.
    """
    font = hb.Font(_hb_face(data))
    if variations:
        font.set_variations(variations)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction = "ltr"
    buf.script = "Cyrl"
    if lang is not None:
        buf.language = lang
    hb.shape(font, buf, features or {})
    return [(info.codepoint, info.cluster) for info in buf.glyph_infos]


@pytest.fixture(params=POSITIVE, ids=lambda c: c.id)
def case(request) -> Case:
    return request.param


@pytest.fixture(params=MODES)
def mode(request) -> str:
    return request.param
