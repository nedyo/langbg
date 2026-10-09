import { defineConfig } from "@playwright/test";

// Tests run against the production build (`astro build` + `astro preview`): worker bundling
// differs from the dev server, and that is what gets deployed. A port of its own keeps this
// from latching onto a dev server that happens to run on Astro's default 4321.
const port = Number(process.env.E2E_PORT ?? 4399);
const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000, // every fresh page boots Pyodide (a few seconds, more on slow CI)
  expect: { timeout: 120_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // CI builds in a step of its own (E2E_PREBUILT=1) so a failing build is named as such.
    command: `${process.env.E2E_PREBUILT ? "" : "pnpm build && "}pnpm preview --host 127.0.0.1 --port ${port}`,
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
