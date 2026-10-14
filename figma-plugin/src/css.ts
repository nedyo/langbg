// The one place that turns text runs into CSS and the implementation notes. Both entry points (Dev Mode
// codegen and the Design mode panel) call `handoff()`. No Figma API here: the tests run it in Node.

import { format, strings, type Lang } from "./strings.ts";

/** What langBG appends to a converted family: "Montserrat" becomes "Montserrat BG". */
export const SUFFIX = " BG";

export type LineHeight = { readonly unit: "AUTO" } | { readonly unit: "PIXELS" | "PERCENT"; readonly value: number };
export interface LetterSpacing {
  readonly unit: "PIXELS" | "PERCENT";
  readonly value: number;
}

/** One stretch of text with the same type settings (Figma's styled text segment, reduced). */
export interface Run {
  readonly family: string;
  readonly style: string;
  readonly weight: number;
  readonly size: number;
  readonly lineHeight: LineHeight;
  readonly letterSpacing: LetterSpacing;
}

/** The implementation notes: bullets (none without a langBG font), then the closing line. */
export interface Note {
  readonly title: string;
  readonly bullets: readonly string[];
  readonly footer: string;
}

export interface Handoff {
  /** Empty when there are no runs. */
  readonly css: string;
  readonly note: Note;
}

/** "Montserrat BG" → "Montserrat". The " BG" suffix is the only thing recognized; anything else → null. */
export function originalFamily(family: string): string | null {
  if (!family.endsWith(SUFFIX)) return null;
  const original = family.slice(0, -SUFFIX.length);
  return original.trim() ? original : null;
}

function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function quoted(family: string): string {
  return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function comment(text: string): string {
  return `/* ${text.replace(/\*\//g, "* /")} */`;
}

function declarations(run: Run, family: string): string[] {
  const lines = [`font-family: ${quoted(family)};`];
  if (/italic|oblique/i.test(run.style)) lines.push("font-style: italic;");
  lines.push(`font-weight: ${number(run.weight)};`);
  lines.push(`font-size: ${number(run.size)}px;`);
  const lh = run.lineHeight;
  lines.push(`line-height: ${lh.unit === "AUTO" ? "normal" : lh.unit === "PIXELS" ? `${number(lh.value)}px` : `${number(lh.value)}%`};`);
  // Zero is the default (normal), so it is left out.
  const ls = run.letterSpacing;
  if (Math.round(ls.value * 100) !== 0) {
    lines.push(`letter-spacing: ${ls.unit === "PIXELS" ? `${number(ls.value)}px` : `${number(ls.value / 100)}em`};`);
  }
  return lines;
}

interface Block {
  readonly figmaFamily: string;
  readonly original: string | null;
  readonly lines: readonly string[];
}

/** One block per distinct font setting, in order of first appearance. Equal runs share a block. */
export function blocks(runs: readonly Run[]): Block[] {
  const seen = new Map<string, Block>();
  for (const run of runs) {
    const original = originalFamily(run.family);
    const lines = declarations(run, original ?? run.family);
    const key = `${run.family}\n${lines.join("\n")}`;
    if (!seen.has(key)) seen.set(key, { figmaFamily: run.family, original, lines });
  }
  return [...seen.values()];
}

export function handoff(runs: readonly Run[], lang: Lang, options: { truncatedAt?: number } = {}): Handoff {
  const s = strings[lang];
  const list = blocks(runs);
  const langbg = list.filter((block) => block.original !== null);

  const parts: string[] = [];
  if (options.truncatedAt !== undefined && list.length) parts.push(comment(format(s.css.truncated, { count: options.truncatedAt })));
  if (langbg.length) parts.push(comment(s.css.lang));
  for (const block of list) {
    const head = block.original !== null ? format(s.css.inFigma, { name: block.figmaFamily }) : format(s.css.notLangbg, { name: block.figmaFamily });
    parts.push([comment(head), ...block.lines].join("\n"));
  }

  // The first bullet once per langBG family, the lang bullet once; no bullets without a langBG font.
  const pairs = new Map(langbg.map((block) => [block.figmaFamily, block.original!]));
  const bullets = [...pairs].map(([figmaName, family]) => format(s.note.family, { family, figmaName }));
  if (bullets.length) bullets.push(s.note.lang);

  return { css: parts.join("\n\n"), note: { title: s.note.title, bullets, footer: s.note.safe } };
}

/** The notes as plain text, for Dev Mode's code section (no rich formatting there). */
export function noteText(note: Note): string {
  const bullets = note.bullets.map((bullet) => `• ${bullet}`).join("\n");
  return bullets ? `${bullets}\n\n${note.footer}` : note.footer;
}
