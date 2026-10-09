// @ts-check
import { renameSync, rmdirSync } from "node:fs";
import sitemap from "@astrojs/sitemap";
import { defineConfig, envField, fontProviders } from "astro/config";

/**
 * Cloudflare answers an unknown address with the nearest 404.html up its path, so the English
 * 404 page must be the file en/404.html (Astro writes en/404/index.html). The Bulgarian one is
 * already 404.html at the root.
 * @type {import("astro").AstroIntegration}
 */
const english404 = {
  name: "langbg:english-404",
  hooks: {
    "astro:build:done": ({ dir }) => {
      renameSync(new URL("en/404/index.html", dir), new URL("en/404.html", dir));
      rmdirSync(new URL("en/404/", dir));
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: "https://langbg.com",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // The stylesheet is small; inlining it saves a render-blocking request on first paint.
    inlineStylesheets: "always",
  },
  // Bulgarian lives at /, English under /en/. Pages are real files in src/pages/ and src/pages/en/.
  i18n: {
    defaultLocale: "bg",
    locales: ["bg", "en"],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "bg", locales: { bg: "bg-BG", en: "en" } },
      filter: (page) => !/\/404\/$/.test(page),
    }),
    english404,
  ],
  env: {
    schema: {
      // Cloudflare Web Analytics (cookie-free). Set only for the deploy build; without it the
      // pages load nothing from another site.
      CF_BEACON_TOKEN: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
  // Self-hosted at build time (downloaded once, served from our own domain, no request to Google
  // at runtime). Both need Cyrillic with Bulgarian forms: the site is its own first proof.
  fonts: [
    {
      // Chosen after checking with `langbg analyze` that the font has Bulgarian forms (cyrl/BGR locl).
      // Literata, Alegreya, Fira Sans, Inter, Noto Serif and Playfair Display have none.
      name: "Spectral",
      cssVariable: "--font-serif",
      provider: fontProviders.google(),
      weights: [400, 700, 800],
      styles: ["normal"],
      subsets: ["latin", "cyrillic"],
      fallbacks: ["Georgia", "serif"],
    },
    {
      name: "Source Sans 3",
      cssVariable: "--font-sans",
      provider: fontProviders.google(),
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin", "cyrillic"],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
});
