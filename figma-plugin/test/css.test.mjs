import assert from "node:assert/strict";
import { test } from "node:test";
import { blocks, handoff, noteText, originalFamily } from "../src/css.ts";

const run = (family, extra = {}) => ({
  family,
  style: "Regular",
  weight: 400,
  size: 16,
  lineHeight: { unit: "AUTO" },
  letterSpacing: { unit: "PERCENT", value: 0 },
  ...extra,
});

// The implementation notes, word for word as the product owner wrote them.
const NOTES = {
  bg: {
    title: "Бележки за имплементация",
    family: (family, figmaName) =>
      `Заложете стандартния шрифт ${family} във Вашия код. Версията „${figmaName}“, която виждате във Figma, е нужна само за превю на българската кирилица в дизайна.`,
    lang: 'За да покажете българските форми в уеб, е достатъчно да зададете lang="bg" атрибут на HTML документа или на съответния текст.',
    safe: "Работата Ви е защитена. Плъгинът само чете данните и не прави промени по Figma файла.",
  },
  en: {
    title: "Implementation notes",
    family: (family, figmaName) =>
      `Use the standard font ${family} in your code. The "${figmaName}" version you see in Figma is only needed to preview Bulgarian Cyrillic in the design.`,
    lang: 'To show the Bulgarian forms on the web, set the lang="bg" attribute on the HTML document or on the relevant text.',
    safe: "Your work is safe. The plugin only reads data and makes no changes to the Figma file.",
  },
};

test("only the ' BG' suffix is recognized", () => {
  assert.equal(originalFamily("Montserrat BG"), "Montserrat");
  assert.equal(originalFamily("Source Sans 3 BG"), "Source Sans 3");
  for (const family of ["Montserrat", "Montserrat БГ", "MontserratBG", "Montserrat bg", "Montserrat Bg", "BG Sans", "BG", " BG", "Montserrat BG2"]) {
    assert.equal(originalFamily(family), null, family);
  }
});

test("a langBG font: original family, lang reminder, comment with the Figma name", () => {
  const { css } = handoff([run("Montserrat BG", { style: "Bold", weight: 700, size: 32 })], "bg");
  assert.equal(
    css,
    [
      '/* задайте lang="bg" на HTML документа или на съответния текст */',
      "",
      "/* във Figma: Montserrat BG */",
      'font-family: "Montserrat";',
      "font-weight: 700;",
      "font-size: 32px;",
      "line-height: normal;",
    ].join("\n"),
  );
});

for (const lang of ["bg", "en"]) {
  const n = NOTES[lang];

  test(`${lang}: notes for one langBG font are the exact copy`, () => {
    const { note } = handoff([run("Montserrat BG"), run("Inter")], lang);
    assert.deepEqual(note, { title: n.title, bullets: [n.family("Montserrat", "Montserrat BG"), n.lang], footer: n.safe });
  });

  test(`${lang}: the first bullet repeats per langBG family; the lang bullet and the last line once`, () => {
    const runs = [run("Montserrat BG", { weight: 700 }), run("Inter"), run("Source Sans 3 BG"), run("Montserrat BG")];
    const { note } = handoff(runs, lang);
    assert.deepEqual(note.bullets, [n.family("Montserrat", "Montserrat BG"), n.family("Source Sans 3", "Source Sans 3 BG"), n.lang]);
    assert.equal(note.footer, n.safe);
  });

  test(`${lang}: without a langBG font only the last line`, () => {
    const { note } = handoff([run("Inter")], lang);
    assert.deepEqual(note, { title: n.title, bullets: [], footer: n.safe });
    assert.equal(noteText(note), n.safe);
  });

  test(`${lang}: Dev Mode gets plain-text "•" bullets`, () => {
    const { note } = handoff([run("Montserrat BG")], lang);
    assert.equal(noteText(note), `• ${n.family("Montserrat", "Montserrat BG")}\n• ${n.lang}\n\n${n.safe}`);
  });
}

test("the old developer copy is gone", () => {
  for (const lang of ["bg", "en"]) {
    const { note } = handoff([run("Montserrat BG"), run("Inter")], lang);
    assert.doesNotMatch(JSON.stringify(note), /За разработчика|For the developer|For developers/);
  }
});

test("English output has no Cyrillic", () => {
  const { css, note } = handoff([run("Montserrat BG"), run("Inter")], "en");
  assert.doesNotMatch(css + noteText(note), /[А-Яа-я]/);
  assert.match(css, /\/\* in Figma: Montserrat BG \*\//);
  assert.match(css, /\/\* Inter - not a langBG font \*\//);
});

test("a font without the suffix: CSS unchanged, no lang reminder, one-line note", () => {
  const { css } = handoff([run("Inter", { weight: 500 })], "bg");
  assert.equal(css, ["/* Inter - не е шрифт на langBG */", 'font-family: "Inter";', "font-weight: 500;", "font-size: 16px;", "line-height: normal;"].join("\n"));
  assert.doesNotMatch(css, /lang=/);
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
  const { css } = handoff(runs, "bg");
  assert.equal(css.match(/lang="bg"/g)?.length, 1, "the reminder appears once");
  assert.ok(css.startsWith('/* задайте lang="bg"'));
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

test("no runs: no CSS, only the last line of the notes", () => {
  const { css, note } = handoff([], "bg");
  assert.equal(css, "");
  assert.deepEqual(note.bullets, []);
});

test("truncation is a comment at the top of the CSS, not part of the notes", () => {
  const { css, note } = handoff([run("Inter")], "en", { truncatedAt: 100 });
  assert.ok(css.startsWith("/* Showing the first 100 text layers. */"));
  assert.doesNotMatch(noteText(note), /Showing/);
});
