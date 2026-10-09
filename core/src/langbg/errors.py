"""Typed errors. Each has a stable `code` so a UI can show a translated message."""

from __future__ import annotations

from typing import Any


class LangbgError(Exception):
    code = "langbg_error"

    def __init__(self, message: str, **data: Any) -> None:
        super().__init__(message)
        self.message = message
        self.data = data

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.data}


class NoBgrForms(LangbgError):
    """The font has no `locl` feature for the Bulgarian (BGR) language system."""

    code = "no_bgr_forms"


class UnsupportedFont(LangbgError):
    code = "unsupported_font"


class NoFreeStylisticSet(LangbgError):
    code = "no_free_stylistic_set"


class InvalidFamilyName(LangbgError):
    code = "invalid_family_name"


class AlreadyConverted(LangbgError):
    code = "already_converted"
