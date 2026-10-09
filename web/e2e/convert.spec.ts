import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { checksumProblems, readNameRecords, readNames, readSfnt } from "./sfnt";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../core/tests/fixtures");
const montserrat = (name: string) => path.join(fixtures, "montserrat", name);
const REGULAR = montserrat("Montserrat-Regular.ttf");
const OFL = montserrat("OFL.txt");
const PLEX = path.join(fixtures, "ibmplexsans", "IBMPlexSans[wdth,wght].ttf");
const PLEX_OFL = path.join(fixtures, "ibmplexsans", "OFL.txt");
const PT_SANS = path.join(fixtures, "ptsans", "PT_Sans-Web-Regular.ttf");

/** Tooling attribution must never reach what the user downloads: README.txt or any name record of a font. */
const TOOLING = /claude|anthropic|co-authored-by|noreply@anthropic\.com/i;

function expectNoTooling(zip: Record<string, Uint8Array>) {
  expect(new TextDecoder().decode(zip["README.txt"])).not.toMatch(TOOLING);
  for (const [file, bytes] of Object.entries(zip)) {
    if (!/\.(ttf|otf)$/.test(file)) continue;
    const records = readNameRecords(bytes);
    expect(records.length, file).toBeGreaterThan(0);
    expect(records.filter((r) => TOOLING.test(r.text)).map((r) => `${file} name ID ${r.nameId}: ${r.text}`)).toEqual([]);
  }
}

async function drop(page: Page, files: string[], url = "/") {
  await page.goto(url);
  await page.getByTestId("file-input").setInputFiles(files);
}

async function downloadZip(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-zip").click()]);
  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  return { zip, filename: download.suggestedFilename() };
}

/** Drops files, waits for the analysis, optionally uses the stylistic mode, converts, returns the ZIP. */
async function convertAndDownload(page: Page, files: string[], mode: "default" | "stylistic" = "default") {
  await drop(page, files);
  await expect(page.getByTestId("convert")).toBeEnabled();
  if (mode === "stylistic") {
    await page.locator(".advanced summary").click();
    await page.locator("#stylistic").check();
  }
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("download-zip")).toBeEnabled();
  return downloadZip(page);
}

test("Montserrat Regular + OFL.txt -> ZIP with a valid font named 'Montserrat BG'", async ({ page }) => {
  await drop(page, [REGULAR, OFL]);

  const report = page.getByTestId("report");
  await expect(report).toContainText("Montserrat");
  await expect(report).toContainText("Julieta Ulanovsky");
  await expect(report).toContainText("да, 23 букви");
  // The font HAS a stylistic set (ss01 "Alternate"), but it does not give Bulgarian forms: two separate rows.
  await expect(page.getByTestId("ss-in-font")).toContainText("ss01");
  await expect(page.getByTestId("ss-in-font")).toContainText("Alternate");
  await expect(page.getByTestId("ss-bulgarian")).toHaveText("няма");
  await expect(page.getByTestId("works-via-ss")).toHaveCount(0);
  // The Advanced settings are closed: the default mode is the only thing in view.
  await expect(page.locator("#stylistic")).toBeHidden();

  await page.getByTestId("convert").click();
  await expect(page.getByTestId("result-ok")).toContainText("MontserratBG-Regular.ttf");
  // The browser's own font sanitizer accepted both fonts in the preview.
  await expect(page.getByTestId("preview-status")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("remember-text")).toHaveText("Montserrat BG = Montserrat");

  const { zip, filename } = await downloadZip(page);
  expect(filename).toBe("Montserrat BG.zip");
  expect(Object.keys(zip).sort()).toEqual(["MontserratBG-Regular.ttf", "OFL.txt", "README.txt"]);
  expect(Buffer.from(zip["OFL.txt"]).equals(readFileSync(OFL))).toBe(true); // license byte-for-byte
  const readme = new TextDecoder().decode(zip["README.txt"]);
  expect(readme).toContain("Запомни: Montserrat BG = Montserrat");
  expect(readme).toContain("Създаден на основата на Montserrat от Julieta Ulanovsky");
  expectNoTooling(zip);

  const font = zip["MontserratBG-Regular.ttf"];
  const sfnt = readSfnt(font);
  expect(sfnt.version).toBe(0x00010000);
  expect(sfnt.tables.has("GSUB")).toBe(true);
  expect(sfnt.tables.has("DSIG")).toBe(false);
  expect(checksumProblems(font)).toEqual([]);
  const names = readNames(font);
  expect(names.get(1)).toBe("Montserrat BG");
  expect(names.get(6)).toBe("MontserratBG-Regular");
  expect(names.get(5)).toContain("Bulgarian forms via langbg.com");
  expect(names.has(10)).toBe(false); // a suffix name already says what it is based on

  // And once more through Chromium's sanitizer, straight from the ZIP bytes.
  const status = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const face = new FontFace("zip-check", bytes.buffer);
    await face.load();
    return face.status;
  }, Buffer.from(font).toString("base64"));
  expect(status).toBe("loaded");
});

