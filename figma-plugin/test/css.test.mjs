import assert from "node:assert/strict";
import { test } from "node:test";
import { blocks, handoff, originalFamily } from "../src/css.ts";

const run = (family, extra = {}) => ({
  family,
  style: "Regular",
  weight: 400,
  size: 16,
  lineHeight: { unit: "AUTO" },
  letterSpacing: { unit: "PERCENT", value: 0 },
  ...extra,
});

test("only the ' BG' suffix is recognized", () => {
  assert.equal(originalFamily("Montserrat BG"), "Montserrat");
  assert.equal(originalFamily("Source Sans 3 BG"), "Source Sans 3");
  for (const family of ["Montserrat", "Montserrat БГ", "MontserratBG", "Montserrat bg", "Montserrat Bg", "BG Sans", "BG", " BG", "Montserrat BG2"]) {
    assert.equal(originalFamily(family), null, family);
  }
});

test("a langBG font: original family, lang reminder, comment with the Figma name", () => {
  const { css, note } = handoff([run("Montserrat BG", { style: "Bold", weight: 700, size: 32 })], "bg");
  assert.equal(
    css,
    [
      '/* добави lang="bg" на страницата или на текста */',
      "",
      "/* във Figma: Montserrat BG */",
      'font-family: "Montserrat";',
      "font-weight: 700;",
      "font-size: 32px;",
      "line-height: normal;",
    ].join("\n"),
  );
  assert.match(note, /Във Figma: „Montserrat BG“\. В кода: „Montserrat“\./);
  assert.match(note, /lang="bg"/);
  assert.doesNotMatch(note, /не са от langBG/);
});

test("English output has no Cyrillic", () => {
  const { css, note } = handoff([run("Montserrat BG"), run("Inter")], "en");
  assert.doesNotMatch(css + note, /[А-Яа-я]/);
  assert.match(css, /\/\* in Figma: Montserrat BG \*\//);
  assert.match(css, /\/\* Inter - not a langBG font \*\//);
});

test("a font without the suffix: CSS unchanged, no lang reminder, one-line note", () => {
  const { css, note } = handoff([run("Inter", { weight: 500 })], "bg");
  assert.equal(css, ["/* Inter - не е шрифт на langBG */", 'font-family: "Inter";', "font-weight: 500;", "font-size: 16px;", "line-height: normal;"].join("\n"));
  assert.doesNotMatch(css, /lang=/);
  assert.equal(note, "Тук няма шрифт на langBG. CSS-ът е както във Figma.");
});

test("mixed fonts: one block per distinct font, in order of appearance; equal runs merge", () => {
  const runs = [run("Inter"), run("Montserrat BG", { weight: 700 }), run("Inter"), run("Montserrat BG", { weight: 700 }), run("Montserrat BG", { size: 12 })];
  const list = blocks(runs);
  assert.deepEqual(
    list.map((b) => [b.figmaFamily, b.lines.find((l) => l.startsWith("font-weight")), b.lines.find((l) => l.startsWith("font-size"))]),
    [
      ["Inter", "font-weight: 400;", "font-size: 16px;"],
      ["Montserrat BG", "font-weight: 700;", "font-size: 16px;"],
      ["Montserrat BG", "font-weight: 400;", "font-size: 12px;"],
    ],
  );
  const { css, note } = handoff(runs, "bg");
  assert.equal(css.match(/lang="bg"/g)?.length, 1, "the reminder appears once");
  assert.ok(css.startsWith('/* добави lang="bg"'));
  assert.equal(note.match(/Във Figma: „Montserrat BG“/g)?.length, 1, "each pair once");
  assert.match(note, /Другите шрифтове не са от langBG/);
});

test("units: line height, letter spacing, italic, rounding", () => {
  const css = (extra) => blocks([run("X BG", extra)])[0].lines.join("\n");
  assert.match(css({ lineHeight: { unit: "PIXELS", value: 24 } }), /line-height: 24px;/);
  assert.match(css({ lineHeight: { unit: "PERCENT", value: 120.0001 } }), /line-height: 120%;/);
  assert.match(css({ letterSpacing: { unit: "PIXELS", value: -0.5 } }), /letter-spacing: -0\.5px;/);
  assert.match(css({ letterSpacing: { unit: "PERCENT", value: -2 } }), /letter-spacing: -0\.02em;/);
  assert.doesNotMatch(css({ letterSpacing: { unit: "PIXELS", value: 0.001 } }), /letter-spacing/);
  assert.match(css({ size: 13.3333 }), /font-size: 13\.33px;/);
  assert.match(css({ style: "Bold Italic", weight: 700 }), /font-style: italic;\nfont-weight: 700;/);
  assert.doesNotMatch(css({ style: "Regular" }), /font-style/);
});

test("names are escaped in CSS strings and comments", () => {
  const { css } = handoff([run('Odd "Name" */ BG')], "en");
  assert.match(css, /font-family: "Odd \\"Name\\" \*\/";/);
  assert.match(css, /\/\* in Figma: Odd "Name" \* \/ BG \*\//);
});

test("no runs: nothing", () => {
  assert.deepEqual(handoff([], "bg"), { css: "", note: "" });
});

test("truncation is mentioned", () => {
  const { note } = handoff([run("Inter")], "en", { truncatedAt: 100 });
  assert.match(note, /Showing the first 100 text layers\./);
});
