import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { catalogData, firstWith, originalUrl, type CatalogEntry } from "./catalog-data";
import { readNames } from "./sfnt";

// The catalog hosts no converted font and no ZIP. Its pages show the original font (cut down) with
// lang="bg"; the download fetches the originals from GitHub, converts them in the browser and builds the ZIP.
// The tests never touch the network: GitHub is answered by the tests themselves, with the fonts of core's fixtures.

const FIXTURES = fileURLToPath(new URL("../../core/tests/fixtures/", import.meta.url));
const fixture = (...parts: string[]) => readFileSync(join(FIXTURES, ...parts));
const MONTSERRAT = fixture("montserrat", "Montserrat[wght].ttf");
const MONTSERRAT_OFL = fixture("montserrat", "OFL.txt");

const CORS = { "access-control-allow-origin": "*" };
const GITHUB = "https://raw.githubusercontent.com/**";

type Respond = (url: string) => "abort" | number | undefined;

/** Answers every request to GitHub with a font and a license; `respond` can make some of them fail. Returns the URLs asked for. */
async function serveGithub(page: Page, font: Buffer, license: Buffer, respond: Respond = () => undefined): Promise<string[]> {
  const asked: string[] = [];
  await page.route(GITHUB, (route) => {
    const url = route.request().url();
    asked.push(url);
    const failure = respond(url);
    if (failure === "abort") return route.abort();
    if (typeof failure === "number") return route.fulfill({ status: failure, body: "no", headers: CORS });
    return route.fulfill({ status: 200, body: new URL(url).pathname.endsWith("/OFL.txt") ? license : font, headers: CORS });
  });
  return asked;
}

async function getZip(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("catalog-download").click()]);
  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  return { zip, filename: download.suggestedFilename() };
}

const card = (page: Page, font: CatalogEntry) =>
  page.getByTestId("catalog-item").filter({ has: page.locator(`a[href$="/fonts/${font.slug}/"]`) });

