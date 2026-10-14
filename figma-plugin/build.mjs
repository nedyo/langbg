// Builds dist/code.js (the plugin) and dist/ui.html (the panel with its script inlined: the plugin
// has no network access, so the panel can't load anything).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const common = { bundle: true, minify: true, target: "es2020", legalComments: "none", write: false, logLevel: "warning" };

const [code, ui] = await Promise.all([
  build({ ...common, entryPoints: ["src/code.ts"], format: "iife" }),
  build({ ...common, entryPoints: ["src/ui.ts"], format: "iife" }),
]);

const script = ui.outputFiles[0].text;
if (/<\/script/i.test(script)) throw new Error("The panel script contains </script>; it can't be inlined.");
const template = await readFile("src/ui.html", "utf8");
if (!template.includes("/* SCRIPT */")) throw new Error("src/ui.html has no /* SCRIPT */ placeholder.");

await mkdir("dist", { recursive: true });
await writeFile("dist/code.js", code.outputFiles[0].text);
await writeFile("dist/ui.html", template.replace("/* SCRIPT */", () => script));
console.log("Built dist/code.js and dist/ui.html");
