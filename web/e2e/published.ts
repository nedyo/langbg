// The published state of the langBG Handoff card. The production build has SITE.figmaPlugin as it is
// in site.ts (null until the plugin is on Figma Community); a dev server started by
// playwright.config.ts sets PUBLIC_FIGMA_PLUGIN, so the tests see the other state too.
export const PLUGIN_URL = "https://www.figma.com/community/plugin/1692174372084149492";
export const PUBLISHED_PORT = Number(process.env.E2E_PUBLISHED_PORT ?? 4398);
export const PUBLISHED_URL = `http://127.0.0.1:${PUBLISHED_PORT}`;