test("both preview rows use the same pangram, and a real browser shapes the converted font like the original with lang=bg", async ({ page }) => {
  await drop(page, [REGULAR]);
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("preview-status")).toHaveAttribute("data-state", "ready");

  const now = page.getByTestId("preview-now");
  const withLangbg = page.getByTestId("preview-with");
  await expect(now).toHaveText("Жълтата дюля беше щастлива, че пухът, който цъфна, замръзна като гьон.");
  await expect(withLangbg).toHaveText(await now.innerText());
  // Neither row carries a language: that is what Figma sends.
  await expect(now).toHaveAttribute("lang", "en");
  await expect(withLangbg).toHaveAttribute("lang", "en");

  // The reference: the original font, set to "bg" the way a browser would.
  await page.evaluate(() => {
    const original = document.getElementById("sample-now")!;
    const reference = original.cloneNode(true) as HTMLElement;
    reference.id = "sample-reference";
    reference.lang = "bg";
    original.after(reference);
  });

  // Rows sit at fractional y offsets, which changes anti-aliasing. Render each sample alone at the
  // same whole-pixel position so only the shaping can make two screenshots differ.
  const shot = async (id: string) => {
    const sample = page.locator(`#${id}`);
    const pin = { position: "fixed", top: "20px", left: "20px", width: "1100px", margin: "0", background: "#fff", color: "#000", zIndex: "9999" };
    await sample.evaluate((node, style) => Object.assign((node as HTMLElement).style, style), pin);
    const png = await page.screenshot({ clip: { x: 20, y: 20, width: 1100, height: 120 }, animations: "disabled" });
    await sample.evaluate((node, style) => Object.assign((node as HTMLElement).style, Object.fromEntries(Object.keys(style).map((k) => [k, ""]))), pin);
    return png;
  };
  const [originalNoLang, originalBg, convertedNoLang] = [await shot("sample-now"), await shot("sample-reference"), await shot("sample-with")];
  // Without a language the original shows the Russian-style forms: lang really matters...
  expect(originalNoLang.equals(originalBg)).toBe(false);
  // ...and the converted font reproduces the Bulgarian ones with no language at all.
  expect(convertedNoLang.equals(originalBg)).toBe(true);
});

test("stylistic mode (under Advanced settings) output is recognised as already working via its stylistic set", async ({ page, browser }, testInfo) => {
  const { zip } = await convertAndDownload(page, [REGULAR], "stylistic");
  expect(new TextDecoder().decode(zip["README.txt"])).toContain("Режим: стилов набор ss20");
  const converted = testInfo.outputPath("MontserratBG-Regular.ttf");
  writeFileSync(converted, zip["MontserratBG-Regular.ttf"]);

  const fresh = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
  await drop(fresh, [converted]);
  const notice = fresh.getByTestId("works-via-ss");
  await expect(notice).toContainText("ss20");
  await expect(notice).toContainText("Bulgarian forms"); // the set's name as stored in the font
  await expect(fresh.getByTestId("ss-bulgarian")).toContainText("ss20");
  await expect(fresh.getByTestId("already-converted")).toBeVisible();
  await expect(fresh.getByTestId("convert")).toBeDisabled(); // nothing left to convert
});

