// Renders the images that cannot be plain SVG, from the BUILT site (so the fonts are the real ones):
//   public/og/bg.png, public/og/en.png   Open Graph / Twitter cards, 1200 x 630
//   public/favicon.ico                   32 x 32 PNG inside an ICO, drawn from public/favicon.svg
// The results are committed; run again only when the design or the hero text changes:
//
//   pnpm build && pnpm preview --port 4399      (in one terminal)
//   node scripts/make-brand-assets.mjs          (in another; OG_BASE overrides the address)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { SAMPLER_LETTERS, ui } from "../src/i18n/ui.ts";

const base = process.env.OG_BASE ?? "http://127.0.0.1:4399";
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(join(publicDir, "og"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await context.newPage();

for (const lang of ["bg", "en"]) {
  await page.goto(`${base}${lang === "en" ? "/en/" : "/"}`, { waitUntil: "networkidle" });
  const t = ui[lang].home;
  await page.evaluate(
    ({ heading, now, withLabel, letters }) => {
      document.documentElement.dataset.theme = "light";
      document.body.replaceChildren();
      document.body.style.cssText = "margin:0;display:block;min-height:0";
      const card = document.createElement("div");
      card.style.cssText =
        "width:1200px;height:630px;box-sizing:border-box;padding:56px 72px 0;background:#f7f8fb;color:#1b2250;font-family:var(--font-serif);position:relative;overflow:hidden";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-sans);font-size:26px;color:#565d7d">
          <span style="font:800 40px var(--font-serif);color:#1b2250;letter-spacing:-0.02em">langBG</span><span>langbg.com</span>
        </div>
        <div style="margin-top:26px;font-weight:800;font-size:84px;line-height:1.02;letter-spacing:-0.02em"></div>
        <div style="margin-top:34px;border-top:3px solid #1b2250">
          <div style="padding-top:10px"><div class="label" style="font:600 22px var(--font-sans);color:#565d7d"></div><div class="row now" lang="en" style="font-weight:700;font-size:54px;line-height:1.15;letter-spacing:0.04em;word-spacing:0.06em;color:#565d7d"></div></div>
          <div style="padding-top:8px"><div class="label" style="font:600 22px var(--font-sans);color:#565d7d"></div><div class="row with" lang="bg" style="font-weight:700;font-size:54px;line-height:1.15;letter-spacing:0.04em;word-spacing:0.06em;color:#b3232f"></div></div>
        </div>`;
      const title = card.children[1];
      title.textContent = heading;
      const labels = card.querySelectorAll(".label");
      labels[0].textContent = now;
      labels[1].textContent = withLabel;
      card.querySelector(".now").textContent = letters;
      card.querySelector(".with").textContent = letters;
      document.body.append(card);
    },
    { heading: t.heroTitle, now: t.sampler.before, withLabel: t.sampler.after, letters: [...SAMPLER_LETTERS].join(" ") },
  );
  await page.evaluate(() => document.fonts.load('800 84px "Spectral"', "Фигма Figma"));
  await page.evaluate(() => document.fonts.load('700 54px "Spectral"', "вгджзийклптцчшщю"));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(publicDir, "og", `${lang}.png`), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`[brand] og/${lang}.png`);
}

// favicon.ico: a PNG inside the ICO container (supported since Windows Vista and by every browser).
const svg = readFileSync(join(publicDir, "favicon.svg"), "utf8");
const icon = await context.newPage();
await icon.setViewportSize({ width: 32, height: 32 });
await icon.setContent(`<body style="margin:0;background:transparent"><img width="32" height="32" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`);
const png = await icon.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 32, height: 32 } });
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header[6] = 32; // width
header[7] = 32; // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14); // size of the image data
header.writeUInt32LE(22, 18); // it starts right after the 22-byte header
writeFileSync(join(publicDir, "favicon.ico"), Buffer.concat([header, png]));
console.log("[brand] favicon.ico");

await browser.close();
