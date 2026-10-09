from __future__ import annotations

import json
from pathlib import Path

import pytest

from langbg_catalog import cli, gfonts, report
from langbg_catalog.pipeline import Options, run

COMMIT = "5e8a3ba899557829a76cfdac30fa512bda91d7ca"
LATER = "ffffffffffffffffffffffffffffffffffffffff"


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(gfonts, "ensure_checkout", lambda cache, update=False: COMMIT)
    monkeypatch.setattr(gfonts, "fetch_fonts", lambda cache, directories: None)


def options(cache: Path, out: Path, **kwargs) -> Options:
    return Options(
        cache=cache,
        assets_dir=out / "catalog",
        data_file=out / "catalog.json",
        manifest=out / "manifest.json",
        report=out / "report.md",
        **kwargs,
    )


def states(result):
    return {o.family.meta.directory: o.state for o in result.outcomes}


def quiet(opts):
    return run(opts, log=lambda _: None)


def test_a_full_run(cache, tmp_path):
    out = tmp_path / "out"
    result = quiet(options(cache, out))
    assert states(result) == {
        "montserrat": "convert",
        "montserratvf": "convert",
        "ibmplexsans": "native",
        "reservedmont": "convert",
        "ptsans": "no_bgr",
        "mixed": "partial",
    }  # latinonly has no cyrillic subset: never looked at
    assert (result.cyrillic_families, result.skipped_by_metadata) == (6, 1)

    document = json.loads((out / "catalog.json").read_text(encoding="utf-8"))
    assert document["schema"] == 3 and document["mock"] is False and document["googleFontsCommit"] == COMMIT
    by_slug = {f["slug"]: f for f in document["fonts"]}
    assert list(by_slug) == ["ibm-plex-sans", "montserrat", "montserrat-vf", "reserved-mont"]  # by name; the other two are left out

    mont = by_slug["montserrat"]
    assert mont["group"] == "convert" and mont["convertedName"] == "Montserrat BG" and mont["nativeSet"] is None
    assert mont["previewFont"] == "/catalog/montserrat/preview.woff2"
    assert [f["name"] for f in mont["files"]] == ["Montserrat-Regular.ttf", "Montserrat-Italic.ttf"]
    assert mont["files"][0]["url"] == f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/montserrat/Montserrat-Regular.ttf"
    assert mont["licenseFile"] == f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/montserrat/OFL.txt"
    assert mont["googleFontsUrl"] == "https://fonts.google.com/specimen/Montserrat"
    assert mont["styles"] == ["Regular", "Italic"] and mont["axes"] == []
    assert mont["designer"] == "Jane Designer" and mont["license"] == "OFL-1.1"
    assert by_slug["montserrat-vf"]["axes"] == [{"tag": "wght", "min": 100, "max": 900}]
    assert by_slug["montserrat-vf"]["files"][0]["url"].endswith("/Montserrat%5Bwght%5D.ttf")

    plex = by_slug["ibm-plex-sans"]
    assert (plex["group"], plex["nativeSet"], plex["files"], plex["licenseFile"]) == ("native", "ss06", [], None)
    assert plex["convertedName"] == "IBM Plex Sans" and plex["reservedNames"] == ["Plex"]

    reserved = by_slug["reserved-mont"]  # its license reserves a name: still an ordinary entry of the first group
    assert reserved["group"] == "convert" and reserved["nativeSet"] is None and reserved["reservedNames"] == ["Montserrat"]
    assert reserved["convertedName"] == "Montserrat BG" and reserved["files"] and reserved["licenseFile"]
    assert reserved["googleFontsUrl"] is None  # in google/fonts, not on fonts.google.com yet: the page links to the source
    assert reserved["source"] == "https://example.org/reservedmont"

    # Only previews are written: no ZIP, no converted font, and nothing for what stays out.
    written = sorted(str(p.relative_to(out / "catalog")).replace("\\", "/") for p in (out / "catalog").rglob("*") if p.is_file())
    assert written == sorted(f"{s}/preview.woff2" for s in ["ibm-plex-sans", "montserrat", "montserrat-vf", "reserved-mont"])

    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["googleFontsCommit"] == COMMIT and set(manifest["families"]) == set(states(result))
    assert manifest["families"]["mixed"]["note"] == "Bulgarian locl in 1 of 2 files"
    assert manifest["families"]["montserrat"]["status"] == "convert" and manifest["families"]["montserrat"]["commit"] == COMMIT
    assert set(manifest["families"]["montserrat"]) == {"name", "status", "inputHash", "slug", "commit"}  # no cache


def test_a_second_run_gives_the_same_files(cache, tmp_path):
    out = tmp_path / "out"
    quiet(options(cache, out))
    files = {p: p.read_bytes() for p in out.rglob("*") if p.is_file()}
    quiet(options(cache, out))
    assert {p: p.read_bytes() for p in out.rglob("*") if p.is_file()} == files


