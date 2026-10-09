// The converter: drop fonts -> report -> name -> convert -> preview -> ZIP. Vanilla TS.
//
// The page is server-rendered (components/Converter.astro and Preview.astro); this script finds
// the elements by id and fills them in. Every string comes from the JSON that the server put
// into the page in the visitor's language, so nothing here is translated and the two languages
// never meet in one view. All text is built with DOM APIs (never innerHTML): font names come
// from the dropped files.

import { format } from "../i18n/format";
import type { Dict, Lang } from "../i18n/ui";
import { ConverterClient, runWhenIdle } from "./client";
import { $ } from "./dom";
import { downloadBlob } from "./download";
import { describeError as describeErrorIn } from "./errors";
import { applySample, loadFace, resetSample, unloadFace, type LoadedFace } from "./preview";
import { progressText } from "./progress";
import type { ConvertOptions, CoreError, CoreWarning, FileAnalysis, FileConversion, Mode, Report } from "./protocol";
import type { ReadmePair } from "./readme";
import { buildZip } from "./zip";

interface IslandData {
  lang: Lang;
  converter: Dict["converter"];
  preview: Dict["preview"];
  pangram: string;
}

const island = JSON.parse(document.getElementById("island-data")?.textContent ?? "null") as IslandData | null;
if (!island) throw new Error("The converter's text is missing from the page.");
const c = island.converter;
const p = island.preview;

const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];

interface Entry {
  id: number;
  name: string;
  data: ArrayBuffer;
  isLicense: boolean;
}

// --- tiny DOM helpers -----------------------------------------------------------

interface ElProps {
  className?: string;
  testid?: string;
  attrs?: Record<string, string>;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.testid) node.dataset.testid = props.testid;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

const panel = (kind: "ok" | "warn" | "bad" | "plain", testid: string | undefined, ...children: (Node | string)[]) =>
  el("p", { className: kind === "plain" ? "panel" : `panel panel-${kind}`, testid }, ...children);

const unique = <T>(items: T[]): T[] => [...new Set(items)];

// --- state ----------------------------------------------------------------------

const client = new ConverterClient();
let entries: Entry[] = [];
let nextEntryId = 1;
let analyses = new Map<number, FileAnalysis>();
let conversions = new Map<number, FileConversion>();
let analysisRun = 0;
let convertRun = 0;
let analyzing = false;
let converting = false;
let faces: { original?: LoadedFace; converted?: LoadedFace } = {};
let previewRun = 0;
const fonts = () => entries.filter((e) => !e.isLicense);
const licenses = () => entries.filter((e) => e.isLicense);

/** The fonts on the page that converted, with their results. Never a result of a file that was removed. */
function converted(): { entry: Entry; conversion: Extract<FileConversion, { ok: true }> }[] {
  return fonts().flatMap((entry) => {
    const conversion = conversions.get(entry.id);
    return conversion?.ok ? [{ entry, conversion }] : [];
  });
}

function licenseText(): string | undefined {
  const decoder = new TextDecoder("utf-8");
  const text = licenses().map((e) => decoder.decode(e.data)).join("\n\n");
  return text || undefined;
}

function reportOf(entry: Entry): Report | undefined {
  const analysis = analyses.get(entry.id);
  return analysis?.ok ? analysis.report : undefined;
}

/** Fonts we can and should convert: readable, with Bulgarian forms, not already converted. */
function eligible(): Entry[] {
  return fonts().filter((e) => {
    const report = reportOf(e);
    return !!report?.has_bgr_locl && !report.already_converted;
  });
}

// --- messages -------------------------------------------------------------------

const describeError = (error: CoreError): string => describeErrorIn(c.errors, error);

function setStatus(text: string, stage?: string): void {
  const status = $("runtime-status");
  status.textContent = text;
  if (stage) status.dataset.stage = stage;
}

client.onProgress = (event) => setStatus(progressText(c.runtime, event), event.stage === "file" ? undefined : event.stage);

function showRuntimeError(error: unknown): void {
  setStatus(format(c.runtime.error, { message: error instanceof Error ? error.message : String(error) }), "error");
}

