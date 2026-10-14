// Every string the plugin shows, in both languages. `bg` defines the shape; `en` must match it.
// Strings are plain data with {placeholders}, like web/src/i18n/ui.ts.

export const languages = ["bg", "en"] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = "bg";

const bg = {
  css: {
    // CSS comments: no "*/" inside.
    lang: 'задайте lang="bg" на HTML документа или на съответния текст',
    inFigma: "във Figma: {name}",
    notLangbg: "{name} - не е шрифт на langBG",
    truncated: "Показани са първите {count} текстови слоя.",
  },
  // Implementation notes. Wording fixed by the product owner: keep it exactly as it is.
  note: {
    title: "Бележки за имплементация",
    // Once per langBG family.
    family:
      "Заложете стандартния шрифт {family} във Вашия код. Версията „{figmaName}“, която виждате във Figma, е нужна само за превю на българската кирилица в дизайна.",
    // Once, when there is a langBG font. lang="bg" is shown as code where the UI allows it.
    lang: 'За да покажете българските форми в уеб, е достатъчно да зададете lang="bg" атрибут на HTML документа или на съответния текст.',
    // Always, also without a langBG font.
    safe: "Работата Ви е защитена. Плъгинът само чете данните и не прави промени по Figma файла.",
  },
  panel: {
    language: "Език на плъгина",
    empty: "Изберете текстов слой за преглед на CSS кода.",
    noText: "В избраното няма текст. Изберете текстов слой.",
    copy: "Копиране на CSS",
    copied: "Копирано",
    copyFailed: "Копирането не успя. Маркирайте кода и го копирайте ръчно.",
  },
};

export type Strings = typeof bg;

const en: Strings = {
  css: {
    lang: 'set lang="bg" on the HTML document or on the relevant text',
    inFigma: "in Figma: {name}",
    notLangbg: "{name} - not a langBG font",
    truncated: "Showing the first {count} text layers.",
  },
  note: {
    title: "Implementation notes",
    family:
      'Use the standard font {family} in your code. The "{figmaName}" version you see in Figma is only needed to preview Bulgarian Cyrillic in the design.',
    lang: 'To show the Bulgarian forms on the web, set the lang="bg" attribute on the HTML document or on the relevant text.',
    safe: "Your work is safe. The plugin only reads data and makes no changes to the Figma file.",
  },
  panel: {
    language: "Plugin language",
    empty: "Select a text layer to view its CSS.",
    noText: "There’s no text in the selection. Select a text layer.",
    copy: "Copy CSS",
    copied: "Copied",
    copyFailed: "Couldn’t copy. Select the code and copy it manually.",
  },
};

export const strings: Record<Lang, Strings> = { bg, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (languages as readonly string[]).includes(value);
}

export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
