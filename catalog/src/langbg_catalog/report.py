"""The report of a run: what happened to every family, the three groups of the catalog, and what the site weighs."""

from __future__ import annotations

from collections import Counter

from .pipeline import Outcome, Run

LABELS = {
    "convert": "(a) one click",
    "native": "(b) works already",
    "no_bgr": "no Bulgarian forms",
    "no_change": "locl changes nothing visible",
    "partial": "partial",
    "error": "error",
    "failed": "FAILED",
}
GROUP_TITLES = {
    "convert": "(a) convert in one click",
    "native": "(b) works in Figma already, enable ssXX",
}


def _kb(size: int) -> str:
    return f"{size / 1000:.0f} KB" if size else "-"


def _mb(size: float) -> str:
    return f"{size / 1_000_000:.1f} MB"


def _note(o: Outcome) -> str:
    f = o.family
    if o.state == "convert":
        name = o.built.converted_name if o.built else ""
        return name + (f"; license reserves: {', '.join(f.reserved)}" if f.reserved else "")
    if o.state == "native":
        return f"enable {f.native_set}" + (f"; also reserves: {', '.join(f.reserved)}" if f.reserved else "")
    if o.problems:
        return "; ".join(o.problems[:2])
    return f.note


def counts(outcomes: list[Outcome]) -> Counter[str]:
    return Counter(o.state for o in outcomes)


def render(run: Run, dry_run: bool) -> str:
    outcomes = run.outcomes
    by_state = counts(outcomes)
    lines = [
        "# langbg catalog report",
        "",
        f"google/fonts commit `{run.commit[:10]}`: {run.cyrillic_families} families with the cyrillic subset "
        f"({run.skipped_by_metadata} without), {len(outcomes)} processed in this run"
        + (" (dry run: nothing was written)." if dry_run else "."),
        "",
        "| Family | Result | Files | Original | Preview | Notes |",
        "|---|---|---:|---:|---:|---|",
    ]
    for o in outcomes:
        lines.append(
            f"| {o.family.meta.name} (`{o.family.meta.directory}`) | {LABELS.get(o.state, o.state)} | {len(o.family.files)} "
            f"| {_mb(o.family.original_bytes)} | {_kb(o.preview_bytes)} | {_note(o)} |"
        )

    lines += ["", "## Groups", ""]
    for state, title in GROUP_TITLES.items():
        lines.append(f"- {title}: **{by_state.get(state, 0)}**")
    left_out = [(label, by_state[state]) for state, label in LABELS.items() if state not in GROUP_TITLES and by_state.get(state)]
    lines.append("- left out of the catalog: " + (", ".join(f"{label} {n}" for label, n in left_out) or "none"))
    partial = [o for o in outcomes if o.state == "partial"]
    if partial:
        lines += [
            "",
            "Partial, left out (only some files of the family have Bulgarian forms; a half-converted family would be worse than none):",
            "",
            *(f"- {o.family.meta.name} (`{o.family.meta.directory}`): {o.family.note}" for o in partial),
            "",
        ]
    if run.metadata_problems:
        lines.append(f"- METADATA.pb that could not be read: {', '.join(sorted(run.metadata_problems))}")

    unlisted = [o for o in outcomes if o.state in GROUP_TITLES and not o.on_google_fonts]
    if unlisted:
        lines += [
            "",
            "Not on fonts.google.com yet (in google/fonts only; their page links to the source until a later run finds them):",
            "",
            *(f"- {o.family.meta.name} (`{o.family.meta.directory}`)" for o in unlisted),
        ]

    reserved = [o for o in outcomes if o.state in GROUP_TITLES and o.family.reserved]
    if reserved:
        lines += [
            "",
            f"{len(reserved)} of the listed fonts have a license that reserves a font name. They convert like any other "
            "(\"<family> BG\"); their page carries one informational line.",
        ]

    published = [o for o in outcomes if o.state in GROUP_TITLES]
    previews = sum(o.preview_bytes for o in published)
    lines += ["", "## Size of the site", ""]
    lines.append(f"- Original fonts read in this run: {_mb(sum(o.family.original_bytes for o in outcomes))} for {len(outcomes)} families")
    if published:
        largest = max(published, key=lambda o: o.preview_bytes)
        lines.append(
            f"- Previews: {_mb(previews)} for {len(published)} families "
            f"(average {_kb(round(previews / len(published)))}, largest {_kb(largest.preview_bytes)}: {largest.family.meta.name})"
        )
        lines.append(f"- catalog.json: {_kb(run.catalog_bytes)}")
        scope = "" if len(outcomes) == run.cyrillic_families else f" (only {len(outcomes)} of {run.cyrillic_families} cyrillic families)"
        lines.append(f"- **Together: {_mb(previews + run.catalog_bytes)}**{scope}. No converted font and no ZIP is hosted.")
    return "\n".join(lines) + "\n"