// --- adding files ---------------------------------------------------------------

async function addFiles(files: Iterable<File>): Promise<void> {
  const skipped: string[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const isLicense = lower.endsWith(".txt");
    if (!isLicense && !FONT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      skipped.push(file.name);
      continue;
    }
    const data = await file.arrayBuffer();
    const duplicate = entries.some((e) => e.name === file.name && e.data.byteLength === data.byteLength);
    if (!duplicate) entries.push({ id: nextEntryId++, name: file.name, data, isLicense });
  }
  if (skipped.length) setStatus(format(c.runtime.skipped, { names: skipped.join(", ") }));
  resetConversions();
  await refreshAnalysis();
}

function resetConversions(): void {
  // A conversion still running belongs to the files as they were: its results must not come back.
  convertRun++;
  converting = false;
  conversions = new Map();
  renderResults();
  void refreshPreview();
}

async function clearAll(): Promise<void> {
  entries = [];
  analyses = new Map();
  analysisRun++;
  $<HTMLInputElement>("family-name").value = "";
  $<HTMLInputElement>("naming-suffix").checked = true;
  resetConversions();
  renderReports();
  renderOptions();
}

// --- analysis -------------------------------------------------------------------

async function refreshAnalysis(): Promise<void> {
  const run = ++analysisRun;
  const list = fonts();
  if (!list.length) {
    analyses = new Map();
    analyzing = false;
    renderReports();
    renderOptions();
    return;
  }
  analyzing = true;
  renderOptions();
  try {
    const results = await client.analyze(list.map((e) => ({ name: e.name, data: e.data })), licenseText());
    if (run !== analysisRun) return; // a newer drop superseded this one
    analyses = new Map(list.map((e, i): [number, FileAnalysis] => [e.id, results[i]]));
    setStatus(c.runtime.ready, "ready");
  } catch (error) {
    if (run !== analysisRun) return;
    const failure: CoreError = { code: "internal_error", message: String(error) };
    analyses = new Map(list.map((e): [number, FileAnalysis] => [e.id, { name: e.name, ok: false, error: failure }]));
    showRuntimeError(error);
  }
  analyzing = false;
  renderReports();
  renderOptions();
}

function describeWarning(warning: CoreWarning): string {
  const tags = (list: string[]) => (list.length ? list.join(", ") : c.report.none);
  return format(c.warnings[warning.code], {
    script: warning.script,
    onlyBgr: tags(warning.only_bgr),
    onlyDefault: tags(warning.only_default),
  });
}

function ssLabel(tag: string, name: string | null | undefined): string {
  return name ? format(c.report.ssNamed, { tag, name }) : tag;
}

function renderReports(): void {
  const container = $("reports");
  container.replaceChildren();
  $("clear").hidden = entries.length === 0;
  for (const entry of licenses()) {
    container.append(el("div", { className: "report", testid: "license" }, format(c.report.license, { name: entry.name })));
  }
  for (const entry of fonts()) {
    const analysis = analyses.get(entry.id);
    const box = el("div", { className: "report", testid: "report" }, el("div", { className: "report-name" }, entry.name));
    container.append(box);
    if (!analysis) {
      box.append(el("p", { className: "muted" }, c.report.analyzing));
    } else if (!analysis.ok) {
      box.append(panel("bad", undefined, describeError(analysis.error)));
    } else {
      renderReport(box, analysis.report);
    }
  }
}

