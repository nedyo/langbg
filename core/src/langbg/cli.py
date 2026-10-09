"""Command line: `langbg analyze` and `langbg convert`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import naming
from .bytes_api import output_filename
from .core import MODES, analyze, convert
from .errors import LangbgError
from .fontio import font_extension, load_font, save_font
from .gsub import LANGSYS_MISMATCH


def _read_ofl(font_path: Path, explicit: Path | None) -> str | None:
    path = explicit or font_path.with_name("OFL.txt")
    if path.is_file():
        return path.read_text(encoding="utf-8-sig", errors="replace")
    return None


def _print_report(path: Path, report) -> None:
    print(f"{path.name}: {report.family} ({report.ps_name})")
    if not report.has_bgr_locl:
        print("  No Bulgarian forms (no 'locl' for BGR). Nothing to convert.")
        return
    print(f"  Bulgarian locl in scripts: {', '.join(report.scripts)}")
    for lk in report.lookups:
        extra = f", {lk.rule_count} rules" if lk.rule_count is not None else ""
        via = " (via context)" if lk.via_context else ""
        print(f"  Lookup {lk.index}: type {lk.type} {lk.kind}{extra}{via}")
    print(f"  Characters ({len(report.codepoints)}): {report.characters}")
    if report.is_variable:
        print(f"  Variable font; locl changed by FeatureVariations: {report.locl_varied_by_feature_variations}")
    if report.reserved_font_names:
        print(f"  Reserved Font Names: {', '.join(report.reserved_font_names)} (for your own use; do not redistribute the copy)")
    if report.already_converted:
        print("  Already converted by langBG.")
    for ss in report.bulgarian_stylistic_sets:
        label = f" ({ss.ui_name})" if ss.ui_name else ""
        print(f"  Already works via stylistic set {ss.tag}{label} in {', '.join(ss.scripts)}: no conversion needed.")
    for w in report.warnings:
        print(f"  Warning: {_describe_warning(w)}")


def _describe_warning(warning: dict) -> str:
    if warning["code"] == LANGSYS_MISMATCH:
        return (
            f"script '{warning['script']}': the BGR language system differs from the default beyond locl "
            f"(only in BGR: {warning['only_bgr']}, only in default: {warning['only_default']})"
        )
    return str(warning)


def _failure(path: Path, exc: Exception) -> None:
    # One bad file must not stop the batch; fontTools errors are not LangbgErrors.
    message = str(exc) if isinstance(exc, (OSError, LangbgError)) else f"{type(exc).__name__}: {exc}"
    print(f"{path.name}: error: {message}", file=sys.stderr)


def cmd_analyze(args) -> int:
    results = []
    status = 0
    for p in args.files:
        path = Path(p)
        try:
            font = load_font(path.read_bytes())
            report = analyze(font, _read_ofl(path, args.ofl))
        except Exception as e:  # noqa: BLE001 - per-file boundary
            _failure(path, e)
            status = 1
            continue
        if args.json:
            results.append({"file": str(path), **report.to_dict()})
        else:
            _print_report(path, report)
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    return status


def cmd_convert(args) -> int:
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    status = 0
    for p in args.files:
        path = Path(p)
        try:
            font = load_font(path.read_bytes())
            old_ps_family = naming.current_ps_family(font)
            new_font, report = convert(
                font,
                mode=args.mode,
                family_suffix=args.suffix,
                family_name=args.name,
            )
            new_ps_family = naming.current_ps_family(new_font)
            ext = font_extension(new_font)
            data = save_font(new_font)
        except Exception as e:  # noqa: BLE001 - per-file boundary
            _failure(path, e)
            status = 1
            continue
        target = out_dir / output_filename(path.name, old_ps_family, new_ps_family, ext)
        target.write_bytes(data)
        extra = f", stylistic set {report.output.stylistic_set}" if report.output.stylistic_set else ""
        print(f"{path.name} -> {target} ({report.output.family}{extra})")
    return status


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="langbg", description="Make Bulgarian Cyrillic forms work in Figma."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    a = sub.add_parser("analyze", help="report Bulgarian forms in fonts")
    a.add_argument("files", nargs="+")
    a.add_argument("--json", action="store_true", help="print JSON")
    a.add_argument("--ofl", type=Path, help="OFL.txt to read Reserved Font Names from")
    a.set_defaults(func=cmd_analyze)

    c = sub.add_parser("convert", help="convert fonts")
    c.add_argument("files", nargs="+")
    c.add_argument("--mode", choices=MODES, default="default")
    c.add_argument("--suffix", default=" BG", help='family suffix (default: " BG")')
    c.add_argument("--name", help="new family name (overrides --suffix)")
    c.add_argument("-o", "--output", required=True, help="output folder")
    c.set_defaults(func=cmd_convert)
    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
