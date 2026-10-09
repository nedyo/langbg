"""Command line: `langbg-catalog build`."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import report
from .entries import write_if_changed
from .pipeline import Options, run

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / "catalog"
DEFAULT_CACHE = CATALOG / ".cache" / "google-fonts"


def cmd_build(args: argparse.Namespace) -> int:
    only = [d for d in (args.only or "").split(",") if d.strip()]
    partial = bool(only or args.limit)
    if partial and not (args.trial or args.data_file or args.dry_run):
        print(
            "--only/--limit process part of the catalog; give --trial DIR so the partial result goes "
            "there (or name --data-file yourself): it must not replace web/src/data/catalog.json by accident.",
            file=sys.stderr,
        )
        return 2
    if args.trial:
        base = Path(args.trial).resolve()
        defaults = dict(assets_dir=base / "catalog", data_file=base / "catalog.json", manifest=base / "manifest.json", report=base / "report.md")
    else:
        defaults = dict(
            assets_dir=ROOT / "web" / "public" / "catalog",
            data_file=ROOT / "web" / "src" / "data" / "catalog.json",
            manifest=CATALOG / "manifest.json",
            report=CATALOG / "report.md",
        )
    opts = Options(
        cache=Path(args.cache),
        assets_dir=Path(args.assets_dir or defaults["assets_dir"]),
        data_file=Path(args.data_file or defaults["data_file"]),
        manifest=Path(args.manifest or defaults["manifest"]),
        report=Path(args.report or defaults["report"]),
        base_url=args.base_url.rstrip("/"),
        only=only,
        limit=args.limit,
        update=args.update,
        dry_run=args.dry_run,
        full=not partial,
    )
    result = run(opts)
    text = report.render(result, args.dry_run)
    print("\n" + text)
    if not args.dry_run:
        write_if_changed(opts.report, text)
        print(f"Wrote {opts.data_file}, {opts.manifest}, {opts.report} and the files under {opts.assets_dir}")
    failed = [o for o in result.outcomes if o.state in ("failed", "error")]
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="langbg-catalog", description="Build the langbg font catalog from google/fonts.")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE), help="where the sparse checkout of google/fonts lives")
    parser.add_argument("--update", action="store_true", help="move the checkout to the latest google/fonts main first")
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="scan, check the conversion, cut the previews and write catalog.json")
    b.add_argument("--only", help="comma-separated ofl/ folder names, e.g. montserrat,ibmplexsans")
    b.add_argument("--limit", type=int, help="process only the first N families with the cyrillic subset")
    b.add_argument("--trial", help="write every output under this folder instead of web/ and catalog/ (needed with --only/--limit)")
    b.add_argument("--dry-run", action="store_true", help="do everything in memory and print the report; nothing is written")
    b.add_argument("--assets-dir", help="folder for <slug>/preview.woff2 (default web/public/catalog)")
    b.add_argument("--data-file", help="catalog.json to write (default web/src/data/catalog.json)")
    b.add_argument("--manifest", help="manifest.json (default catalog/manifest.json)")
    b.add_argument("--report", help="report.md (default catalog/report.md)")
    b.add_argument("--base-url", default="/catalog", help="URL prefix of the previews in catalog.json (default /catalog)")
    b.set_defaults(func=cmd_build)

    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
