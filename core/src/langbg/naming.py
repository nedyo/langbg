"""Family renaming, and detection of Reserved Font Names (RFN)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from .errors import InvalidFamilyName

VERSION_MARKER = "Bulgarian forms via langbg.com"
PS_NAME_MAX = 63
NO_NAME = 0xFFFF

# Bulgarian official (streamlined) transliteration, for PostScript names only.
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
    "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "sht", "ъ": "a", "ь": "y", "ю": "yu", "я": "ya", "ѝ": "i",
    "ё": "yo", "ы": "y", "э": "e", "є": "ye", "і": "i", "ї": "yi", "ґ": "g",
}
_PS_FORBIDDEN = set("[](){}<>/%")


def transliterate(text: str) -> str:
    out = []
    for ch in text:
        low = ch.lower()
        if low in _TRANSLIT:
            t = _TRANSLIT[low]
            out.append(t.capitalize() if ch != low else t)
        else:
            out.append(ch)
    return "".join(out)


def to_ascii(text: str) -> str:
    """Printable ASCII for legacy name fields (CFF, Macintosh name records): transliterated, accents
    dropped, anything else (quotes, №, Greek, CJK) removed."""
    text = unicodedata.normalize("NFKD", transliterate(text)).encode("ascii", "ignore").decode("ascii")
    return " ".join("".join(c for c in text if 32 <= ord(c) <= 126).split())


def ps_sanitize(text: str) -> str:
    """PostScript-safe: printable ASCII 33-126, no [](){}<>/% and no hyphen."""
    text = transliterate(text)
    return "".join(c for c in text if 33 <= ord(c) <= 126 and c not in _PS_FORBIDDEN and c != "-")


# --- current names -------------------------------------------------------------


def _get(font, name_id: int) -> str | None:
    if "name" not in font:
        return None
    return font["name"].getDebugName(name_id)


def current_family(font) -> str:
    return _get(font, 16) or _get(font, 1) or ""


def current_ps_name(font) -> str:
    return _get(font, 6) or ps_sanitize(current_family(font))


def current_ps_family(font) -> str:
    return current_ps_name(font).split("-", 1)[0]


def fvar_ps_name_ids(font) -> set[int]:
    """Name IDs that fvar instances use for their PostScript names."""
    if "fvar" not in font:
        return set()
    return {i.postscriptNameID for i in font["fvar"].instances if i.postscriptNameID not in (None, NO_NAME)}


def already_converted(font) -> bool:
    return VERSION_MARKER in (_get(font, 5) or "")


def designer(font) -> str | None:
    return (_get(font, 9) or "").strip() or None


# --- planning --------------------------------------------------------------------


@dataclass
class NamePlan:
    old_family: str
    new_family: str
    old_ps_family: str
    new_ps_family: str
    custom: bool = False  # a user-chosen name, not "<original> + suffix"

    def ps(self, old: str, style_fallback: str = "") -> str:
        if old.startswith(self.old_ps_family):
            new = self.new_ps_family + old[len(self.old_ps_family):]
        else:
            style = ps_sanitize(style_fallback)
            new = f"{self.new_ps_family}-{style}" if style else self.new_ps_family
        return new[:PS_NAME_MAX]

    def family(self, old: str, fallback: str | None) -> str | None:
        if old.startswith(self.old_family):
            return self.new_family + old[len(self.old_family):]
        return fallback


def plan_names(font, family_suffix: str = " BG", family_name: str | None = None) -> NamePlan:
    old_family = current_family(font)
    old_ps_family = current_ps_family(font)
    if family_name is not None:
        new_family = " ".join(family_name.split())
        if not new_family or any(ord(c) < 32 for c in new_family):
            raise InvalidFamilyName("The family name is empty or contains control characters.")
        if new_family.casefold() == old_family.casefold():
            raise InvalidFamilyName(
                "The new family name must differ from the original, otherwise it would "
                "replace the original font when installed.",
                family=new_family,
            )
        new_ps_family = ps_sanitize(new_family)
    else:
        if not family_suffix or not family_suffix.strip():
            raise InvalidFamilyName("The family suffix is empty.")
        new_family = old_family + family_suffix
        new_ps_family = old_ps_family + ps_sanitize(family_suffix)
    if not new_ps_family:
        raise InvalidFamilyName(
            "The family name has no characters usable in a PostScript name.", family=new_family
        )
    return NamePlan(old_family, new_family, old_ps_family, new_ps_family[:PS_NAME_MAX], custom=family_name is not None)


# --- Reserved Font Names -----------------------------------------------------------
# Detection only. The converter tells the user what the license reserves (one line) and never
# refuses, warns about or renames anything because of it.

_LICENSE_BODY = re.compile(
    r"This Font Software is licensed|SIL OPEN FONT LICENSE|PREAMBLE", re.IGNORECASE
)
_RFN = re.compile(
    r"Reserved\s+Font\s+Names?\s*:?\s*(?P<rest>.+?)(?:\.(?=\s|$)|\n\s*\n|$)",
    re.IGNORECASE | re.DOTALL,
)
_QUOTED = re.compile(r"[\"“”„«'‘’]([^\"“”„«»'‘’]+)[\"“”»'‘’]")


def parse_reserved_font_names(text: str | None) -> list[str]:
    """Extract RFNs from copyright/license text (the part before the OFL body)."""
    if not text:
        return []
    m = _LICENSE_BODY.search(text)
    header = text[: m.start()] if m else text
    names: list[str] = []
    for match in _RFN.finditer(header):
        rest = match.group("rest")
        quoted = _QUOTED.findall(rest)
        if quoted:
            found = quoted
        else:
            found = re.split(r",|\band\b|;", rest)
        for n in found:
            n = " ".join(n.strip(" \t\r\n.,;\"'").split())
            if n and n not in names:
                names.append(n)
    return names


def reserved_font_names(font, ofl_text: str | None = None) -> list[str]:
    """RFNs from the font's own name table (name IDs 0, 13, 14) and the license text, when there is one."""
    found: list[str] = []
    if "name" in font:
        for rec in font["name"].names:
            if rec.nameID in (0, 13, 14):
                try:
                    found += parse_reserved_font_names(rec.toUnicode())
                except UnicodeDecodeError:
                    continue
    found += parse_reserved_font_names(ofl_text)
    names: list[str] = []
    have: set[str] = set()
    for name in found:
        if name.casefold() not in have:
            names.append(name)
            have.add(name.casefold())
    return names


