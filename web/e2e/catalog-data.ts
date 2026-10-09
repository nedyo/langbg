// The catalog under test: the sample one or the whole one (`langbg-catalog build`). Tests that look at a
// catalog page pick an entry by its group instead of naming a font.

import { readFileSync } from "node:fs";

export interface CatalogEntry {
  slug: string;
  name: string;
  group: "convert" | "native";
  convertedName: string;
  nativeSet: string | null;
  letters: string;
  reservedNames: string[];
  googleFontsUrl: string | null;
  source: string;
  previewFont: string;
  designer: string;
  files: { name: string; url: string }[];
  licenseFile: string | null;
}

export const catalogData = JSON.parse(readFileSync(new URL("../src/data/catalog.json", import.meta.url), "utf8")) as {
  mock: boolean;
  fonts: CatalogEntry[];
};

/** Where a font page sends people for the original: Google Fonts, or the source until Google Fonts lists it. */
export const originalUrl = (font: CatalogEntry) => font.googleFontsUrl ?? font.source;

export const firstWith = (group: CatalogEntry["group"]) => catalogData.fonts.find((font) => font.group === group);
