"""The whole run: check out, scan, prove the conversion, cut the preview, write.

Per family the scan decides a group: convert (one click) or native (works already with a stylistic
set). Families without Bulgarian forms stay out. A Reserved Font Name is only recorded, for one line
on the page. What goes to the site is small: catalog.json and one preview font per family.

Every run does everything again (a few minutes a month). The one thing taken from the last run is the
google/fonts commit each family's addresses point at, kept in manifest.json with the input hash.
"""

from __future__ import annotations

import json
import shutil
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import entries, gfonts
from . import scan as scanning
from .build import PREVIEW_NAME, Built, check_conversion, is_visible, make_preview

MANIFEST_SCHEMA = 2
PUBLISHED = (scanning.CONVERT, scanning.NATIVE)


@dataclass
class Options:
    cache: Path
    assets_dir: Path
    data_file: Path
    manifest: Path
    report: Path
    base_url: str = "/catalog"
    only: list[str] = field(default_factory=list)
    limit: int | None = None
    update: bool = False
    dry_run: bool = False  # everything is done, nothing is written
    full: bool = True  # every Cyrillic family is processed: a stale folder may be removed, the catalog is not a sample


@dataclass
class Outcome:
    family: scanning.FamilyScan
    slug: str
    state: str  # convert | native | no_bgr | no_change | partial | error | failed
    built: Built | None = None
    preview_bytes: int = 0
    commit: str = ""  # the google/fonts commit the catalog's addresses for this family point at
    on_google_fonts: bool = True  # fonts.google.com lists it (only looked up for published families)
    problems: list[str] = field(default_factory=list)


@dataclass
class Run:
    commit: str
    outcomes: list[Outcome]
    cyrillic_families: int  # in all of google/fonts
    skipped_by_metadata: int  # families without the cyrillic subset
    metadata_problems: dict[str, str]
    catalog_bytes: int = 0
    written: bool = False


def _load_manifest(path: Path) -> dict[str, Any]:
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("schema") == MANIFEST_SCHEMA:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return {"schema": MANIFEST_SCHEMA, "families": {}}


def select(families: list[gfonts.FamilyMeta], only: list[str], limit: int | None) -> list[gfonts.FamilyMeta]:
    candidates = [f for f in families if f.has_cyrillic]
    if only:
        known = {f.directory for f in families}
        unknown = [d for d in only if d not in known]
        if unknown:
            raise SystemExit(f"Unknown family folder(s) in google/fonts ofl/: {', '.join(unknown)}")
        chosen = [f for f in families if f.directory in only]
        missing = [f.directory for f in chosen if not f.has_cyrillic]
        if missing:
            print(f"note: {', '.join(missing)} has no cyrillic subset in METADATA.pb; scanned anyway", file=sys.stderr)
        return sorted(chosen, key=lambda f: only.index(f.directory))
    return candidates[:limit] if limit else candidates


def _pinned_commit(old: dict[str, Any] | None, family: scanning.FamilyScan, commit: str) -> str:
    """The address of a family keeps pointing at the commit where its files last changed, so a monthly
    run rewrites no addresses of families that did not change."""
    if old and old.get("commit") and old.get("inputHash") == family.input_hash:
        return old["commit"]
    return commit


def run(opts: Options, log: Callable[[str], None] = print) -> Run:
    commit = gfonts.ensure_checkout(opts.cache, update=opts.update)
    families, problems = gfonts.load_families(opts.cache)
    chosen = select(families, opts.only, opts.limit)
    log(f"google/fonts@{commit[:7]}: {len(families)} families, {sum(f.has_cyrillic for f in families)} with cyrillic; processing {len(chosen)}")
    gfonts.fetch_fonts(opts.cache, [f.directory for f in chosen])

    slugs = entries.unique_slugs([f for f in families if f.has_cyrillic or f.directory in opts.only])
    old_records: dict[str, Any] = _load_manifest(opts.manifest)["families"]
    # A partial run keeps what it did not touch; a full run forgets families that left google/fonts.
    records: dict[str, Any] = {} if opts.full else dict(old_records)
    outcomes: list[Outcome] = []
    previews: dict[str, bytes] = {}

    for index, meta in enumerate(chosen, 1):
        family = scanning.scan_family(opts.cache, meta)
        slug = slugs[meta.directory]
        pinned = _pinned_commit(old_records.get(meta.directory), family, commit)
        outcome = Outcome(family=family, slug=slug, state=family.status, commit=pinned)
        if family.status == scanning.ERROR:
            outcome.problems.append(family.note)

        # A font can have a BGR locl whose forms look exactly like the default ones. Nothing to convert.
        if family.status in PUBLISHED and not is_visible(family, opts.cache):
            outcome.state = "no_change"
        if outcome.state == scanning.CONVERT:
            outcome.built = check_conversion(family, opts.cache)
            outcome.problems += outcome.built.problems
        if outcome.state in PUBLISHED and not outcome.problems:
            preview = make_preview(family, opts.cache)
            outcome.problems += preview.problems
            outcome.preview_bytes = len(preview.data)
            if preview.ok:
                previews[slug] = preview.data
        if outcome.problems and outcome.state in PUBLISHED:
            outcome.state = "failed"

        record: dict[str, Any] = {
            "name": meta.name,
            "status": outcome.state,
            "inputHash": family.input_hash,
            "slug": slug,
            "commit": pinned,
        }
        if family.note:
            record["note"] = family.note
        if outcome.problems and outcome.state in ("failed", "error"):
            record["problems"] = outcome.problems[:5]
        records[meta.directory] = record
        outcomes.append(outcome)
        log(f"[{index}/{len(chosen)}] {meta.directory}: {outcome.state}" + (f" ({outcome.problems[0]})" if outcome.problems else ""))

    published = [o for o in outcomes if o.state in PUBLISHED]
    live = gfonts.live_families() if published else set()
    for o in published:
        o.on_google_fonts = o.family.meta.name in live
    items = [
        entries.entry(o.family, o.slug, o.built.converted_name if o.built else None, o.commit, opts.base_url, o.on_google_fonts)
        for o in published
    ]
    catalog_text = entries.dump(entries.catalog_document(items, commit, sample=not opts.full))
    result = Run(
        commit=commit,
        outcomes=outcomes,
        cyrillic_families=sum(f.has_cyrillic for f in families),
        skipped_by_metadata=sum(not f.has_cyrillic for f in families),
        metadata_problems=problems,
        catalog_bytes=len(catalog_text.encode("utf-8")),
    )
    if opts.dry_run:
        return result

    for slug, data in previews.items():
        target = opts.assets_dir / slug / PREVIEW_NAME
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    entries.write_if_changed(opts.data_file, catalog_text)
    manifest = {"schema": MANIFEST_SCHEMA, "googleFontsCommit": commit, "families": records}
    entries.write_if_changed(opts.manifest, entries.dump(manifest))
    if opts.full and opts.assets_dir.is_dir():
        keep = {o.slug for o in published}
        for folder in opts.assets_dir.iterdir():
            if folder.is_dir() and folder.name not in keep:
                shutil.rmtree(folder)
    result.written = True
    return result