test("catalog: no converted font and no ZIP is hosted, and every address points at a pinned commit of google/fonts", () => {
  const folder = fileURLToPath(new URL("../public/catalog/", import.meta.url));
  for (const font of catalogData.fonts) {
    expect(readdirSync(join(folder, font.slug)), font.slug).toEqual(["preview.woff2"]);
    expect(font.previewFont).toBe(`/catalog/${font.slug}/preview.woff2`);
    for (const url of [...font.files.map((f) => f.url), ...(font.licenseFile ? [font.licenseFile] : [])]) {
      expect(url, font.slug).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/ofl\/[a-z0-9]+\/[^/]+$/);
    }
    expect(font.files.length > 0, font.slug).toBe(font.group !== "native");
    if (font.googleFontsUrl !== null) expect(font.googleFontsUrl, font.slug).toMatch(/^https:\/\/fonts\.google\.com\/specimen\//);
    expect(font.source, font.slug).toMatch(/^https:\/\//);
  }
});

test("catalog: only the letters of the Bulgarian alphabet (and ѝ/Ѝ) are listed", () => {
  const alphabet = "абвгдежзийклмнопрстуфхцчшщъьюяѝ";
  const allowed = new Set([...alphabet, ...alphabet.toUpperCase()]);
  for (const font of catalogData.fonts) {
    expect([...font.letters].filter((letter) => !allowed.has(letter)), font.slug).toEqual([]);
    expect(font.letters.length, font.slug).toBeGreaterThan(0);
  }
});

test("catalog: each card's letters are in the family's own preview, fetched only when the card comes on screen", async ({ page }) => {
  test.skip(catalogData.fonts.length < 6, "too few entries to have cards below the fold");
  await page.setViewportSize({ width: 1280, height: 800 });
  const fetched = new Set<string>();
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(/^\/catalog\/([^/]+)\/preview\.woff2$/);
    if (match) fetched.add(match[1]);
  });
  await page.goto("/fonts/");
  const first = catalogData.fonts[0];
  const last = catalogData.fonts[catalogData.fonts.length - 1];
  const rowOf = (font: CatalogEntry) => card(page, font).getByTestId("catalog-letters");
  const loaded = (font: CatalogEntry) =>
    page.evaluate((f) => [...document.fonts].some((face) => face.family.replace(/"/g, "") === f && face.status === "loaded"), `catalog-${font.slug}`);

  // The first card is on screen: its letters, in its own font, with the Bulgarian forms.
  await expect.poll(() => loaded(first)).toBe(true);
  await expect(rowOf(first)).toHaveAttribute("lang", "bg");
  await expect(rowOf(first).locator("span")).toHaveCount([...first.letters].length);
  expect(await rowOf(first).evaluate((node) => getComputedStyle(node).fontFamily)).toContain(`catalog-${first.slug}`);
  // The card title uses the same preview (the cut keeps the characters of the family name).
  expect(await card(page, first).locator(".catalog-name").evaluate((node) => getComputedStyle(node).fontFamily)).toContain(`catalog-${first.slug}`);

  // The page did not fetch every preview up front; the last card's comes when it is scrolled to.
  await page.waitForLoadState("networkidle");
  expect(fetched.size).toBeGreaterThan(0);
  expect(fetched.size).toBeLessThan(catalogData.fonts.length);
  expect(fetched.has(last.slug)).toBe(false);
  const before = await rowOf(last).boundingBox();
  await rowOf(last).scrollIntoViewIfNeeded();
  await expect.poll(() => loaded(last)).toBe(true);
  expect(fetched.has(last.slug)).toBe(true);

  // The row kept its size when the font arrived: nothing below it moved.
  const after = await rowOf(last).boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
});

test("catalog: each card has a badge in words and says what the font is called in Figma", async ({ page }) => {
  const labels = {
    bg: {
      convert: (f: CatalogEntry) => `Във Figma: ${f.convertedName}`,
      native: (f: CatalogEntry) => `Работи във Figma без конвертиране - включи ${f.nativeSet}`,
    },
    en: {
      convert: (f: CatalogEntry) => `In Figma: ${f.convertedName}`,
      native: (f: CatalogEntry) => `Works in Figma without converting - turn on ${f.nativeSet}`,
    },
  } as const;
  for (const [lang, path] of [["bg", "/fonts/"], ["en", "/en/fonts/"]] as const) {
    await page.goto(path);
    if (catalogData.mock) await expect(page.getByTestId("mock-notice")).toBeVisible();
    else await expect(page.getByTestId("mock-notice")).toHaveCount(0);
    await expect(page.getByTestId("catalog-item")).toHaveCount(catalogData.fonts.length);
    for (const group of ["convert", "native"] as const) {
      const font = firstWith(group);
      if (!font) continue;
      // The title is always the original font, never the converted name.
      await expect(card(page, font).locator(".catalog-name")).toHaveText(font.name);
      // ...drawn in the family’s own preview font, with the site serif as the fallback.
      expect(await card(page, font).locator(".catalog-name").evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(new RegExp(`^"?catalog-${font.slug}"?, `));
      await expect(card(page, font).getByTestId("catalog-figma")).toHaveText(labels[lang][group](font));
    }
    await expect(page.getByTestId("catalog-badge")).toHaveCount(0); // no group badge on the cards
    expect(await page.locator("body").innerText()).not.toMatch(lang === "bg" ? /Converter|Reserved name/ : /Конвертор|Запазено име/);
  }
});

test("catalog: the filter shows one group at a time, with counts, and the choice is in the address", async ({ page }) => {
  const count = (group: string) => catalogData.fonts.filter((f) => group === "all" || f.group === group).length;
  await page.goto("/fonts/");
  for (const group of ["all", "convert", "native"]) {
    await expect(page.getByTestId(`filter-count-${group}`)).toHaveText(String(count(group)));
  }
  await expect(page.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("filter-help")).toHaveText("");

  for (const group of ["native", "convert"] as const) {
    if (!count(group)) continue;
    await page.getByTestId(`filter-${group}`).click();
    await expect(page.getByTestId("catalog-item").locator("visible=true")).toHaveCount(count(group));
    const shown = await page.getByTestId("catalog-item").locator("visible=true").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.group));
    expect(new Set(shown)).toEqual(new Set([group]));
    await expect(page.getByTestId(`filter-${group}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("filter-help")).not.toHaveText("");
    expect(new URL(page.url()).hash).toBe(`#${group}`);
  }
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("catalog-item").locator("visible=true")).toHaveCount(count("all"));
  expect(new URL(page.url()).hash).toBe("");

  // A link to a group opens it, in either language.
  const group = "native";
  await page.goto(`/en/fonts/#${group}`);
  await expect(page.getByTestId("catalog-item").locator("visible=true")).toHaveCount(count(group));
  await expect(page.getByTestId(`filter-${group}`)).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("body").innerText()).not.toMatch(/1 клик|Вграден набор|Без конвертиране/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("catalog: every card is listed and the filter, which needs scripts, stays hidden", async ({ page }) => {
    await page.goto("/fonts/");
    await expect(page.getByTestId("catalog-item")).toHaveCount(catalogData.fonts.length);
    await expect(page.getByTestId("catalog-filters")).toBeHidden();
  });

  test("catalog: a font page still offers the way around the download", async ({ page }) => {
    const font = firstWith("convert");
    test.skip(!font, "no entry to convert in this catalog");
    await page.goto(`/fonts/${font!.slug}/`);
    // The button cannot work, so the note under it (inside <noscript>) carries the two ways around it.
    await expect(page.locator(`main noscript a[href="${originalUrl(font!)}"]`)).toBeVisible();
    await expect(page.locator('main noscript a[href="/#converter"]')).toBeVisible();
  });

  test("catalog: a family that Google Fonts does not list yet links to its source, never to a missing Google Fonts page", async ({ page }) => {
    const font = catalogData.fonts.find((f) => f.group === "convert" && f.googleFontsUrl === null);
    test.skip(!font, "every family of this catalog is on Google Fonts");
    await page.goto(`/fonts/${font!.slug}/`);
    await expect(page.locator(`main noscript a[href="${font!.source}"]`)).toContainText("Към източника");
    await expect(page.locator('main a[href^="https://fonts.google.com/"]')).toHaveCount(0);
  });
});

test("catalog: the preview is the original font with lang=bg, and it keeps the Bulgarian forms", async ({ page }) => {
  const font = firstWith("convert");
  test.skip(!font, "no entry to convert in this catalog");
  const family = `catalog-${font!.slug}`;
  await page.goto(`/fonts/${font!.slug}/`);
  await expect(page.locator("h1")).toHaveText(font!.name); // the page is about the original; "X BG" is a fact in the table
  await expect(page.getByTestId("catalog-badge")).toHaveCount(0);
  if (catalogData.mock) await expect(page.getByTestId("mock-notice")).toBeVisible();
  await expect(page.getByTestId("letters").locator("li")).toHaveCount([...font!.letters].length);
  await expect(page.getByTestId("catalog-figma-name")).toHaveText(font!.convertedName);
  await expect(page.getByTestId("tester")).toHaveAttribute("lang", "bg");
  await expect(page.getByTestId("letters")).toHaveAttribute("lang", "bg");
  await expect(page.getByTestId("catalog-preview-note")).toContainText("Прегледът е с lang=\"bg\"");

  await expect.poll(() => page.evaluate((f) => document.fonts.check(`36px "${f}"`, "Д"), family)).toBe(true);
  const faces = await page.evaluate((f) => [...document.fonts].filter((face) => face.family.includes(f)).map((face) => face.status), family);
  expect(faces).toContain("loaded");

  // The cut kept `locl`: the same letters look different with the language removed.
  const letters = page.getByTestId("letters");
  const withBg = await letters.screenshot({ animations: "disabled" });
  await letters.evaluate((node) => node.setAttribute("lang", "en"));
  const withoutLanguage = await letters.screenshot({ animations: "disabled" });
  expect(withBg.equals(withoutLanguage), "lang=bg changes none of the letters: the Bulgarian forms are gone from the preview").toBe(false);

  // The tester takes any text and resizes.
  const tester = page.getByTestId("tester");
  await tester.fill("Здравей");
  await page.locator("#tester-size").fill("64");
  expect(await tester.evaluate((node) => getComputedStyle(node).fontSize)).toBe("64px");
});

test("catalog: one click gives a ZIP converted in the browser from the original files, named by the page's rule", async ({ page }) => {
  const font = catalogData.fonts.find((f) => f.slug === "montserrat" && f.group === "convert");
  test.skip(!font, "Montserrat is not in this catalog");
  const asked = await serveGithub(page, MONTSERRAT, MONTSERRAT_OFL);
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://127.0.0.1") && !url.startsWith("data:") && !url.startsWith("blob:")) outside.push(url);
  });

  await page.goto(`/fonts/${font!.slug}/`);
  await page.waitForLoadState("load");
  expect(asked, "nothing is fetched before the button is pressed").toEqual([]);
  expect(outside).toEqual([]);
  await expect(page.getByTestId("catalog-note")).toContainText("google/fonts");

  const { zip, filename } = await getZip(page);
  expect(filename).toBe("Montserrat BG.zip");
  expect(Object.keys(zip).sort()).toEqual(["MontserratBG-Italic[wght].ttf", "MontserratBG[wght].ttf", "OFL.txt", "README.txt"]);
  expect(Buffer.from(zip["OFL.txt"]).equals(MONTSERRAT_OFL)).toBe(true); // the license, byte for byte
  const readme = new TextDecoder().decode(zip["README.txt"]);
  expect(readme).toContain("Запомни: Montserrat BG = Montserrat");
  expect(readme).toContain(`Създаден на основата на Montserrat от ${font!.designer}`);
  expect(readMainName(zip["MontserratBG[wght].ttf"])).toBe("Montserrat BG");
  await expect(page.getByTestId("catalog-status")).toContainText("Montserrat BG.zip");
  await expect(page.getByTestId("catalog-error")).toBeHidden();

  // Only GitHub was asked, once per file and once for the license, at the pinned addresses.
  expect(asked.sort()).toEqual([...font!.files.map((f) => f.url), font!.licenseFile!].sort());
  expect(outside.every((url) => url.startsWith("https://raw.githubusercontent.com/google/fonts/"))).toBe(true);
});

