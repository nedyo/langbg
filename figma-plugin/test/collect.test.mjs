// collect.ts against fake nodes that throw on any write and on any property it has no reason to read.
// If the plugin ever touched the document (a setter, appendChild, remove, setPluginData...), this fails.

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LAYERS, collect } from "../src/collect.ts";

const READS = new Set(["type", "characters", "getStyledTextSegments", "findAllWithCriteria", "fontName", "fontWeight", "fontSize", "lineHeight", "letterSpacing"]);
const MIXED = Symbol("figma.mixed");

function readOnly(target, name) {
  return new Proxy(target, {
    get(object, key) {
      if (typeof key === "symbol" || key === "then") return undefined;
      if (!READS.has(key) || !(key in object)) throw new Error(`${name}: read of "${key}"`);
      return object[key];
    },
    set(_object, key) {
      throw new Error(`${name}: write to "${String(key)}"`);
    },
    defineProperty(_object, key) {
      throw new Error(`${name}: define "${String(key)}"`);
    },
    deleteProperty(_object, key) {
      throw new Error(`${name}: delete "${String(key)}"`);
    },
  });
}

const segment = (family, extra = {}) => ({
  characters: "текст",
  start: 0,
  end: 5,
  fontName: { family, style: "Regular" },
  fontWeight: 400,
  fontSize: 16,
  lineHeight: { unit: "AUTO" },
  letterSpacing: { unit: "PERCENT", value: 0 },
  ...extra,
});

function text(name, segments, fallback = {}) {
  return readOnly(
    {
      type: "TEXT",
      characters: segments.map((s) => s.characters).join(""),
      getStyledTextSegments(fields) {
        assert.deepEqual(fields, ["fontName", "fontWeight", "fontSize", "lineHeight", "letterSpacing"]);
        return segments.map((s) => Object.freeze({ ...s }));
      },
      ...fallback,
    },
    name,
  );
}

function frame(name, children) {
  return readOnly(
    {
      type: "FRAME",
      findAllWithCriteria(criteria) {
        assert.deepEqual(criteria, { types: ["TEXT"] });
        return children;
      },
    },
    name,
  );
}

test("a text layer with mixed fonts gives its runs in text order", () => {
  const layer = text("title", [segment("Montserrat BG", { fontWeight: 700 }), segment("Inter")]);
  const { runs, layers, truncatedAt } = collect([layer]);
  assert.equal(layers, 1);
  assert.equal(truncatedAt, undefined);
  assert.deepEqual(
    runs.map((r) => [r.family, r.weight]),
    [
      ["Montserrat BG", 700],
      ["Inter", 400],
    ],
  );
});

test("a frame contributes the text layers inside it; other nodes give nothing", () => {
  const inside = [text("a", [segment("A BG")]), text("b", [segment("B")])];
  const { runs, layers } = collect([frame("card", inside), readOnly({ type: "VECTOR" }, "icon")]);
  assert.equal(layers, 2);
  assert.deepEqual(
    runs.map((r) => r.family),
    ["A BG", "B"],
  );
});

test("an empty text layer falls back to its own settings; mixed settings give nothing", () => {
  const settings = {
    fontName: { family: "Montserrat BG", style: "Italic" },
    fontWeight: 400,
    fontSize: 20,
    lineHeight: { unit: "PIXELS", value: 28 },
    letterSpacing: { unit: "PIXELS", value: 0 },
  };
  assert.deepEqual(collect([text("empty", [], settings)]).runs, [
    { family: "Montserrat BG", style: "Italic", weight: 400, size: 20, lineHeight: { unit: "PIXELS", value: 28 }, letterSpacing: { unit: "PIXELS", value: 0 } },
  ]);
  assert.deepEqual(collect([text("mixed", [], { ...settings, fontSize: MIXED })]).runs, []);
});

test(`no more than ${MAX_LAYERS} text layers are read`, () => {
  const many = Array.from({ length: MAX_LAYERS + 5 }, (_, i) => text(`t${i}`, [segment(`F${i}`)]));
  const { runs, layers, truncatedAt } = collect([frame("page", many)]);
  assert.equal(layers, MAX_LAYERS);
  assert.equal(truncatedAt, MAX_LAYERS);
  assert.equal(runs.length, MAX_LAYERS);
});

test("the fake nodes really refuse writes", () => {
  const layer = text("guard", [segment("X")]);
  assert.throws(() => {
    layer.characters = "x";
  }, /write/);
  assert.throws(() => layer.setPluginData, /read of "setPluginData"/);
});
