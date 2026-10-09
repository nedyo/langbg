from __future__ import annotations

import json
import shutil

from conftest import MONTSERRAT, PLEX, PTSANS
from langbg import naming
from langbg.cli import main


def test_analyze_json(capsys):
    code = main(["analyze", "--json", str(MONTSERRAT / "Montserrat-Regular.ttf"), str(PTSANS / "PT_Sans-Web-Regular.ttf")])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert [d["has_bgr_locl"] for d in data] == [True, False]
    assert "д" in data[0]["characters"]


def test_analyze_text(capsys):
    assert main(["analyze", str(PLEX / "IBMPlexSans[wdth,wght].ttf")]) == 0
    out = capsys.readouterr().out
    assert "Reserved Font Names: Plex" in out


def test_convert_files(tmp_path):
    out = tmp_path / "out"
    code = main(
        [
            "convert",
            str(MONTSERRAT / "Montserrat-Regular.ttf"),
            str(MONTSERRAT / "Montserrat[wght].ttf"),
            str(MONTSERRAT / "Montserrat-Regular.otf"),
            "--mode",
            "stylistic",
            "-o",
            str(out),
        ]
    )
    assert code == 0
    assert sorted(p.name for p in out.iterdir()) == [
        "MontserratBG-Regular.otf",
        "MontserratBG-Regular.ttf",
        "MontserratBG[wght].ttf",
    ]


def test_convert_failures(tmp_path, capsys):
    out = tmp_path / "out"
    # The Plex font converts (its Reserved Font Name is only reported); PT Sans has no Bulgarian forms.
    code = main(["convert", str(PLEX / "IBMPlexSans[wdth,wght].ttf"), str(PTSANS / "PT_Sans-Web-Regular.ttf"), "-o", str(out)])
    assert code == 1
    assert [p.name for p in out.iterdir()] == ["IBMPlexSansBG[wdth,wght].ttf"]
    assert "no Bulgarian forms" in capsys.readouterr().err


def test_convert_with_name(tmp_path):
    out = tmp_path / "out"
    code = main(["convert", str(PLEX / "IBMPlexSans[wdth,wght].ttf"), "--name", "Kiril Sans", "-o", str(out)])
    assert code == 0
    assert [p.name for p in out.iterdir()] == ["KirilSans[wdth,wght].ttf"]


def test_explicit_ofl(tmp_path, capsys):
    src = tmp_path / "Montserrat-Regular.ttf"
    shutil.copy(MONTSERRAT / "Montserrat-Regular.ttf", src)
    ofl = tmp_path / "license.txt"
    ofl.write_text('Copyright 2011 X, with Reserved Font Name "Montserrat".', encoding="utf-8")
    assert main(["analyze", str(src), "--ofl", str(ofl)]) == 0
    assert "Reserved Font Names: Montserrat" in capsys.readouterr().out
    out = tmp_path / "out"
    assert main(["convert", str(src), "-o", str(out)]) == 0  # reported, not refused
    assert [p.name for p in out.iterdir()] == ["MontserratBG-Regular.ttf"]


def test_an_unexpected_error_does_not_stop_the_batch(tmp_path, capsys, monkeypatch):
    import langbg.cli as cli

    real = cli.convert

    def broken_for_plex(font, **kwargs):
        if naming.current_family(font) == "IBM Plex Sans":
            raise KeyError("broken GSUB")
        return real(font, **kwargs)

    monkeypatch.setattr(cli, "convert", broken_for_plex)
    out = tmp_path / "out"
    code = main(["convert", str(PLEX / "IBMPlexSans[wdth,wght].ttf"), str(MONTSERRAT / "Montserrat-Regular.ttf"), "-o", str(out)])
    assert code == 1
    assert [p.name for p in out.iterdir()] == ["MontserratBG-Regular.ttf"]
    assert "KeyError" in capsys.readouterr().err
