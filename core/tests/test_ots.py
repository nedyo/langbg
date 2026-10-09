"""Every output passes the OpenType Sanitizer (what browsers use to validate fonts)."""

from __future__ import annotations

import ots

from conftest import converted_bytes, original_bytes


def sanitize(tmp_path, name: str, data: bytes):
    src = tmp_path / name
    src.write_bytes(data)
    return ots.sanitize(str(src), str(tmp_path / f"{name}.ots"), capture_output=True)


def test_ots_passes(case, mode, tmp_path):
    baseline = sanitize(tmp_path, "orig" + case.path.suffix, original_bytes(case.path))
    assert baseline.returncode == 0, baseline.stderr  # the fixture itself is valid
    result = sanitize(tmp_path, "conv" + case.path.suffix, converted_bytes(case, mode))
    assert result.returncode == 0, result.stderr