test("catalog: the English page makes the same ZIP with an English README", async ({ page }) => {
  const font = catalogData.fonts.find((f) => f.slug === "montserrat" && f.group === "convert");
  test.skip(!font, "Montserrat is not in this catalog");
  await serveGithub(page, MONTSERRAT, MONTSERRAT_OFL);
  await page.goto(`/en/fonts/${font!.slug}/`);
  const { zip } = await getZip(page);
  const readme = new TextDecoder().decode(zip["README.txt"]);
  expect(readme).toContain("Remember: Montserrat BG = Montserrat");
  await expect(page.getByTestId("catalog-status")).toContainText("is downloaded");
  expect(await page.locator("body").innerText()).not.toMatch(/Конвертор|Свали|Грешка/);
});

test("catalog: a font whose license reserves a name is an ordinary one-click font with one line about it", async ({ page }) => {
  const font = catalogData.fonts.find((f) => f.group === "convert" && f.reservedNames.length > 0);
  test.skip(!font, "no converted entry with a reserved name in this catalog");
  await page.goto(`/fonts/${font!.slug}/`);
  await expect(page.locator("h1")).toHaveText(font!.name);
  await expect(page.getByTestId("catalog-figma-name")).toHaveText(`${font!.name} BG`); // the usual suffix
  await expect(page.getByTestId("catalog-download")).toHaveText("Изтегли за Figma"); // no other label
  await expect(page.getByTestId("catalog-reserved")).toHaveText(
    "Шрифтът има Reserved Font Name. Копието е за собствена употреба - не го разпространявай.",
  );
  await expect(page.getByTestId("catalog-reserved")).toHaveCount(1);

  await page.goto(`/en/fonts/${font!.slug}/`);
  await expect(page.getByTestId("catalog-reserved")).toHaveText(
    "This font has a Reserved Font Name. The copy is for your own use - don’t redistribute it.",
  );
  expect(await page.locator("body").innerText()).not.toMatch(/Шрифтът има Reserved Font Name/);
});

