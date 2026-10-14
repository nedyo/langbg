// Every string the plugin shows, in both languages. `bg` defines the shape; `en` must match it.
// Strings are plain data with {placeholders}, like web/src/i18n/ui.ts.

export const languages = ["bg", "en"] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = "bg";

const bg = {
  css: {
    // CSS comments: no "*/" inside.
    lang: 'добави lang="bg" на страницата или на текста',
    inFigma: "във Figma: {name}",
    notLangbg: "{name} - не е шрифт на langBG",
  },
  note: {
    title: "За разработчика",
    pair: "Във Figma: „{figma}“. В кода: „{original}“.",
    why: "„BG“ в името значи копие на шрифта с включени български форми. В кода не ти трябва: ползвай оригинала.",
    lang: 'Сложи lang="bg" на страницата (<html lang="bg">) или на текста. Тогава браузърът сам показва българските форми.',
    others: "Другите шрифтове не са от langBG. CSS-ът им е както във Figma.",
    none: "Тук няма шрифт на langBG. CSS-ът е както във Figma.",
    truncated: "Показани са първите {count} текстови слоя.",
  },
  panel: {
    language: "Език на плъгина",
    empty: "Маркирай текстов слой, за да видиш CSS-а му.",
    noText: "В маркираното няма текст. Маркирай текстов слой.",
    copy: "Копирай CSS",
    copied: "Копирано",
    copyFailed: "Не успях да копирам. Маркирай кода и го копирай ръчно.",
    readOnly: "Плъгинът само чете. Файлът ти не се променя.",
  },
};

export type Strings = typeof bg;

const en: Strings = {
  css: {
    lang: 'add lang="bg" to the page or to the text',
    inFigma: "in Figma: {name}",
    notLangbg: "{name} - not a langBG font",
  },
  note: {
    title: "For the developer",
    pair: "In Figma: “{figma}”. In code: “{original}”.",
    why: "“BG” in the name marks a copy of the font with Bulgarian forms turned on. Code doesn’t need it: use the original.",
    lang: 'Add lang="bg" to the page (<html lang="bg">) or to the text. Browsers then show the Bulgarian forms on their own.',
    others: "The other fonts aren’t from langBG. Their CSS is as in Figma.",
    none: "No langBG font here. The CSS is as in Figma.",
    truncated: "Showing the first {count} text layers.",
  },
  panel: {
    language: "Plugin language",
    empty: "Select a text layer to see its CSS.",
    noText: "There’s no text in the selection. Select a text layer.",
    copy: "Copy CSS",
    copied: "Copied",
    copyFailed: "Couldn’t copy. Select the code and copy it manually.",
    readOnly: "Read-only. Your file stays unchanged.",
  },
};

export const strings: Record<Lang, Strings> = { bg, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (languages as readonly string[]).includes(value);
}

export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
