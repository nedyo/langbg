// The ZIP a visitor downloads: the converted fonts, the license file(s) and README.txt.
// Shared by the converter and the catalog download.

import { zipSync } from "fflate";
import type { Dict } from "../i18n/ui";
import { buildReadme, type ReadmePair } from "./readme";

export interface ZipFile {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

export interface ZipInput {
  fonts: ZipFile[];
  licenses: ZipFile[];
  pairs: ReadmePair[];
  /** Set when the stylistic mode was used. */
  stylisticSet: string | null;
}

export function buildZip(readme: Dict["converter"]["readme"], input: ZipInput): Blob {
  const files: Record<string, Uint8Array> = {};
  // Two files with one name (e.g. two OFL.txt) both go in: "OFL (2).txt".
  const add = (file: ZipFile): string => {
    let name = file.name;
    for (let n = 2; name in files; n++) name = file.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
    files[name] = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    return name;
  };
  const fontFiles = input.fonts.map(add);
  const licenseFiles = input.licenses.map(add);
  const text = buildReadme(readme, { pairs: input.pairs, fontFiles, licenseFiles, stylisticSet: input.stylisticSet });
  add({ name: "README.txt", data: new TextEncoder().encode(text) });
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" });
}
