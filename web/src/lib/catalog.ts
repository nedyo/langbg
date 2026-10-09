// The catalog data (src/data/catalog.json). `langbg-catalog build` (catalog/) writes this file from
// google/fonts. While it holds only a few families `mock` is true (a sample), which the pages say out
// loud. catalog/tests checks that every entry has exactly the fields of CatalogFont.
//
// Nothing converted is hosted. An entry stores addresses of the ORIGINAL font files (pinned to a
// google/fonts commit); the visitor's browser fetches them and converts them with the same worker as
// the converter. The only font file we serve is the small preview.

import raw from "../data/catalog.json";

export interface CatalogAxis {
  tag: string;
  min: number;
  max: number;
}

export interface CatalogFile {
  /** The file name in google/fonts, e.g. "Montserrat[wght].ttf". */
  name: string;
  /** An address pinned to a commit (raw.githubusercontent.com), so it always gives the bytes that were checked. */
  url: string;
}

/**
 * - `convert`: convert in one click; the copy is called "<name> BG".
 * - `native`: the original already gives the Bulgarian forms through a stylistic set (`nativeSet`); nothing to download.
 */
export type CatalogGroup = "convert" | "native";

export interface CatalogFont {
  slug: string;
  /** The family name of the original font (what code uses). */
  name: string;
  group: CatalogGroup;
  /** The family name Figma shows after the download: "<name> BG", or the original's for `native`. */
  convertedName: string;
  designer: string;
  license: string;
  licenseUrl: string;
  /** Where the font comes from (its own repository when METADATA.pb names one). */
  source: string;
  /** The family on Google Fonts: the fallback when the download fails. Null while google/fonts has the
   * family but fonts.google.com does not list it yet; the page then points to `source`. */
  googleFontsUrl: string | null;
  /** The stylistic set (e.g. "ss06") through which the original font already gives the Bulgarian forms; null unless `native`. */
  nativeSet: string | null;
  /** Reserved Font Names of the original. Information only: the page says the converted copy is for own use. */
  reservedNames: string[];
  styles: string[];
  axes: CatalogAxis[];
  /** The letters whose form changes, as one string. */
  letters: string;
  /** Site-relative URL of the preview: the original font cut down to the letters of the page. Shown with lang="bg". */
  previewFont: string;
  /** The font files to fetch and convert; empty for `native`. */
  files: CatalogFile[];
  /** The OFL.txt to fetch and put in the ZIP; null for `native`. */
  licenseFile: string | null;
}

export interface Catalog {
  schema: number;
  /** A sample: only a few families, not the whole catalog yet. */
  mock: boolean;
  googleFontsCommit?: string;
  fonts: CatalogFont[];
}

export const catalog = raw as Catalog;

export function findFont(slug: string): CatalogFont | undefined {
  return catalog.fonts.find((font) => font.slug === slug);
}

export function groupCounts(): Record<CatalogGroup, number> {
  const counts: Record<CatalogGroup, number> = { convert: 0, native: 0 };
  for (const font of catalog.fonts) counts[font.group] += 1;
  return counts;
}
