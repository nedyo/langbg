// Reads text runs from the document. Only getters and read-only methods: the plugin never changes
// the file (test/collect.test.mjs runs this against nodes that throw on any write).

import type { Run } from "./css.ts";

/** A frame with hundreds of text layers would only make the output long; the first ones are enough. */
export const MAX_LAYERS = 100;

const FIELDS = ["fontName", "fontWeight", "fontSize", "lineHeight", "letterSpacing"] as const;

export interface Collected {
  readonly runs: Run[];
  /** Set when there were more text layers than MAX_LAYERS. */
  readonly truncatedAt?: number;
  /** How many text layers were read. */
  readonly layers: number;
}

/** The selected text layers, plus the text layers inside selected frames and groups, in layer order. */
export function textLayers(nodes: readonly SceneNode[]): { layers: TextNode[]; truncated: boolean } {
  const layers: TextNode[] = [];
  for (const node of nodes) {
    const found = node.type === "TEXT" ? [node] : "findAllWithCriteria" in node ? node.findAllWithCriteria({ types: ["TEXT"] }) : [];
    for (const layer of found) {
      if (layers.length === MAX_LAYERS) return { layers, truncated: true };
      layers.push(layer);
    }
  }
  return { layers, truncated: false };
}

/** The runs of one text layer, in text order. An empty layer still has its one setting. */
export function runsOf(node: TextNode): Run[] {
  const segments = node.getStyledTextSegments([...FIELDS]);
  if (segments.length) {
    return segments.map((segment) => ({
      family: segment.fontName.family,
      style: segment.fontName.style,
      weight: segment.fontWeight,
      size: segment.fontSize,
      lineHeight: segment.lineHeight,
      letterSpacing: segment.letterSpacing,
    }));
  }
  const { fontName, fontWeight, fontSize, lineHeight, letterSpacing } = node;
  if (typeof fontName === "symbol" || typeof fontWeight === "symbol" || typeof fontSize === "symbol" || typeof lineHeight === "symbol" || typeof letterSpacing === "symbol") {
    return [];
  }
  return [{ family: fontName.family, style: fontName.style, weight: fontWeight, size: fontSize, lineHeight, letterSpacing }];
}

export function collect(nodes: readonly SceneNode[]): Collected {
  const { layers, truncated } = textLayers(nodes);
  const runs = layers.flatMap(runsOf);
  return truncated ? { runs, layers: layers.length, truncatedAt: MAX_LAYERS } : { runs, layers: layers.length };
}
