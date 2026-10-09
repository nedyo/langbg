// README.txt for the ZIP. The text comes from the dictionary of the page's language.

import { format } from "../i18n/format";
import type { Dict } from "../i18n/ui";

export interface ReadmePair {
  /** The family name of the new font, what Figma shows. */
  name: string;
  /** The family name of the original font, what code should use. */
  original: string;
  designer: string | null;
}

export interface ReadmeInput {
  pairs: ReadmePair[];
  fontFiles: string[];
  licenseFiles: string[];
  /** Set when the stylistic mode was used. */
  stylisticSet: string | null;
}

export function buildReadme(strings: Dict["converter"]["readme"], input: ReadmeInput): string {
  const lines: string[] = [];
  const first = input.pairs[0];
  lines.push(format(strings.heading, { name: first?.name ?? "langBG" }), "");

  for (const pair of input.pairs) {
    const by = pair.designer ? format(strings.by, { designer: pair.designer }) : "";
    lines.push(
      format(strings.remember, pair),
      format(strings.basedOn, { original: pair.original, by }),
      format(strings.figma, { name: pair.name }),
      format(strings.code, { original: pair.original }),
      "",
    );
  }

  lines.push(strings.install, "", strings.files, ...input.fontFiles.map((file) => `  ${file}`));
  for (const file of input.licenseFiles) lines.push(`  ${file}`);
  lines.push("");

  const original = first?.original ?? "";
  lines.push(input.licenseFiles.length ? format(strings.license, { original }) : strings.licenseMissing);
  lines.push(input.stylisticSet ? format(strings.modeStylistic, { set: input.stylisticSet }) : strings.mode);
  return lines.join("\n") + "\n";
}
