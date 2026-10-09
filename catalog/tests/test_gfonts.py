from __future__ import annotations

import pytest

from langbg_catalog.gfonts import load_families, parse_metadata, parse_textproto

SAMPLE = '''# a comment
name: "Montserrat"
designer: "Julieta Ulanovsky, Sol Matas"
license: "OFL"
fonts {
  name: "Montserrat"
  style: "italic"
  weight: 400
  filename: "Montserrat-Italic[wght].ttf"
}
fonts {
  name: "Montserrat"
  style: "normal"
  weight: 400
  filename: "Montserrat[wght].ttf"
}
subsets: "cyrillic"
subsets: "latin"
axes {
  tag: "wght"
  min_value: 100.0
  max_value: 900.0
}
source {
  repository_url: "https://github.com/JulietaUla/Montserrat"
  commit: "cc8daf2"
  files {
    source_file: "OFL.txt"
  }
}
fallbacks {
  axis_target {
    tag: "ital"
    min_value: 0.0
  }
}
'''


def test_parse_metadata_reads_what_the_catalog_needs():
    meta = parse_metadata("montserrat", SAMPLE)
    assert (meta.directory, meta.name, meta.designer) == ("montserrat", "Montserrat", "Julieta Ulanovsky, Sol Matas")
    assert [(f.filename, f.style, f.weight) for f in meta.files] == [
        ("Montserrat-Italic[wght].ttf", "italic", 400),
        ("Montserrat[wght].ttf", "normal", 400),
    ]
    assert meta.axes == (("wght", 100.0, 900.0),)  # not the `fallbacks { axis_target { tag } }` further down
    assert meta.repository_url == "https://github.com/JulietaUla/Montserrat" and meta.commit == "cc8daf2"
    assert meta.has_cyrillic


def test_a_family_without_the_cyrillic_subset():
    meta = parse_metadata("x", 'name: "X"\nsubsets: "latin"\nsubsets: "menu"\n')
    assert not meta.has_cyrillic and meta.files == () and meta.axes == ()


def test_adjacent_strings_are_one_string_and_escapes_work():
    data = parse_textproto('text:\n  "def f():\\n"\n  "  print(\\"hi\\")\\n"\nafter: 1\n')
    assert data == {"text": ['def f():\n  print("hi")\n'], "after": [1]}


def test_scalars_keep_their_type():
    data = parse_textproto("a: 400\nb: 105.47\nc: true\nd: SANS_SERIF\n")
    assert data == {"a": [400], "b": [105.47], "c": [True], "d": ["SANS_SERIF"]}


@pytest.mark.parametrize("text", ['name "X"', "name: ", "fonts {", "}", "a: { b: 1"])
def test_broken_metadata_is_an_error_not_a_crash(text):
    with pytest.raises(ValueError):
        parse_textproto(text)


def test_load_families_reports_the_unreadable_ones(cache):
    (cache / "ofl" / "broken").mkdir()
    (cache / "ofl" / "broken" / "METADATA.pb").write_text("fonts {", encoding="utf-8")
    families, problems = load_families(cache)
    assert {f.directory for f in families} >= {"montserrat", "ptsans", "latinonly"}
    assert list(problems) == ["broken"]
