// Entry point. In Dev Mode's Code section (figma.mode "codegen") it answers "generate" with two
// sections; anywhere else (Design mode, or run from the menu) it opens a small read-only panel.

import { collect } from "./collect.ts";
import { handoff, noteText } from "./css.ts";
import { defaultLang, isLang, strings, type Lang } from "./strings.ts";
import type { PanelState, ToPanel } from "./messages.ts";

const LANG_KEY = "language";

function codegen(): void {
  figma.codegen.on("generate", ({ node }) => {
    const setting = figma.codegen.preferences.customSettings["language"];
    const lang: Lang = isLang(setting) ? setting : defaultLang;
    const s = strings[lang];
    const { runs, truncatedAt } = collect([node]);
    if (!runs.length) return [{ title: "CSS", language: "PLAINTEXT", code: s.panel.empty }];
    const { css, note } = handoff(runs, lang, { truncatedAt });
    return [
      { title: "CSS", language: "CSS", code: css },
      { title: note.title, language: "PLAINTEXT", code: noteText(note) },
    ];
  });
}

async function panel(): Promise<void> {
  let lang: Lang = defaultLang;
  try {
    const saved: unknown = await figma.clientStorage.getAsync(LANG_KEY);
    if (isLang(saved)) lang = saved;
  } catch {
    // No saved language: Bulgarian.
  }

  figma.showUI(__html__, { width: 320, height: 440, themeColors: true, title: "langBG Handoff" });

  const render = (): void => {
    const selection = figma.currentPage.selection;
    const { runs, truncatedAt } = collect(selection);
    const state: PanelState = !selection.length ? "empty" : runs.length ? "ok" : "noText";
    const { css, note } = handoff(runs, lang, { truncatedAt });
    const message: ToPanel = { type: "render", lang, state, css, note };
    figma.ui.postMessage(message);
  };

  figma.on("selectionchange", render);
  figma.on("currentpagechange", render);
  figma.ui.on("message", (message: unknown) => {
    if (typeof message !== "object" || message === null) return;
    const { type, lang: chosen } = message as { type?: unknown; lang?: unknown };
    if (type === "ready") render();
    if (type === "lang" && isLang(chosen)) {
      lang = chosen;
      // Saved on this computer (clientStorage), never in the file.
      figma.clientStorage.setAsync(LANG_KEY, lang).catch(() => undefined);
      render();
    }
  });
}

if (figma.mode === "codegen") codegen();
else void panel();