function renderReport(box: HTMLElement, report: Report): void {
  if (!report.has_bgr_locl) {
    box.append(panel("bad", "no-bgr", c.notices.noBgr));
    return;
  }
  const facts = el("dl", { className: "facts" });
  const add = (label: string, value: string | Node, testid?: string) =>
    facts.append(el("dt", {}, label), el("dd", { testid }, value));

  add(c.report.family, report.family);
  if (report.designer) add(c.report.designer, report.designer);
  add(c.report.bulgarianForms, format(c.report.bulgarianFormsValue, { count: report.codepoints.length }));
  add(c.report.letters, el("span", { className: "glyphs", attrs: { lang: "bg" } }, [...report.characters].join(" ")));
  add(c.report.kind, [report.is_variable ? c.report.kindVariable : c.report.kindStatic, report.is_cff ? c.report.kindCff : c.report.kindTrueType].join(", "));

  // Two different things: the sets this font has, and the (usually fewer) sets that give Bulgarian forms.
  const tags = Object.keys(report.stylistic_set_names);
  add(c.report.ssInFont, tags.length ? tags.map((tag) => ssLabel(tag, report.stylistic_set_names[tag])).join(", ") : c.report.none, "ss-in-font");
  add(
    c.report.ssBulgarian,
    report.bulgarian_stylistic_sets.length ? report.bulgarian_stylistic_sets.map((s) => ssLabel(s.tag, s.ui_name)).join(", ") : c.report.none,
    "ss-bulgarian",
  );
  box.append(facts);

  if (report.already_converted) box.append(panel("plain", "already-converted", c.notices.alreadyConverted));
  for (const set of report.bulgarian_stylistic_sets) {
    box.append(panel("ok", "works-via-ss", format(c.notices.worksViaSs, { set: ssLabel(set.tag, set.ui_name) })));
  }
  if (report.locl_varied_by_feature_variations) box.append(panel("warn", undefined, c.notices.featureVariations));

  const details = el("details", { className: "report-more" }, el("summary", {}, c.report.technical));
  const technical = el("dl", { className: "facts" });
  technical.append(el("dt", {}, c.report.scripts), el("dd", {}, report.scripts.join(", ")));
  technical.append(
    el("dt", {}, c.report.lookups),
    el(
      "dd",
      {},
      report.lookups
        .map((l) =>
          l.rule_count != null
            ? format(c.report.lookupRules, { kind: l.kind, index: l.index, rules: l.rule_count })
            : format(c.report.lookupPlain, { kind: l.kind, index: l.index }),
        )
        .join(", "),
    ),
  );
  for (const warning of report.warnings) technical.append(el("dt", {}), el("dd", {}, describeWarning(warning)));
  details.append(technical);
  box.append(details);
}

// --- naming context and the options form -----------------------------------------

function namingContext() {
  const list = eligible();
  const reports = list.map((e) => reportOf(e)).filter((r): r is Report => !!r);
  return {
    list,
    families: unique(reports.map((r) => r.family)),
    reserved: unique(reports.flatMap((r) => r.reserved_font_names)),
  };
}

const isCustom = () => $<HTMLInputElement>("naming-custom").checked;

function renderOptions(): void {
  const ctx = namingContext();
  $("options").hidden = ctx.list.length === 0;

  // A Reserved Font Name is information only: one line, never in the way of converting or naming.
  const info = $("reserved-info");
  info.replaceChildren();
  info.hidden = ctx.reserved.length === 0;
  if (ctx.reserved.length) info.append(panel("warn", "rfn-info", c.notices.reservedName));

  const suffix = $<HTMLInputElement>("suffix").value.trim();
  $("suffix-result").textContent =
    suffix && ctx.families.length ? format(c.name.suffixResult, { name: `${ctx.families[0]} ${suffix}` }) : "";
  $("whole-family").textContent = isCustom() && ctx.list.length ? format(c.name.wholeFamily, { count: ctx.list.length }) : "";
  renderControls();
}

function currentOptions(): { options: ConvertOptions; problem: string | null } {
  const mode: Mode = $<HTMLInputElement>("stylistic").checked ? "stylistic" : "default";
  if (!isCustom()) {
    const suffix = $<HTMLInputElement>("suffix").value.trim();
    return { options: { mode, familySuffix: ` ${suffix}` }, problem: suffix ? null : c.name.emptySuffix };
  }
  // The custom name is a plain input: whatever the visitor types is used. Core refuses an empty name or
  // the original's own name (it would replace the original when installed) and the result says so.
  const familyName = $<HTMLInputElement>("family-name").value.trim();
  const options: ConvertOptions = { mode, familyName };
  const { families } = namingContext();
  if (families.length > 1) return { options, problem: format(c.name.multiFamily, { families: families.join(", ") }) };
  return { options, problem: familyName ? null : c.name.emptyName };
}