test("catalog: a font without a reserved name has no such line", async ({ page }) => {
  const font = catalogData.fonts.find((f) => f.group === "convert" && f.reservedNames.length === 0);
  test.skip(!font, "every converted entry has a reserved name in this catalog");
  await page.goto(`/fonts/${font!.slug}/`);
  await expect(page.getByTestId("catalog-reserved")).toHaveCount(0);
});

test("catalog: when the fetch fails the page says why, offers Google Fonts and the manual converter, and never a partial ZIP", async ({ page }) => {
  const font = firstWith("convert");
  test.skip(!font, "no entry to convert in this catalog");
  let downloads = 0;
  page.on("download", () => downloads++);
  const fail: { respond: Respond } = { respond: () => 404 };
  await serveGithub(page, MONTSERRAT, MONTSERRAT_OFL, (url) => fail.respond(url));
  await page.goto(`/fonts/${font!.slug}/`);

  const button = page.getByTestId("catalog-download");
  await button.click();
  const error = page.getByTestId("catalog-error");
  await expect(error).toBeVisible();
  await expect(page.getByTestId("catalog-error-text")).toContainText("GitHub върна грешка 404");
  await expect(page.getByTestId("catalog-error-original")).toHaveAttribute("href", originalUrl(font!));
  await expect(page.getByTestId("catalog-error-converter")).toHaveAttribute("href", "/#converter");
  await expect(button).toBeEnabled();
  expect(downloads).toBe(0);

  // The license is part of the ZIP: without it there is no ZIP, even when the fonts came.
  fail.respond = (url) => (url.endsWith("/OFL.txt") ? 404 : undefined);
  await button.click();
  await expect(page.getByTestId("catalog-error-text")).toContainText("OFL.txt");
  expect(downloads).toBe(0);

  // No connection at all.
  fail.respond = () => "abort";
  await button.click();
  await expect(page.getByTestId("catalog-error-text")).toContainText("Няма връзка с GitHub");
  expect(downloads).toBe(0);

  // A file that is not a font: the converter refuses it and the page names the file.
  const notAFont = Buffer.from("this is not a font");
  await page.unroute(GITHUB);
  await serveGithub(page, notAFont, MONTSERRAT_OFL);
  await button.click();
  await expect(page.getByTestId("catalog-error-text")).toContainText(font!.files[0].name);
  expect(downloads).toBe(0);

  // And after all that the button still works.
  await page.unroute(GITHUB);
  await serveGithub(page, MONTSERRAT, MONTSERRAT_OFL);
  const { zip } = await getZip(page);
  expect(Object.keys(zip)).toContain("README.txt");
  await expect(error).toBeHidden();
  expect(downloads).toBe(1);

  await page.goto(`/en/fonts/${font!.slug}/`);
  await page.unroute(GITHUB);
  await serveGithub(page, MONTSERRAT, MONTSERRAT_OFL, () => 500);
  await page.getByTestId("catalog-download").click();
  await expect(page.getByTestId("catalog-error-text")).toContainText("GitHub returned error 500");
  await expect(page.getByTestId("catalog-error-converter")).toHaveAttribute("href", "/en/#converter");
});