test("a reserved font name is one informational line and never in the way: it converts as 'IBM Plex Sans BG'", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await drop(page, [PLEX, PLEX_OFL]);

  await expect(page.getByTestId("report")).toContainText("IBM Plex Sans");
  // Plex has six stylistic sets; exactly one of them (ss06) gives Bulgarian forms, and the report says so.
  await expect(page.getByTestId("ss-in-font")).toContainText("ss01");
  await expect(page.getByTestId("ss-bulgarian")).toHaveText("ss06 („Bulgarian Cyrillic forms“)");
  await expect(page.getByTestId("works-via-ss")).toContainText("ss06");
  // One line, nothing else: no block, no suggestion, no warning about the license file.
  await expect(page.getByTestId("rfn-info")).toHaveCount(1);
  await expect(page.getByTestId("rfn-info")).toHaveText(
    "Шрифтът има Reserved Font Name. Копието е за собствена употреба - не го разпространявай.",
  );
  await expect(page.locator("#naming-suffix")).toBeEnabled();
  await expect(page.locator("#naming-suffix")).toBeChecked();
  await expect(page.locator("#suffix")).toBeEnabled();
  await expect(page.getByTestId("name-input")).toHaveValue("");
  await expect(page.getByTestId("license-warning")).toHaveCount(0);
  await expect(page.getByTestId("convert")).toBeEnabled();

  await page.getByTestId("convert").click();
  await expect(page.getByTestId("result-ok")).toContainText("IBMPlexSansBG[wdth,wght].ttf");
  await expect(page.getByTestId("remember-text")).toHaveText("IBM Plex Sans BG = IBM Plex Sans");
  await page.getByTestId("copy-mapping").click();
  await expect(page.getByTestId("copy-mapping")).toHaveText("Копирано");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("IBM Plex Sans BG = IBM Plex Sans");

  const { zip } = await downloadZip(page);
  expect(Object.keys(zip).sort()).toEqual(["IBMPlexSansBG[wdth,wght].ttf", "OFL.txt", "README.txt"]);
  const readme = new TextDecoder().decode(zip["README.txt"]);
  expect(readme).toContain("Запомни: IBM Plex Sans BG = IBM Plex Sans");

  const names = readNames(zip["IBMPlexSansBG[wdth,wght].ttf"]);
  expect(names.get(1)).toBe("IBM Plex Sans BG");
  expect(names.get(6)).toBe("IBMPlexSansBG-Regular");
  // The copyright, the license description and its URL stay exactly as they were.
  const original = readNames(readFileSync(PLEX));
  for (const id of [0, 13, 14]) {
    expect(original.get(id), `the fixture has name ID ${id}`).toBeTruthy();
    expect(names.get(id)).toBe(original.get(id));
  }
});

test("without a license file only the font's own names count: Plex shows no line and converts", async ({ page }) => {
  await drop(page, [PLEX]);
  await expect(page.getByTestId("report")).toContainText("IBM Plex Sans");
  await expect(page.getByTestId("rfn-info")).toHaveCount(0);
  await expect(page.getByTestId("license-warning")).toHaveCount(0);
  await expect(page.getByTestId("convert")).toBeEnabled();
});

test("clearing the files while converting brings no stale result back", async ({ page }) => {
  await drop(page, [REGULAR]);
  await expect(page.getByTestId("convert")).toBeEnabled();
  await page.getByTestId("convert").click();
  await page.locator("#clear").click();
  await expect(page.getByTestId("runtime-status")).toContainText("Montserrat-Regular.ttf"); // the conversion runs
  await page.waitForTimeout(5000); // and has long finished: a conversion takes a second or two
  await expect(page.getByTestId("result-ok")).toHaveCount(0);
  await expect(page.locator("#download")).toBeHidden();
});

test("the line is in English on the English page", async ({ page }) => {
  await drop(page, [PLEX, PLEX_OFL], "/en/");
  await expect(page.getByTestId("rfn-info")).toHaveText(
    "This font has a Reserved Font Name. The copy is for your own use - don’t redistribute it.",
  );
  expect(await page.locator("body").innerText()).not.toContain("Шрифтът има Reserved Font Name");
});

test("a font that cannot be converted gets no line about a converted copy", async ({ page }) => {
  await drop(page, [PT_SANS]); // PT Sans: no Bulgarian forms, so nothing to convert and no line about a copy
  await expect(page.getByTestId("rfn-info")).toBeHidden();
});

test("a custom name is a plain input: it is used as typed, even with the reserved word in it", async ({ page }) => {
  await drop(page, [PLEX, PLEX_OFL]);
  await page.locator("#naming-custom").check();
  await expect(page.getByTestId("convert")).toBeDisabled(); // an empty name
  await expect(page.getByTestId("name-problem")).toContainText("Напиши име на семейството");
  await page.getByTestId("name-input").fill("Plex Cyrillic");
  await expect(page.getByTestId("convert")).toBeEnabled();
  await expect(page.getByTestId("rfn-info")).toBeVisible(); // still just the line
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("result-ok")).toContainText("PlexCyrillic[wdth,wght].ttf");
  await expect(page.getByTestId("remember-text")).toHaveText("Plex Cyrillic = IBM Plex Sans");
});

