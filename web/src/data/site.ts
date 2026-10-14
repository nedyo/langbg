// Facts about the site and its author. Texts that need translating live in i18n/ui.ts.

export const SITE = {
  url: "https://langbg.com",
  author: { name: "Nedyalko Stoyanov", linkedin: "https://www.linkedin.com/in/nedyalko-stoyanov/" },
  repo: "https://github.com/nedyo/langbg",
  /** Donations. The widget script loads only after a click on the support button (a facade). */
  kofi: {
    user: "nedyalko",
    page: "https://ko-fi.com/nedyalko",
    script: "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js",
  },
  /**
   * The langBG Handoff page on Figma Community. While null, the home page says "coming soon" and the
   * footer has no plugin link; once published, put the Community URL in place of `null`.
   * PUBLIC_FIGMA_PLUGIN only exists for the e2e tests, which use it to see the published state.
   */
  figmaPlugin: ((import.meta.env.PUBLIC_FIGMA_PLUGIN as string | undefined) || null) as string | null,
} as const;

export type CreditKey = "pyodide" | "fonttools" | "fflate" | "astro" | "fonts";

export interface Credit {
  key: CreditKey;
  name: string;
  license: string;
  url: string;
  licenseUrl: string;
}

/** Open source the site stands on. The one-line "what it does" for each is in the dictionary. */
export const CREDITS: Credit[] = [
  {
    key: "pyodide",
    name: "Pyodide",
    license: "MPL-2.0",
    url: "https://pyodide.org/",
    licenseUrl: "https://github.com/pyodide/pyodide/blob/main/LICENSE",
  },
  {
    key: "fonttools",
    name: "fontTools",
    license: "MIT",
    url: "https://github.com/fonttools/fonttools",
    licenseUrl: "https://github.com/fonttools/fonttools/blob/main/LICENSE",
  },
  {
    key: "fflate",
    name: "fflate",
    license: "MIT",
    url: "https://github.com/101arrowz/fflate",
    licenseUrl: "https://github.com/101arrowz/fflate/blob/master/LICENSE",
  },
  {
    key: "astro",
    name: "Astro",
    license: "MIT",
    url: "https://astro.build/",
    licenseUrl: "https://github.com/withastro/astro/blob/main/LICENSE",
  },
  {
    key: "fonts",
    name: "Spectral, Source Sans 3",
    license: "OFL-1.1",
    url: "https://openfontlicense.org/",
    licenseUrl: "https://openfontlicense.org/open-font-license-official-text/",
  },
];