function renderControls(): void {
  const ctx = namingContext();
  const { problem } = currentOptions();
  const problemBox = $("name-problem");
  problemBox.replaceChildren();
  problemBox.hidden = !problem || !ctx.list.length;
  if (!problemBox.hidden && problem) problemBox.append(panel("warn", undefined, problem));

  const convert = $<HTMLButtonElement>("convert");
  convert.disabled = converting || analyzing || !ctx.list.length || problem !== null;
  convert.textContent = converting ? c.convert.busy : c.convert.button;
  $<HTMLButtonElement>("download-zip").disabled = converted().length === 0;
}

// --- conversion -----------------------------------------------------------------

async function convertAll(): Promise<void> {
  const { options, problem } = currentOptions();
  const list = eligible();
  if (problem !== null || !list.length) return;
  const run = ++convertRun;
  converting = true;
  renderControls();
  try {
    const results = await client.convert(list.map((e) => ({ name: e.name, data: e.data })), options);
    if (run !== convertRun) return; // files were added or cleared meanwhile
    conversions = new Map(list.map((e, i): [number, FileConversion] => [e.id, results[i]]));
    setStatus(c.runtime.ready, "ready");
  } catch (error) {
    if (run !== convertRun) return;
    conversions = new Map();
    showRuntimeError(error);
  }
  converting = false;
  renderResults();
  await refreshPreview();
}

function renderResults(): void {
  const container = $("results");
  container.replaceChildren();
  for (const entry of fonts()) {
    const conversion = conversions.get(entry.id);
    if (conversion?.ok) {
      container.append(
        panel("ok", "result-ok", format(c.results.ok, { file: entry.name, out: conversion.fileName, family: conversion.report.output?.family ?? "" })),
      );
    } else if (conversion) {
      container.append(panel("bad", "result-error", format(c.results.failed, { file: entry.name }), " ", describeError(conversion.error)));
    }
  }
  renderRemember();
  $("download").hidden = converted().length === 0;
  renderControls();
}

/** "Remember: <new name> = <original family>", with a copy button. */
function mappings(): ReadmePair[] {
  const pairs: ReadmePair[] = [];
  for (const { entry, conversion } of converted()) {
    const report = reportOf(entry);
    if (!report) continue;
    const name = conversion.report.output?.family ?? "";
    if (name && !pairs.some((pair) => pair.name === name && pair.original === report.family)) {
      pairs.push({ name, original: report.family, designer: report.designer });
    }
  }
  return pairs;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No Clipboard API (an insecure page, or permission refused). The line is `user-select: all`,
    // so the visitor can copy it with one click and Ctrl+C; the message says so.
    return false;
  }
}

function renderRemember(): void {
  const box = $("remember");
  box.replaceChildren();
  const pairs = mappings();
  box.hidden = pairs.length === 0;
  if (!pairs.length) return;
  const wrapper = el("div", { className: "remember" }, el("div", { className: "remember-title" }, c.results.rememberTitle));
  for (const pair of pairs) {
    const line = format(c.results.rememberLine, pair);
    const button = el("button", { className: "button button-quiet", testid: "copy-mapping", attrs: { type: "button" } }, c.results.copy);
    const status = el("span", { className: "muted small", attrs: { role: "status" } });
    button.addEventListener("click", async () => {
      const copied = await copyText(line);
      button.textContent = copied ? c.results.copied : c.results.copy;
      status.textContent = copied ? "" : c.results.copyFailed;
      if (copied) window.setTimeout(() => (button.textContent = c.results.copy), 2000);
    });
    wrapper.append(
      el("div", { className: "remember-line" }, el("span", { className: "remember-text", testid: "remember-text" }, line), button, status),
      el("p", { className: "muted small" }, format(c.results.rememberHow, pair)),
    );
  }
  box.append(wrapper);
}