def test_an_unchanged_family_keeps_its_old_address_when_google_fonts_moves_on(cache, tmp_path, monkeypatch):
    out = tmp_path / "out"
    quiet(options(cache, out))
    (cache / "ofl" / "montserratvf" / "OFL.txt").write_text("Copyright 2020 Someone.\n", encoding="utf-8")
    monkeypatch.setattr(gfonts, "ensure_checkout", lambda cache, update=False: LATER)
    quiet(options(cache, out))
    by_slug = {f["slug"]: f for f in json.loads((out / "catalog.json").read_text(encoding="utf-8"))["fonts"]}
    assert COMMIT in by_slug["montserrat"]["files"][0]["url"]  # same bytes as before: the address is still right
    assert LATER in by_slug["montserrat-vf"]["files"][0]["url"]  # its license changed: pinned to the commit that was checked
    assert json.loads((out / "catalog.json").read_text(encoding="utf-8"))["googleFontsCommit"] == LATER


def test_a_family_that_stops_qualifying_disappears_on_a_full_run(cache, tmp_path):
    out = tmp_path / "out"
    quiet(options(cache, out))
    (cache / "ofl" / "montserratvf" / "METADATA.pb").write_text('name: "Montserrat VF"\nsubsets: "latin"\n', encoding="utf-8")
    quiet(options(cache, out))
    assert not (out / "catalog" / "montserrat-vf").exists()
    assert "montserrat-vf" not in (out / "catalog.json").read_text(encoding="utf-8")


def test_a_family_that_fails_the_gate_stays_out_and_is_reported(cache, tmp_path, monkeypatch):
    from langbg_catalog import build

    monkeypatch.setattr(build, "verify", lambda *args: ["the shaping differs"])
    out = tmp_path / "out"
    result = quiet(options(cache, out))
    assert states(result)["montserrat"] == "failed" and states(result)["reservedmont"] == "failed"
    assert states(result)["ibmplexsans"] == "native"  # nothing to convert, so nothing to fail
    document = json.loads((out / "catalog.json").read_text(encoding="utf-8"))
    assert [f["slug"] for f in document["fonts"]] == ["ibm-plex-sans"]
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert "the shaping differs" in manifest["families"]["montserrat"]["problems"][0]
    assert "FAILED" in report.render(result, dry_run=False)
    assert not (out / "catalog" / "montserrat").exists()


def test_a_family_without_a_license_file_cannot_be_offered(cache, tmp_path):
    (cache / "ofl" / "montserrat" / "OFL.txt").unlink()
    result = quiet(options(cache, tmp_path / "out"))
    assert states(result)["montserrat"] == "error"
    assert "OFL.txt" in next(o for o in result.outcomes if o.slug == "montserrat").problems[0]


def test_a_partial_run_is_a_sample_and_touches_only_what_it_was_asked_for(cache, tmp_path):
    out = tmp_path / "out"
    quiet(options(cache, out))
    partial = quiet(options(cache, out, only=["ptsans", "montserrat"], full=False))
    assert [o.family.meta.directory for o in partial.outcomes] == ["ptsans", "montserrat"]
    assert (out / "catalog" / "ibm-plex-sans" / "preview.woff2").is_file()  # not removed
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert "ibmplexsans" in manifest["families"]
    assert json.loads((out / "catalog.json").read_text(encoding="utf-8"))["mock"] is True


def test_a_dry_run_does_everything_and_writes_nothing(cache, tmp_path):
    out = tmp_path / "out"
    result = quiet(options(cache, out, dry_run=True))
    assert states(result)["montserrat"] == "convert" and states(result)["reservedmont"] == "convert" and not result.written
    assert all(o.preview_bytes > 0 for o in result.outcomes if o.state in ("convert", "native"))
    assert result.catalog_bytes > 1000
    assert not out.exists()


def test_a_dry_run_that_finds_a_problem_says_so(cache, tmp_path, monkeypatch):
    from langbg_catalog import build

    monkeypatch.setattr(build, "verify", lambda *args: ["the shaping differs"])
    assert states(quiet(options(cache, tmp_path / "out", dry_run=True)))["montserrat"] == "failed"


def test_the_report_counts_the_groups_and_the_site(cache, tmp_path):
    text = report.render(quiet(options(cache, tmp_path / "out", dry_run=True)), dry_run=True)
    assert "(a) convert in one click: **3**" in text
    assert "(b) works in Figma already, enable ssXX: **1**" in text
    assert "(c)" not in text
    assert "2 of the listed fonts have a license that reserves a font name" in text
    assert "left out of the catalog: no Bulgarian forms 1, partial 1" in text
    assert "Partial, left out" in text and "- Mixed (`mixed`): Bulgarian locl in 1 of 2 files" in text
    assert "Previews:" in text and "No converted font and no ZIP is hosted" in text
    assert "| Montserrat (`montserrat`) | (a) one click |" in text
    assert "Not on fonts.google.com yet" in text and "- Reserved Mont (`reservedmont`)" in text


