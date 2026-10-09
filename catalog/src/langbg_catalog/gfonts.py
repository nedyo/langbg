"""google/fonts: a sparse checkout of ofl/ and the METADATA.pb files that describe each family.

The checkout is partial in two ways. Git fetches no file contents until they are needed (blobless
clone), and only the files we ask for are checked out: first every family's METADATA.pb and OFL.txt
(a few MB), then the font files of the families that matter.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.request
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO_URL = "https://github.com/google/fonts.git"
BASE_PATTERNS = ("/ofl/*/METADATA.pb", "/ofl/*/OFL.txt")
FONT_SUFFIXES = (".ttf", ".otf")
# Windows limits a command line to ~32k characters; each family adds two ~40 character patterns.
PATTERNS_PER_CALL = 100


# --- METADATA.pb (protobuf text format) -------------------------------------------

_TOKEN = re.compile(r'\s*(?:#[^\n]*|(?P<str>"(?:[^"\\]|\\.)*")|(?P<punct>[{}:])|(?P<word>[^\s{}:"#]+))')
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "'": "'", "\\": "\\"}


def _tokens(text: str) -> Iterator[tuple[str, str]]:
    pos = 0
    while pos < len(text):
        match = _TOKEN.match(text, pos)
        if not match:
            if text[pos:].strip():
                raise ValueError(f"Unexpected text at offset {pos}: {text[pos:pos + 30]!r}")
            return
        pos = match.end()
        if match.group("str") is not None:
            raw = match.group("str")[1:-1]
            yield "str", re.sub(r"\\(.)", lambda m: _ESCAPES.get(m.group(1), m.group(1)), raw)
        elif match.group("punct"):
            yield "punct", match.group("punct")
        elif match.group("word"):
            yield "word", match.group("word")


def _scalar(kind: str, value: str) -> Any:
    if kind == "str":
        return value
    if value in ("true", "false"):
        return value == "true"
    for cast in (int, float):
        try:
            return cast(value)
        except ValueError:
            continue
    return value  # an enum name


class _Cursor:
    def __init__(self, text: str) -> None:
        self.items = list(_tokens(text))
        self.pos = 0

    def next(self) -> tuple[str, str] | None:
        token = self.items[self.pos] if self.pos < len(self.items) else None
        self.pos += 1
        return token

    def peek(self) -> tuple[str, str] | None:
        return self.items[self.pos] if self.pos < len(self.items) else None


def _block(tokens: _Cursor, top: bool) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    while (token := tokens.next()) is not None:
        kind, key = token
        if kind == "punct":
            if key == "}" and not top:
                return out
            raise ValueError(f"Unexpected {key!r}")
        sep = tokens.next()
        if sep == ("punct", "{"):
            out.setdefault(key, []).append(_block(tokens, top=False))
        elif sep == ("punct", ":"):
            value = tokens.next()
            if value is None:
                raise ValueError(f"Missing value for {key!r}")
            if value == ("punct", "{"):
                out.setdefault(key, []).append(_block(tokens, top=False))
            elif value[0] == "str":
                text = value[1]
                while (more := tokens.peek()) is not None and more[0] == "str":  # "a" "b" is one string
                    text += more[1]
                    tokens.next()
                out.setdefault(key, []).append(text)
            else:
                out.setdefault(key, []).append(_scalar(*value))
        else:
            raise ValueError(f"Expected ':' or '{{' after {key!r}")
    if not top:
        raise ValueError("Unclosed '{'")
    return out


def parse_textproto(text: str) -> dict[str, list[Any]]:
    """Protobuf text format as {field: [values]}; message values are dicts of the same shape."""
    return _block(_Cursor(text), top=True)


@dataclass(frozen=True)
class FontRef:
    filename: str
    style: str  # "normal" | "italic"
    weight: int


@dataclass(frozen=True)
class FamilyMeta:
    directory: str  # ofl/<directory>
    name: str
    designer: str
    license: str
    category: str
    subsets: tuple[str, ...]
    files: tuple[FontRef, ...]
    axes: tuple[tuple[str, float, float], ...] = field(default=())
    repository_url: str | None = None
    commit: str | None = None

    @property
    def has_cyrillic(self) -> bool:
        return "cyrillic" in self.subsets


def _first(block: dict[str, list[Any]], key: str, default: Any = None) -> Any:
    values = block.get(key)
    return values[0] if values else default


def parse_metadata(directory: str, text: str) -> FamilyMeta:
    meta = parse_textproto(text)
    name = _first(meta, "name")
    if not name:
        raise ValueError("METADATA.pb has no name")
    files = tuple(
        FontRef(f["filename"][0], _first(f, "style", "normal"), int(_first(f, "weight", 400)))
        for f in meta.get("fonts", [])
        if f.get("filename")
    )
    axes = tuple(
        (a["tag"][0], float(_first(a, "min_value", 0)), float(_first(a, "max_value", 0)))
        for a in meta.get("axes", [])
        if a.get("tag")
    )
    source = _first(meta, "source", {})
    return FamilyMeta(
        directory=directory,
        name=name,
        designer=_first(meta, "designer", ""),
        license=_first(meta, "license", ""),
        category=_first(meta, "category", ""),
        subsets=tuple(meta.get("subsets", [])),
        files=files,
        axes=axes,
        repository_url=_first(source, "repository_url"),
        commit=_first(source, "commit"),
    )


def load_families(cache: Path) -> tuple[list[FamilyMeta], dict[str, str]]:
    """Every family under ofl/ plus {directory: problem} for the ones whose METADATA.pb cannot be read."""
    families: list[FamilyMeta] = []
    problems: dict[str, str] = {}
    for path in sorted((cache / "ofl").glob("*/METADATA.pb")):
        directory = path.parent.name
        try:
            families.append(parse_metadata(directory, path.read_text(encoding="utf-8")))
        except (ValueError, KeyError, OSError) as e:
            problems[directory] = f"{type(e).__name__}: {e}"
    return families, problems


def read_license(cache: Path, directory: str) -> str | None:
    path = cache / "ofl" / directory / "OFL.txt"
    return path.read_text(encoding="utf-8-sig", errors="replace") if path.is_file() else None


# --- git -----------------------------------------------------------------------------


def _git(args: list[str], cwd: Path | None = None) -> str:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    result = subprocess.run(
        ["git", *args], cwd=cwd, env=env, check=False, capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args[:3])} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def head_commit(cache: Path) -> str:
    return _git(["rev-parse", "HEAD"], cache).strip()


def ensure_checkout(cache: Path, update: bool = False) -> str:
    """Clone (blobless, depth 1, ofl metadata only) when missing; with `update`, move to the latest main.

    Returns the commit the checkout is at.
    """
    if not (cache / ".git").is_dir():
        cache.parent.mkdir(parents=True, exist_ok=True)
        _git(["clone", "--filter=blob:none", "--depth", "1", "--sparse", "--no-checkout", REPO_URL, str(cache)])
        _git(["sparse-checkout", "set", "--no-cone", *BASE_PATTERNS], cache)
        _git(["checkout"], cache)
    elif update:
        _git(["fetch", "--depth", "1", "origin", "main"], cache)
        _git(["checkout", "--force", "--detach", "FETCH_HEAD"], cache)
    return head_commit(cache)


def fetch_fonts(cache: Path, directories: Iterable[str]) -> None:
    """Check out the .ttf/.otf files that sit directly in ofl/<directory>/ (not static/ copies)."""
    have = set(_git(["sparse-checkout", "list"], cache).split())
    wanted = [d for d in directories if f"/ofl/{d}/*{FONT_SUFFIXES[0]}" not in have]
    for start in range(0, len(wanted), PATTERNS_PER_CALL):
        chunk = wanted[start : start + PATTERNS_PER_CALL]
        patterns = [f"/ofl/{d}/*{suffix}" for d in chunk for suffix in FONT_SUFFIXES]
        _git(["sparse-checkout", "add", *patterns], cache)


# --- fonts.google.com ------------------------------------------------------------------

# Every family the Google Fonts site lists. A family can be in google/fonts for weeks before the site
# shows it; until then its specimen address is a 404.
GOOGLE_FONTS_METADATA = "https://fonts.google.com/metadata/fonts"


def live_families(url: str = GOOGLE_FONTS_METADATA, timeout: float = 60) -> set[str]:
    """The family names fonts.google.com lists now. Raises when the list cannot be read: a run must not
    quietly drop every Google Fonts link."""
    request = urllib.request.Request(url, headers={"User-Agent": "langbg-catalog"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = response.read().decode("utf-8")
    data = json.loads(text[text.index("{"):])  # the body may start with an anti-JSON-hijacking prefix
    names = {family["family"] for family in data["familyMetadataList"]}
    if not names:
        raise RuntimeError(f"{url} listed no families")
    return names
