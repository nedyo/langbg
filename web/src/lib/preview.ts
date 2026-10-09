// Side-by-side preview with the browser's own FontFace API.
//
// Figma sends no language to the shaper, and the page itself is lang="bg", which would make
// the browser apply the Bulgarian `locl` to the ORIGINAL font and hide the very problem.
// So every sample sets its own `lang`: "en" means "no Bulgarian", "bg" is the reference.

export interface LoadedFace {
  family: string;
  face: FontFace;
}

let counter = 0;

/** Loads font bytes under a private family name. Rejects if the browser's sanitizer refuses the font. */
export async function loadFace(data: ArrayBuffer, isVariable: boolean): Promise<LoadedFace> {
  const family = `langbg-preview-${++counter}`;
  const face = new FontFace(family, data, isVariable ? { weight: "100 900" } : {});
  await face.load();
  document.fonts.add(face);
  return { family, face };
}

export function unloadFace(loaded: LoadedFace | undefined): void {
  if (loaded) document.fonts.delete(loaded.face);
}

export interface SampleStyle {
  family: string;
  lang: "en" | "bg";
  /** OpenType feature to switch on, e.g. "ss20" for stylistic-mode output. */
  feature?: string | null;
}

export function applySample(element: HTMLElement, style: SampleStyle): void {
  element.lang = style.lang;
  element.style.fontFamily = `"${style.family}", sans-serif`;
  element.style.fontFeatureSettings = style.feature ? `"${style.feature}" 1` : "normal";
}

/** Back to the page's own font (the server-rendered demo state). */
export function resetSample(element: HTMLElement, lang: "en" | "bg"): void {
  element.lang = lang;
  element.style.fontFamily = "";
  element.style.fontFeatureSettings = "";
}
