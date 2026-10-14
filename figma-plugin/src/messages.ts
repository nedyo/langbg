// Messages between the plugin (code.ts) and the panel (ui.ts).

import type { Note } from "./css.ts";
import type { Lang } from "./strings.ts";

export type PanelState = "empty" | "noText" | "ok";

export interface ToPanel {
  readonly type: "render";
  readonly lang: Lang;
  readonly state: PanelState;
  readonly css: string;
  readonly note: Note;
}

export type FromPanel = { readonly type: "ready" } | { readonly type: "lang"; readonly lang: Lang };