test("a custom name equal to the original is refused with a plain sentence", async ({ page }) => {
  await drop(page, [REGULAR, OFL]);
  await page.locator("#naming-custom").check();
  await page.getByTestId("name-input").fill("Montserrat");
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("result-error")).toContainText("Името не може да е празно или същото като оригиналното");
  await expect(page.locator("#download")).toBeHidden();
});

test("a custom name works without a reserved name too", async ({ page }) => {
  await drop(page, [REGULAR, OFL]);
  await page.locator("#naming-custom").check();
  await page.getByTestId("name-input").fill("Balkan Sans");
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("result-ok")).toContainText("BalkanSans-Regular.ttf");
  await expect(page.getByTestId("remember-text")).toHaveText("Balkan Sans = Montserrat");
  const { zip } = await downloadZip(page);
  expect(readNames(zip["BalkanSans-Regular.ttf"]).get(10)).toBe(
    "Based on Montserrat by Julieta Ulanovsky, Bulgarian forms enabled via langbg.com",
  );
  expectNoTooling(zip);
});

test("the English page converts in English and never shows Bulgarian interface text", async ({ page }) => {
  await drop(page, [REGULAR, OFL], "/en/");
  await expect(page.getByTestId("report")).toContainText("yes, 23 letters");
  await expect(page.getByTestId("ss-bulgarian")).toHaveText("none");
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("remember-text")).toHaveText("Montserrat BG = Montserrat");
  await expect(page.getByTestId("preview-status")).toHaveAttribute("data-state", "ready");
  const { zip } = await downloadZip(page);
  const readme = new TextDecoder().decode(zip["README.txt"]);
  expect(readme).toContain("Remember: Montserrat BG = Montserrat");
  expect(readme).not.toMatch(/[Ѐ-ӿ]/); // no Cyrillic in the English README
  // The letters themselves are Cyrillic by nature; the words around them must not be Bulgarian.
  const converter = await page.locator("#converter").innerText();
  expect(converter).not.toMatch(/Конвертир|Пусни|Запомни|Български|Стилови|Готово/);
});

test("the runtime preloads by itself after the page has loaded, not before", async ({ page }) => {
  // Order the events inside the page itself: comparing Playwright's network and load events races.
  await page.addInitScript(() => {
    const log: string[] = ((window as any).__order = []);
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        log.push("worker created");
      }
    };
    addEventListener("DOMContentLoaded", () => log.push("DOMContentLoaded"));
    addEventListener("load", () => log.push("load"));
  });
  await page.goto("/");
  // Nothing is dropped and nothing is clicked: the idle preload alone gets the runtime ready.
  await expect(page.getByTestId("runtime-status")).toHaveAttribute("data-stage", "ready");
  expect(await page.evaluate(() => (window as any).__order)).toEqual(["DOMContentLoaded", "load", "worker created"]);
});

test("everything is self-hosted: no request leaves this origin", async ({ page, baseURL }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await drop(page, [REGULAR]);
  await page.getByTestId("convert").click();
  await expect(page.getByTestId("preview-status")).toHaveAttribute("data-state", "ready");

  // Worker traffic is captured too (this is where Pyodide and the wheels come from).
  expect(urls.some((url) => url.includes("pyodide.asm.wasm"))).toBe(true);
  expect(urls.some((url) => /langbg-.*\.whl/.test(url))).toBe(true);
  expect(urls.some((url) => /\.woff2$/.test(url))).toBe(true); // the site's own fonts, from our domain
  const foreign = urls.filter((url) => !/^(data|blob):/.test(url) && new URL(url).origin !== new URL(baseURL!).origin);
  expect(foreign).toEqual([]);
});

test("a font without Bulgarian forms is reported and nothing is offered", async ({ page }) => {
  await drop(page, [PT_SANS]);
  await expect(page.getByTestId("no-bgr")).toBeVisible();
  await expect(page.getByTestId("convert")).toBeHidden(); // no options at all
  await expect(page.getByTestId("download-zip")).toBeDisabled();
});
