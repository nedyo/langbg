// Small helpers around the dictionary in ui.ts. No strings live here.

import { defaultLang, languages, ui, type Dict, type Lang } from "./ui";

export { format } from "./format";
export { defaultLang, languages, ui };
export type { Dict, Lang };
export { PANGRAM, SAMPLER_LETTERS } from "./ui";

export function isLang(value: string | undefined): value is Lang {
  return languages.includes(value as Lang);
}

/** `lang` for the page, from the first path segment (`/en/...` is English, everything else Bulgarian). */
export function langFromPath(pathname: string): Lang {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : defaultLang;
}

/** The URL path of a page in a language. `path` is the Bulgarian path: "/", "/fonts/", "/about/". */
export function localePath(lang: Lang, path: string): string {
  if (lang === defaultLang) return path;
  return path === "/" ? "/en/" : `/en${path}`;
}

/** The language-neutral path of a localised one: "/en/fonts/" -> "/fonts/". */
export function neutralPath(pathname: string): string {
  if (pathname === "/en" || pathname === "/en/") return "/";
  return pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
}

export function otherLang(lang: Lang): Lang {
  return lang === "bg" ? "en" : "bg";
}