// --- preview --------------------------------------------------------------------

async function refreshPreview(): Promise<void> {
  const run = ++previewRun;
  const select = $<HTMLSelectElement>("preview-file");
  const status = $("preview-status");
  const now = $("sample-now");
  const withLangbg = $("sample-with");
  const done = converted().map(({ entry }) => entry);
  const previous = select.value;
  select.replaceChildren(...done.map((e) => Object.assign(el("option", {}, e.name), { value: String(e.id) })));
  select.disabled = !done.length;
  $("preview-controls").hidden = done.length < 2;
  if (done.some((e) => String(e.id) === previous)) select.value = previous;

  unloadFace(faces.original);
  unloadFace(faces.converted);
  faces = {};
  status.textContent = "";
  delete status.dataset.state;
  // No converted font yet: the server-rendered demo in the site's own font.
  resetSample(now, "en");
  resetSample(withLangbg, "bg");
  $("preview-note").hidden = done.length > 0;
  if (!done.length) return;

  const entry = done.find((e) => String(e.id) === select.value) ?? done[0];
  const conversion = conversions.get(entry.id);
  const analysis = analyses.get(entry.id);
  if (!conversion?.ok || !analysis?.ok) return;
  try {
    const [original, converted] = await Promise.all([
      loadFace(entry.data, analysis.report.is_variable),
      loadFace(conversion.data, conversion.report.is_variable),
    ]);
    if (run !== previewRun) {
      unloadFace(original);
      unloadFace(converted);
      return;
    }
    faces = { original, converted };
  } catch (error) {
    // The browser's own font sanitizer refused one of the fonts.
    status.textContent = format(p.rejected, { message: String(error) });
    status.dataset.state = "error";
    return;
  }
  // Both rows are sent to the browser with no language, which is what Figma does. The
  // original shows the Russian-style forms; the converted font shows the Bulgarian ones.
  applySample(now, { family: faces.original!.family, lang: "en" });
  applySample(withLangbg, { family: faces.converted!.family, lang: "en", feature: conversion.report.output?.stylistic_set });
  status.dataset.state = "ready";
  status.textContent = p.ready;
}

// --- ZIP ------------------------------------------------------------------------

function downloadZip(): void {
  const done = converted();
  const output = done.at(-1)?.conversion.report.output;
  const zip = buildZip(c.readme, {
    fonts: done.map(({ conversion }) => ({ name: conversion.fileName, data: conversion.data })),
    licenses: licenses().map((e) => ({ name: e.name, data: e.data })),
    pairs: mappings(),
    stylisticSet: output?.stylistic_set ?? null,
  });
  downloadBlob(zip, `${output?.family ?? "langBG"}.zip`);
}

// --- wiring ---------------------------------------------------------------------

const input = $<HTMLInputElement>("file-input");
input.addEventListener("change", async () => {
  await addFiles(Array.from(input.files ?? []));
  input.value = "";
});
$("choose").addEventListener("click", () => input.click());
$("clear").addEventListener("click", () => void clearAll());
$("convert").addEventListener("click", () => void convertAll());
$("download-zip").addEventListener("click", downloadZip);
$("preview-file").addEventListener("change", () => void refreshPreview());
$("options").addEventListener("submit", (event) => event.preventDefault());

for (const control of document.querySelectorAll("input[name='naming'], #stylistic")) {
  control.addEventListener("input", renderOptions);
}
$("suffix").addEventListener("input", () => {
  $<HTMLInputElement>("naming-suffix").checked = true;
  renderOptions();
});
$("family-name").addEventListener("input", () => {
  $<HTMLInputElement>("naming-custom").checked = true;
  renderOptions();
});

const drop = $("drop");
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("drop-over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("drop-over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("drop-over");
  void addFiles(Array.from(event.dataTransfer?.files ?? []));
});
// A file dropped outside the zone must not make the browser navigate to it.
for (const type of ["dragover", "drop"]) window.addEventListener(type, (event) => event.preventDefault());

renderOptions();
runWhenIdle(() => {
  client.preload().catch(showRuntimeError);
});
