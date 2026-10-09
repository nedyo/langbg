"""langbg: make Bulgarian Cyrillic forms work in Figma by re-wiring GSUB."""

from .core import MODES, analyze, convert
from .errors import (
    AlreadyConverted,
    InvalidFamilyName,
    LangbgError,
    NoBgrForms,
    NoFreeStylisticSet,
    UnsupportedFont,
)
from .fontio import font_extension, load_font, save_font
from .report import LookupInfo, OutputInfo, Report, StylisticSetInfo

__version__ = "0.1.0"

__all__ = [
    "MODES",
    "AlreadyConverted",
    "InvalidFamilyName",
    "LangbgError",
    "LookupInfo",
    "NoBgrForms",
    "NoFreeStylisticSet",
    "OutputInfo",
    "Report",
    "StylisticSetInfo",
    "UnsupportedFont",
    "analyze",
    "convert",
    "font_extension",
    "load_font",
    "save_font",
]
