"""Bytes in, plain data out: the entry point for callers that are not Python (the browser worker).

Every function returns JSON-ready data and never raises for a bad font, so one broken
file cannot take down a batch. Errors carry the stable `code` of `LangbgError`.
"""

from __future__ import annotations

import os
from typing import Any

from . import naming
from .core import Mode, analyze, convert
from .errors import LangbgError
from .fontio import font_extension, load_font, save_font


def output_filename(file_name: str, old_ps_family: str, new_ps_family: str, ext: str) -> str:
    """`Montserrat-Regular.ttf` -> `MontserratBG-Regular.ttf`; unrelated names get the family appended."""
    stem = os.path.splitext(os.path.basename(file_name))[0]
    if old_ps_family and stem.startswith(old_ps_family):
        stem = new_ps_family + stem[len(old_ps_family):]
    else:
        stem = f"{stem}-{new_ps_family}"
    return stem + ext


def _text(value: Any) -> str | None:
    """Optional string from a foreign caller (JS `undefined`/`null` arrive as non-str)."""
    return value if isinstance(value, str) and value else None


def _error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, LangbgError):
        return {"ok": False, "error": exc.to_dict()}
    return {"ok": False, "error": {"code": "internal_error", "message": f"{type(exc).__name__}: {exc}"}}


def analyze_bytes(data: Any, license_text: Any = None) -> dict[str, Any]:
    """`{"ok": True, "report": {...}}` or `{"ok": False, "error": {"code", "message", ...}}`."""
    try:
        report = analyze(load_font(bytes(data)), _text(license_text))
    except Exception as exc:  # noqa: BLE001 - boundary: report, never crash the batch
        return _error(exc)
    return {"ok": True, "report": report.to_dict()}


def convert_bytes(
    data: Any,
    file_name: str,
    mode: Mode = "default",
    family_suffix: Any = " BG",
    family_name: Any = None,
) -> tuple[dict[str, Any], bytes | None]:
    """Convert one font. Returns (result, font bytes); the bytes are None when `result["ok"]` is False."""
    try:
        font = load_font(bytes(data))
        old_ps_family = naming.current_ps_family(font)
        new_font, report = convert(
            font,
            mode=mode,
            family_suffix=_text(family_suffix) or " BG",
            family_name=_text(family_name),
        )
        out_name = output_filename(
            file_name, old_ps_family, naming.current_ps_family(new_font), font_extension(new_font)
        )
        out_bytes = save_font(new_font)
    except Exception as exc:  # noqa: BLE001 - boundary: report, never crash the batch
        return _error(exc), None
    return {"ok": True, "file_name": out_name, "report": report.to_dict()}, out_bytes
