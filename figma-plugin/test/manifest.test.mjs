// The manifest and the sources keep the promises the listing makes: read-only, no network,
// Design mode and Dev Mode, a name without "Figma".

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("manifest: name, both editors, CSS codegen, no network, dynamic pages", () => {
  // The ID Figma gave the plugin. Publishing and updates depend on it: it must never change.
  assert.equal(manifest.id, "1692174372084149492");
  assert.equal(manifest.name, "langBG Handoff");
  assert.doesNotMatch(manifest.name, /fig/i, "Figma's trademark rules: no Figma or Fig in the name");
  assert.deepEqual(manifest.editorType, ["figma", "dev"]);
  assert.deepEqual(manifest.capabilities, ["codegen"]);
  assert.deepEqual(manifest.codegenLanguages, [{ label: "CSS", value: "css" }]);
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ["none"] });
  assert.equal(manifest.documentAccess, "dynamic-page");
  assert.equal(manifest.main, "dist/code.js");
  assert.equal(manifest.ui, "dist/ui.html");
  assert.equal(manifest.permissions, undefined);
  const language = manifest.codegenPreferences.find((p) => p.propertyName === "language");
  assert.deepEqual(
    language.options.map((o) => [o.value, Boolean(o.isDefault)]),
    [
      ["bg", true],
      ["en", false],
    ],
  );
});

// The code that runs next to the document. ui.ts runs in the panel's iframe and has no document access.
const PLUGIN_SOURCES = ["src/code.ts", "src/collect.ts", "src/css.ts"];

// "a.b = x", "a.b += x", "a[i] = x"; not "a.b === x", "(a) => x" or the type "T[] = []".
const ASSIGNMENT = /[\w)\]]\s*\.\s*\w+\s*(?:[-+*/%&|^]|\?\?|&&|\|\|)?=(?![=>])|[^[\s]\s*\]\s*=(?![=>])/g;
const MUTATING_CALL =
  /\.\s*(set[A-Z]\w*|create[A-Z]\w*|remove\w*|append\w*|insert\w*|delete\w*|load\w*|import\w*|commitUndo|group|flatten|union|subtract|intersect|exclude)\s*\(/g;

test("the guard catches what it should", () => {
  for (const bad of ['node.name = "x"', 'node.characters += "a"', "n.fills[0] = x", "figma.ui.onmessage = f", "(a).b ??= 2"]) {
    assert.ok(bad.match(ASSIGNMENT), bad);
  }
  for (const fine of ["const a: T[] = []", "a.b === c", "a.b !== c", "list.map((x) => x)", "const x = a.b"]) {
    assert.equal(fine.match(ASSIGNMENT), null, fine);
  }
  for (const bad of ["node.setPluginData(1)", "node.remove()", "figma.createText()", "n.appendChild(x)", "figma.loadFontAsync(f)", "node.setRangeFontName(0, 1, f)"]) {
    assert.ok([...bad.matchAll(MUTATING_CALL)].length, bad);
  }
});

test("plugin sources assign no properties and call nothing that changes the file", () => {
  for (const path of PLUGIN_SOURCES) {
    const source = read(path).replace(/\/\/.*$/gm, "");
    const assignments = source.match(ASSIGNMENT);
    assert.equal(assignments, null, `${path}: property assignment ${assignments}`);
    // Allowed on purpose: figma.clientStorage.setAsync (the language, saved on this computer).
    const calls = [...source.matchAll(MUTATING_CALL)]
      .filter((m) => !/clientStorage\s*\.\s*setAsync\s*\($/.test(source.slice(Math.max(0, m.index - 40), m.index + m[0].length)))
      .map((m) => m[1]);
    assert.deepEqual(calls, [], `${path}: calls that change the document`);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/, `${path}: network`);
  }
});

test("the built panel loads nothing from the network", { skip: !process.env.CI && !existsSync(new URL("dist/ui.html", root)) && "run pnpm build first" }, () => {
  const html = read("dist/ui.html");
  assert.doesNotMatch(html, /\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?(?:https?:)?\/\//i);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(html, /\/\* SCRIPT \*\//, "the script was inlined");
});