def test_the_google_fonts_link_appears_once_the_site_lists_the_family(cache, tmp_path, monkeypatch):
    out = tmp_path / "out"
    quiet(options(cache, out))
    monkeypatch.setattr(gfonts, "live_families", lambda: {"Montserrat", "Montserrat VF", "IBM Plex Sans", "Reserved Mont"})
    quiet(options(cache, out))
    fonts = {f["slug"]: f for f in json.loads((out / "catalog.json").read_text(encoding="utf-8"))["fonts"]}
    assert fonts["reserved-mont"]["googleFontsUrl"] == "https://fonts.google.com/specimen/Reserved+Mont"


def test_a_run_stops_when_the_google_fonts_listing_cannot_be_read(cache, tmp_path, monkeypatch):
    def unreachable():
        raise OSError("no network")

    monkeypatch.setattr(gfonts, "live_families", unreachable)
    with pytest.raises(OSError):
        quiet(options(cache, tmp_path / "out"))
    assert not (tmp_path / "out" / "catalog.json").exists()


def test_the_google_fonts_listing_is_read_past_its_prefix(tmp_path, monkeypatch):
    monkeypatch.undo()  # the real reader, not the fake listing of conftest
    page = tmp_path / "metadata.json"
    page.write_text(')]}\'\n{"familyMetadataList": [{"family": "Montserrat"}, {"family": "Source Sans 3"}]}', encoding="utf-8")
    assert gfonts.live_families(page.as_uri()) == {"Montserrat", "Source Sans 3"}


def test_unknown_folder_names_are_refused(cache, tmp_path):
    with pytest.raises(SystemExit, match="nosuchfamily"):
        quiet(options(cache, tmp_path / "out", only=["nosuchfamily"], full=False))


def test_cli_partial_runs_need_a_trial_folder_or_a_named_data_file(cache, tmp_path, capsys):
    assert cli.main(["--cache", str(cache), "build", "--only", "montserrat"]) == 2
    assert "--trial" in capsys.readouterr().err
    out = tmp_path / "named"
    assert cli.main(["--cache", str(cache), "build", "--only", "ptsans", "--data-file", str(out / "c.json"),
                     "--assets-dir", str(out / "a"), "--manifest", str(out / "m.json"), "--report", str(out / "r.md")]) == 0
    assert (out / "c.json").is_file()


def test_cli_trial_run_writes_the_report_and_everything_under_the_folder(cache, tmp_path, capsys):
    trial = tmp_path / "trial"
    code = cli.main(["--cache", str(cache), "build", "--only", "montserrat,ibmplexsans,reservedmont,ptsans", "--trial", str(trial)])
    assert code == 0
    for name in ("catalog.json", "manifest.json", "report.md"):
        assert (trial / name).is_file()
    text = (trial / "report.md").read_text(encoding="utf-8")
    assert "Montserrat (`montserrat`)" in text and "license reserves: Montserrat" in text and "enable ss06" in text
    assert "Montserrat BG" in capsys.readouterr().out


def test_a_font_with_a_locl_that_changes_nothing_visible_stays_out(cache, tmp_path, monkeypatch):
    from langbg_catalog import pipeline

    asked: list[str] = []

    def invisible(family, cache_dir):
        asked.append(family.meta.directory)
        return family.meta.directory != "montserrat"

    monkeypatch.setattr(pipeline, "is_visible", invisible)
    out = tmp_path / "out"
    first = quiet(options(cache, out))
    assert states(first)["montserrat"] == "no_change" and states(first)["montserratvf"] == "convert"
    assert "montserrat" not in {f["slug"] for f in json.loads((out / "catalog.json").read_text(encoding="utf-8"))["fonts"]}
    assert not (out / "catalog" / "montserrat").exists()
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8"))["families"]["montserrat"]["status"] == "no_change"
    assert "locl changes nothing visible" in report.render(first, dry_run=False)
    assert "montserrat" in asked  # asked on every run: nothing is remembered from the last one


def test_the_report_is_the_same_text_on_every_run_with_the_same_input(cache, tmp_path):
    """The monthly job commits report.md: a date in it would make a commit of every run that changed nothing."""
    first = report.render(quiet(options(cache, tmp_path / "a", dry_run=True)), dry_run=True)
    second = report.render(quiet(options(cache, tmp_path / "b", dry_run=True)), dry_run=True)
    assert first == second and "20" not in first.splitlines()[0]