# --- applying ----------------------------------------------------------------------


def _set(name_table, rec, *values: str) -> bool:
    """Set a record's string to the first value its encoding can hold (a Macintosh record cannot hold
    Cyrillic, for one). If none fits, the record keeps its old string, or is dropped if even that does not."""
    old = rec.string
    for value in values:
        if not value:
            continue
        rec.string = value
        try:
            rec.toBytes()
            return True
        except UnicodeEncodeError:
            continue
    rec.string = old
    try:
        rec.toBytes()
    except UnicodeEncodeError:
        name_table.names.remove(rec)
    return False


def attribution(plan: NamePlan, designer_name: str | None) -> str:
    by = f" by {designer_name}" if designer_name else ""
    return f"Based on {plan.old_family}{by}, Bulgarian forms enabled via langbg.com"


def _set_description(font, plan: NamePlan) -> None:
    """Name ID 10: say what the font is based on. With a user-chosen name the original name
    no longer shows in the family name. OFL FAQ 5.3: naming the original in the description
    is allowed. An existing description is kept and the attribution appended."""
    name = font["name"]
    text = attribution(plan, designer(font))
    platforms = [(3, 1, 0x409)]
    if any(rec.platformID == 1 for rec in name.names):
        platforms.append((1, 0, 0))
    for platform, encoding, language in platforms:
        existing = name.getName(10, platform, encoding, language)
        old = existing.toUnicode().strip() if existing else ""
        if text in old:
            continue
        new = f"{old} {text}" if old else text
        ascii_new = f"{old} {to_ascii(text)}".strip()  # keeps the old text where the encoding cannot hold the new one
        name.setName(new, 10, platform, encoding, language)
        _set(name, name.getName(10, platform, encoding, language), new, ascii_new)


def apply_names(font, plan: NamePlan, fvar_ps_ids: set[int], mark: bool = True) -> str:
    """Rename the family everywhere it is stored. Returns the new PostScript name.

    `mark` adds the langbg marker to the version (name ID 5) and, for a custom name, the attribution
    (name ID 10). Only a converted font gets them; a renamed copy of an unconverted font does not."""
    name = font["name"]
    style = _get(font, 17) or _get(font, 2) or ""
    for rec in list(name.names):
        nid = rec.nameID
        try:
            old = rec.toUnicode()
        except UnicodeDecodeError:
            continue
        if nid in (1, 16, 21):
            new = plan.family(old, plan.new_family)
        elif nid == 4:
            fallback = f"{plan.new_family} {style}".strip()
            new = plan.family(old, fallback)
        elif nid == 22:
            new = plan.family(old, None)
        elif nid == 3:
            if plan.old_ps_family and plan.old_ps_family in old:
                new = old.replace(plan.old_ps_family, plan.new_ps_family, 1)
            elif plan.old_family and plan.old_family in old:
                new = old.replace(plan.old_family, plan.new_family, 1)
            else:
                new = f"{old};{plan.new_ps_family}"
        elif nid == 5 and mark:
            new = old if VERSION_MARKER in old else f"{old}; {VERSION_MARKER}"
        elif nid == 6:
            new = plan.ps(old, style)
        elif nid == 25:
            new = plan.ps(old)
        elif nid in fvar_ps_ids:
            new = plan.ps(old)
        elif nid >= 256 and plan.old_ps_family and (old == plan.old_ps_family or old.startswith(plan.old_ps_family + "-")):
            # A PostScript name no fvar instance points to (fonts keep those after pruning
            # instances). Invisible, but it would still carry the old, possibly reserved, name.
            new = plan.ps(old)
        else:
            continue
        if new is not None and new != old:
            _set(name, rec, new, to_ascii(new))

    if plan.custom and mark:
        _set_description(font, plan)

    ps_name = _get(font, 6)
    if ps_name is None:
        ps_name = plan.ps(plan.old_ps_family, style)
    return ps_name


def apply_cff_names(font, plan: NamePlan, ps_name: str) -> None:
    if "CFF " not in font:
        return  # CFF2 has no names
    cff = font["CFF "].cff
    cff.fontNames[0] = ps_name
    top = cff.topDictIndex[0]
    for key in ("FamilyName", "FullName"):
        if key in top.rawDict:
            old = top.rawDict[key]
            new = plan.family(old, None)
            if key == "FamilyName" and new is None:
                new = plan.new_family
            if new is None:
                continue
            # CFF strings are Latin-1 at most; anything else would fail when the font is saved.
            setattr(top, key, to_ascii(new) or plan.new_ps_family)
