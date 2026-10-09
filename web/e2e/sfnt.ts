// A tiny sfnt reader for the tests: table directory, checksums and the `name` table.
// Deliberately independent of fontTools, so it cross-checks what the Python side wrote.

export interface Sfnt {
  version: number;
  tables: Map<string, { offset: number; length: number; checksum: number }>;
}

export function readSfnt(bytes: Uint8Array): Sfnt {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables: Sfnt["tables"] = new Map();
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables.set(tag, { checksum: view.getUint32(at + 4), offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  return { version: view.getUint32(0), tables };
}

function checksum(bytes: Uint8Array, zeroRange?: [number, number]): number {
  let sum = 0;
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  padded.set(bytes);
  if (zeroRange) padded.fill(0, zeroRange[0], zeroRange[1]);
  const view = new DataView(padded.buffer);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

/** Table checksums match the directory, and the whole file sums to the magic 0xB1B0AFBA. */
export function checksumProblems(bytes: Uint8Array): string[] {
  const problems: string[] = [];
  const sfnt = readSfnt(bytes);
  for (const [tag, t] of sfnt.tables) {
    const data = bytes.subarray(t.offset, t.offset + t.length);
    // `head` is summed with checkSumAdjustment (bytes 8-12) treated as zero.
    const actual = checksum(data, tag === "head" ? [8, 12] : undefined);
    if (actual !== t.checksum) problems.push(`table ${tag}: checksum ${actual} != ${t.checksum}`);
  }
  if (checksum(bytes) !== 0xb1b0afba) problems.push("whole-file checksum is not 0xB1B0AFBA");
  return problems;
}

/** name table -> Map(nameID -> English Windows string, or the first string found). */
export interface NameRecord {
  platform: number;
  language: number;
  nameId: number;
  text: string;
}

/** Every record of the name table, decoded (UTF-16 for Unicode and Windows, one byte per character otherwise). */
export function readNameRecords(bytes: Uint8Array): NameRecord[] {
  const table = readSfnt(bytes).tables.get("name");
  if (!table) throw new Error("no name table");
  const view = new DataView(bytes.buffer, bytes.byteOffset + table.offset, table.length);
  const count = view.getUint16(2);
  const stringsAt = view.getUint16(4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 12 * i;
    const [platform, , language, nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => view.getUint16(at + o));
    const raw = new Uint8Array(view.buffer, view.byteOffset + stringsAt + offset, length);
    const text =
      platform === 3 || platform === 0
        ? Array.from({ length: length / 2 }, (_, k) => String.fromCharCode((raw[2 * k] << 8) | raw[2 * k + 1])).join("")
        : String.fromCharCode(...raw);
    records.push({ platform, language, nameId, text });
  }
  return records;
}

/** One string per name ID: the Windows English record, else the first one. */
export function readNames(bytes: Uint8Array): Map<number, string> {
  const names = new Map<number, string>();
  for (const { platform, language, nameId, text } of readNameRecords(bytes)) {
    if ((platform === 3 && language === 0x409) || !names.has(nameId)) names.set(nameId, text);
  }
  return names;
}