test("catalog: after a failed fetch the other downloads stop and the status stays quiet", async ({ page }) => {
  const font = firstWith("convert");
  test.skip(!font, "no entry to convert in this catalog");
  await page.route(GITHUB, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/OFL.txt")) return route.fulfill({ status: 404, body: "no", headers: CORS });
    await new Promise((resolve) => setTimeout(resolve, 1500)); // the fonts are slow
    await route.fulfill({ status: 200, body: MONTSERRAT, headers: CORS }).catch(() => {}); // cancelled by the page
  });
  await page.goto(`/fonts/${font!.slug}/`);
  await page.getByTestId("catalog-download").click();
  await expect(page.getByTestId("catalog-error-text")).toContainText("OFL.txt");
  await page.waitForTimeout(2500); // longer than the slow fonts take
  await expect(page.getByTestId("catalog-status")).toHaveText("");
});

test("catalog: a font that works as it is has no download, and its page says which set to turn on", async ({ page }) => {
  const font = firstWith("native");
  test.skip(!font, "no entry that works as it is in this catalog");
  const set = font!.nativeSet as string;
  await page.goto(`/fonts/${font!.slug}/`);
  await expect(page.locator("h1")).toHaveText(font!.name);
  await expect(page.getByTestId("catalog-badge")).toHaveCount(0);
  await expect(page.getByTestId("catalog-native")).toContainText(`Работи във Figma без конвертиране - включи ${set}`);
  await expect(page.getByTestId("catalog-download")).toHaveCount(0);
  await expect(page.locator("main a[download]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("ZIP");
  await expect(page.getByTestId("catalog-preview-note")).toContainText(set);

  // The preview is the original font with lang=bg, and that really changes the letters.
  const family = `catalog-${font!.slug}`;
  await expect.poll(() => page.evaluate((f) => document.fonts.check(`36px "${f}"`, "Д"), family)).toBe(true);
  const letters = page.getByTestId("letters");
  const withBg = await letters.screenshot({ animations: "disabled" });
  await letters.evaluate((node) => node.setAttribute("lang", "en"));
  expect(withBg.equals(await letters.screenshot({ animations: "disabled" })), "lang=bg changes none of the letters").toBe(false);

  await page.goto(`/en/fonts/${font!.slug}/`);
  await expect(page.getByTestId("catalog-native")).toContainText(`Works in Figma without converting - turn on ${set}`);
  expect(await page.locator("body").innerText()).not.toMatch(/Конвертор|Работи/);
});

/** The family name of a font file inside a ZIP: the typographic family (name ID 16) when there is one, else ID 1. */
function readMainName(font: Uint8Array): string | undefined {
  const names = readNames(font);
  return names.get(16) ?? names.get(1);
}
