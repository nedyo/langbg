// The Design mode panel. It only shows what code.ts sends; the language buttons are its only input.

import type { FromPanel, ToPanel } from "./messages.ts";
import { strings, type Lang } from "./strings.ts";

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function send(message: FromPanel): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

let current: ToPanel | null = null;

function show(message: ToPanel): void {
  current = message;
  const s = strings[message.lang];
  document.documentElement.lang = message.lang;
  $("langs").setAttribute("aria-label", s.panel.language);
  for (const button of document.querySelectorAll<HTMLButtonElement>("#langs button")) {
    button.setAttribute("aria-pressed", String(button.dataset["lang"] === message.lang));
  }
  $("read-only").textContent = s.panel.readOnly;
  $("copy").textContent = s.panel.copy;
  $("copy-status").textContent = "";
  $("note-title").textContent = s.note.title;

  const ok = message.state === "ok";
  $("status").hidden = ok;
  $("status").textContent = message.state === "empty" ? s.panel.empty : message.state === "noText" ? s.panel.noText : "";
  $("result").hidden = !ok;
  $("note-section").hidden = !ok;
  $("css").textContent = message.css;
  $("note").textContent = message.note;
}

// The plugin iframe may not use the async Clipboard API, so the copy goes through a hidden textarea.
function copy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

$("copy").addEventListener("click", () => {
  if (!current) return;
  const s = strings[current.lang];
  const done = copy(current.css);
  $("copy-status").textContent = done ? s.panel.copied : s.panel.copyFailed;
  if (!done) window.getSelection()?.selectAllChildren($("css"));
});

for (const button of document.querySelectorAll<HTMLButtonElement>("#langs button")) {
  button.addEventListener("click", () => send({ type: "lang", lang: button.dataset["lang"] as Lang }));
}

window.addEventListener("message", (event: MessageEvent) => {
  const message = (event.data as { pluginMessage?: ToPanel } | null)?.pluginMessage;
  if (message?.type === "render") show(message);
});

send({ type: "ready" });
