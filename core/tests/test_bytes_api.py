"""The bytes-in / plain-data-out facade used by the browser worker."""

from __future__ import annotations

import json
from io import BytesIO

import pytest
from fontTools.ttLib import TTFont

from conftest import MONTSERRAT, PLEX, PTSANS, original_bytes
from langbg.bytes_api import analyze_bytes, convert_bytes, output_filename

REGULAR = original_bytes(MONTSERRAT / "Montserrat-Regular.ttf")


def test_analyze_ok_is_json_ready():
    result = analyze_bytes(REGULAR)
    assert result["ok"] is True
    assert result["report"]["has_bgr_locl"] is True
    assert "д" in result["report"]["characters"]
    assert json.loads(json.dumps(result)) == result


def test_analyze_reports_the_designer():
    assert analyze_bytes(REGULAR)["report"]["designer"] == "Julieta Ulanovsky"


def test_analyze_accepts_bytes_like_input():
    assert analyze_bytes(bytearray(REGULAR))["ok"]
    assert analyze_bytes(memoryview(REGULAR))["ok"]


def test_analyze_no_bgr_forms_is_still_ok():
    result = analyze_bytes(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf"))
    assert result["ok"] and result["report"]["has_bgr_locl"] is False


def test_analyze_garbage_is_an_error_not_an_exception():
    result = analyze_bytes(b"definitely not a font")
    assert result["ok"] is False
    assert result["error"]["code"] == "unsupported_font"


def test_analyze_reads_reserved_names_from_license_text():
    ofl = (PLEX / "OFL.txt").read_text(encoding="utf-8")
    plex = original_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf")
    assert "Plex" in analyze_bytes(plex, ofl)["report"]["reserved_font_names"]
    # JS `undefined` / `null` arrive as non-str objects and must read as "no license".
    assert analyze_bytes(plex, object())["ok"]


def test_convert_ok():
    result, data = convert_bytes(REGULAR, "Montserrat-Regular.ttf")
    assert result["ok"] and result["file_name"] == "MontserratBG-Regular.ttf"
    assert result["report"]["output"]["family"] == "Montserrat BG"
    font = TTFont(BytesIO(data))
    assert font["name"].getDebugName(1) == "Montserrat BG"
    assert json.loads(json.dumps(result)) == result


def test_convert_stylistic_mode_reports_the_set():
    result, _ = convert_bytes(REGULAR, "Montserrat-Regular.ttf", mode="stylistic")
    assert result["report"]["output"]["stylistic_set"] == "ss20"


def test_convert_custom_name_and_suffix():
    result, data = convert_bytes(REGULAR, "Montserrat-Regular.ttf", family_suffix=" Kiril")
    assert result["report"]["output"]["family"] == "Montserrat Kiril"
    result, data = convert_bytes(REGULAR, "Montserrat-Regular.ttf", family_name="Balkan Sans")
    assert result["file_name"] == "BalkanSans-Regular.ttf"
    assert TTFont(BytesIO(data))["name"].getDebugName(1) == "Balkan Sans"


def test_convert_with_a_reserved_name_is_not_refused():
    plex = original_bytes(PLEX / "IBMPlexSans[wdth,wght].ttf")
    result, data = convert_bytes(plex, "IBMPlexSans[wdth,wght].ttf")
    assert result["ok"] and data
    assert result["report"]["output"]["family"] == "IBM Plex Sans BG"


@pytest.mark.parametrize(
    "data, code",
    [
        pytest.param(b"nope", "unsupported_font", id="garbage"),
        pytest.param(original_bytes(PTSANS / "PT_Sans-Web-Regular.ttf"), "no_bgr_forms", id="no-bgr"),
    ],
)
def test_convert_errors_have_stable_codes(data, code):
    result, out = convert_bytes(data, "x.ttf")
    assert out is None and result["error"]["code"] == code
    assert json.loads(json.dumps(result)) == result


def test_convert_already_converted():
    _, data = convert_bytes(REGULAR, "Montserrat-Regular.ttf")
    result, out = convert_bytes(data, "MontserratBG-Regular.ttf")
    assert out is None and result["error"]["code"] == "already_converted"


def test_unexpected_exceptions_become_internal_errors(monkeypatch):
    import langbg.bytes_api as api

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(api, "analyze", boom)
    assert analyze_bytes(REGULAR) == {
        "ok": False,
        "error": {"code": "internal_error", "message": "RuntimeError: boom"},
    }


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Montserrat-Regular.ttf", "MontserratBG-Regular.ttf"),
        ("Montserrat[wght].ttf", "MontserratBG[wght].ttf"),
        ("fonts/Montserrat-Italic.otf", "MontserratBG-Italic.ttf"),
        ("Unrelated.ttf", "Unrelated-MontserratBG.ttf"),
    ],
)
def test_output_filename(name, expected):
    assert output_filename(name, "Montserrat", "MontserratBG", ".ttf") == expected
