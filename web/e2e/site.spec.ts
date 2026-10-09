import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PANGRAM, SAMPLER_LETTERS } from "../src/i18n/ui";
import { catalogData, firstWith } from "./catalog-data";

// Words from the interface of one language that must never show on the other language's pages.
const BULGARIAN_UI = /Конвертор|Каталог|За проекта|Пусни|Конвертирай|Как се инсталира|Често задавани/;
const ENGLISH_UI = /Converter|Catalog|Drop your|Convert a font|How to install|Frequently asked/;

test("Bulgarian is the default and English lives under /en/, never mixed on one page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  expect(await page.locator("body").innerText()).not.toMatch(ENGLISH_UI);

  await page.goto("/en/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.locator("body").innerText()).not.toMatch(BULGARIAN_UI);
  await expect(page.locator("h1")).toHaveText("Bulgarian Cyrillic in Figma.");
});

test("every page names its translations: canonical, hreflang, Open Graph", async ({ page, baseURL }) => {
  const cases = [
    { bg: "/", en: "/en/" },
    { bg: "/fonts/", en: "/en/fonts/" },
    { bg: `/fonts/${catalogData.fonts[0].slug}/`, en: `/en/fonts/${catalogData.fonts[0].slug}/` },
    { bg: "/about/", en: "/en/about/" },
  ];
  const site = "https://langbg.com";
  for (const { bg, en } of cases) {
    for (const [lang, own] of [["bg", bg], ["en", en]] as const) {
      await page.goto(own);
      const attr = (selector: string, name: string) => page.locator(selector).first().getAttribute(name);
      expect(await attr("link[rel=canonical]", "href")).toBe(site + own);
      expect(await attr('link[rel=alternate][hreflang="bg"]', "href")).toBe(site + bg);
      expect(await attr('link[rel=alternate][hreflang="en"]', "href")).toBe(site + en);
      expect(await attr('link[rel=alternate][hreflang="x-default"]', "href")).toBe(site + bg);
      expect(await attr('meta[property="og:url"]', "content")).toBe(site + own);
      expect(await attr('meta[property="og:locale"]', "content")).toBe(lang === "bg" ? "bg_BG" : "en_US");
      expect(await attr('meta[property="og:image"]', "content")).toBe(`${site}/og/${lang}.png`);
      expect(await attr('meta[name="twitter:card"]', "content")).toBe("summary_large_image");
      expect((await page.title()).length).toBeGreaterThan(10);
      expect(((await attr('meta[name="description"]', "content")) ?? "").length).toBeGreaterThan(40);
      // The language switch leads to the same page in the other language.
      const switchLink = page.locator(".lang-switch a");
      await expect(switchLink).toHaveAttribute("href", lang === "bg" ? en : bg);
    }
  }
  // The Open Graph images exist.
  for (const lang of ["bg", "en"]) {
    const response = await page.request.get(`${baseURL}/og/${lang}.png`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});

test("sitemap lists every page in both languages, robots.txt points to it", async ({ request }) => {
  const index = await (await request.get("/sitemap-index.xml")).text();
  expect(index).toContain("https://langbg.com/sitemap-0.xml");
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  const routes = ["/", "/en/", "/fonts/", "/en/fonts/", "/about/", "/en/about/"];
  for (const font of catalogData.fonts.slice(0, 5)) routes.push(`/fonts/${font.slug}/`, `/en/fonts/${font.slug}/`);
  for (const route of routes) {
    expect(sitemap).toContain(`<loc>https://langbg.com${route}</loc>`);
  }
  expect(sitemap).not.toContain("404");
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://langbg.com/sitemap-index.xml");
});

test("light and dark theme: the toggle switches and the choice is remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await paper();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#theme-toggle")).toHaveAttribute("aria-pressed", "true");
  const dark = await paper();
  expect(dark).not.toBe(light);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // set before first paint
  expect(await paper()).toBe(dark);
  // Without a saved choice the system setting decides.
  await page.evaluate(() => localStorage.clear());
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  expect(await paper()).toBe(dark);
});

test("the site's own font really has Bulgarian forms: every letter of the hero differs between bg and en", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const letters = [...SAMPLER_LETTERS];
  await page.evaluate((chars) => {
    const bench = document.createElement("div");
    bench.id = "bench";
    bench.style.cssText = "position:fixed;top:0;left:0;z-index:9999;background:#fff;color:#000;padding:10px;font:800 80px/1.2 var(--font-serif);display:flex;flex-wrap:wrap;gap:20px;width:1200px";
    for (const lang of ["en", "bg"]) {
      for (const ch of chars) {
        const cell = document.createElement("span");
        cell.dataset.lang = lang;
        cell.dataset.ch = ch;
        cell.lang = lang;
        cell.textContent = ch;
        bench.append(cell);
      }
    }
    document.body.append(bench);
  }, letters);
  await page.evaluate(() => document.fonts.ready);
  for (const ch of letters) {
    const shot = (lang: string) => page.locator(`#bench span[data-lang="${lang}"][data-ch="${ch}"]`).screenshot({ animations: "disabled" });
    const [withoutLanguage, bulgarian] = [await shot("en"), await shot("bg")];
    expect(withoutLanguage.equals(bulgarian), `"${ch}" looks the same with and without lang="bg"`).toBe(false);
  }
});

test("the hero sampler and the preview show the same text under both labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sampler-letters-now")).toHaveText([...SAMPLER_LETTERS].join(" "));
  await expect(page.locator(".sampler-letters-with")).toHaveText([...SAMPLER_LETTERS].join(" "));
  await expect(page.getByTestId("preview-now")).toHaveText(PANGRAM);
  await expect(page.getByTestId("preview-with")).toHaveText(PANGRAM);
  await expect(page.locator("#preview .specimen-label").nth(0)).toHaveText("Във Figma сега");
  await expect(page.locator("#preview .specimen-label").nth(1)).toHaveText("С langBG");
  await page.goto("/en/");
  await expect(page.locator("#preview .specimen-label").nth(0)).toHaveText("In Figma today");
  await expect(page.locator("#preview .specimen-label").nth(1)).toHaveText("With langBG");
  await expect(page.getByTestId("preview-with")).toHaveText(PANGRAM); // the sample text is Bulgarian on both sites
});

test("home page: install steps, the Dev Mode note and the FAQ are there, the FAQ opens without JavaScript", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#install .step")).toHaveCount(3);
  await expect(page.locator("#handoff")).toContainText('lang="bg"');
  await expect(page.locator("#handoff")).toContainText("Montserrat BG");
  const items = page.locator("#faq details");
  expect(await items.count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#faq")).toContainText("Качват ли се шрифтовете някъде?");
  await expect(page.locator("#faq")).toContainText("Трябва ли колегите ми да инсталират копието?");
  await items.first().locator("summary").click();
  await expect(items.first()).toHaveAttribute("open", "");
});

test("home page: code snippets take the page's language, keep the comment on its own line and copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const pages = [
    { path: "/", comment: "във Figma: Montserrat BG", copied: "Копирано", plugin: "Скоро: плъгин за Figma Dev Mode" },
    { path: "/en/", comment: "in Figma: Montserrat BG", copied: "Copied", plugin: "Coming soon: a Figma Dev Mode plugin" },
  ];
  for (const { path, comment, copied, plugin } of pages) {
    await page.goto(path);
    const snippets = page.locator("#handoff [data-snippet]");
    await expect(snippets).toHaveCount(2);
    await expect(page.locator("#handoff")).toContainText(plugin);

    // No snippet fixes its own language: `lang="en"` would take the Bulgarian forms out of a Cyrillic comment.
    expect(await page.locator("pre[lang], pre [lang]").count()).toBe(0);
    for (const pre of await snippets.locator("pre").all()) {
      await expect(pre).toHaveAttribute("translate", "no");
      expect(await pre.evaluate((node) => node.closest("[lang]")?.tagName)).toBe("HTML");
    }

    const css = snippets.nth(0);
    const expected = `/* ${comment} */\nfont-family: "Montserrat", sans-serif;`;
    expect(await css.locator("pre").textContent()).toBe(expected);
    await css.getByRole("button").click();
    await expect(css.getByRole("button")).toContainText(copied);
    // The Windows clipboard hands line breaks back as \r\n.
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
    expect(await clipboard()).toBe(expected);

    await snippets.nth(1).getByRole("button").click();
    expect(await clipboard()).toBe('<html lang="bg">');
  }
});

test("about page: who made it, LinkedIn, the code on GitHub, and open source credits with licenses", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.locator("main")).toContainText("Недялко Стоянов");
  await expect(page.locator('a[href="https://github.com/nedyo/langbg"]').first()).toHaveText("langBG в GitHub (отваря се в нов раздел)");
  await expect(page.getByTestId("linkedin")).toHaveAttribute("href", "https://www.linkedin.com/in/nedyalko-stoyanov/");
  await expect(page.getByTestId("linkedin")).toHaveText("Пиши ми в LinkedIn (отваря се в нов раздел)");
  await expect(page.locator("main")).not.toContainText(/кафе|Подкрепи/);

  const credits = page.getByTestId("credits");
  for (const [name, license, url] of [
    ["Pyodide", "MPL-2.0", "https://pyodide.org/"],
    ["fontTools", "MIT", "https://github.com/fonttools/fonttools"],
    ["fflate", "MIT", "https://github.com/101arrowz/fflate"],
  ]) {
    const row = credits.locator("li", { hasText: name });
    await expect(row).toContainText(license);
    await expect(row.locator(`a[href="${url}"]`)).toBeVisible();
  }

  await page.goto("/en/about/");
  await expect(page.locator("main")).toContainText("I’m Nedyalko Stoyanov");
  await expect(page.getByTestId("linkedin")).toHaveText("Message me on LinkedIn (opens in a new tab)");
  await expect(page.getByTestId("credits")).toContainText("Pyodide");
  expect(await page.locator("body").innerText()).not.toMatch(BULGARIAN_UI);
});

// Every page, in both languages, at the width of a small phone. The catalog pages come from
// catalog.json: one of each kind (converted, works as it is, reserved name) stands for the hundreds
// of pages the real catalog has, which share their layout. The unknown address makes
// the preview server answer with the 404 page; /en/404.html is the English one.
const catalogSlugs = (["convert", "native"] as const).flatMap((status) => firstWith(status)?.slug ?? []);
const PHONE_PAGES = [
  ...["", "/en"].flatMap((prefix) => [
    `${prefix}/`,
    `${prefix}/fonts/`,
    `${prefix}/about/`,
    ...catalogSlugs.map((slug) => `${prefix}/fonts/${slug}/`),
  ]),
  "/there-is-no-such-page/",
  "/en/404.html",
];

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of PHONE_PAGES) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const { scrollWidth, innerWidth, wide } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        // Whatever sticks out of the window, to name the culprit when this fails.
        wide: [...document.body.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").join(".") : ""}`),
      }));
      expect(scrollWidth, `${path} is wider than the window; sticking out: ${wide.join(", ") || "nothing found"}`).toBeLessThanOrEqual(innerWidth);
      // Code fits its box on a small phone, so nobody has to scroll a snippet sideways.
      const scrolling = await page.evaluate(() => [...document.querySelectorAll("pre")].filter((pre) => pre.scrollWidth > pre.clientWidth).map((pre) => pre.textContent));
      expect(scrolling, `${path}: code that scrolls sideways at 375px`).toEqual([]);
    });
  }
});

test("an unknown address gets the 404 page", async ({ page }) => {
  const response = await page.goto("/there-is-no-such-page/");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Тази страница я няма");
});

// Cloudflare answers an unknown address with the nearest 404.html up its path, so each language
// needs a 404.html in its own root folder (astro.config.mjs moves the English one there).
test("each language has its 404.html where Cloudflare looks for it", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const bg = readFileSync(new URL("404.html", dist), "utf8");
  const en = readFileSync(new URL("en/404.html", dist), "utf8");
  expect(bg).toContain('<html lang="bg"');
  expect(en).toContain('<html lang="en"');
  expect(existsSync(new URL("en/404/", dist))).toBe(false);
});

test("links to other sites open in a new tab and say so; links inside the site do not", async ({ page }) => {
  const checked = { external: 0, internal: 0 };
  for (const path of PHONE_PAGES) {
    await page.goto(path);
    const links = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((a) => {
        const link = a as HTMLAnchorElement;
        const url = new URL(link.href, location.href);
        return {
          href: link.getAttribute("href"),
          external: /^https?:$/.test(url.protocol) && url.host !== location.host,
          target: link.getAttribute("target"),
          rel: link.getAttribute("rel"),
          label: link.querySelector(".visually-hidden")?.textContent ?? null,
          icon: link.querySelector(".external-icon[aria-hidden='true']") !== null,
        };
      }),
    );
    const label = path.startsWith("/en/") ? " (opens in a new tab)" : " (отваря се в нов раздел)";
    for (const link of links) {
      const where = `${path} → ${link.href}`;
      if (link.external) {
        checked.external++;
        expect({ target: link.target, rel: link.rel, label: link.label, icon: link.icon }, where).toEqual({
          target: "_blank",
          rel: "noopener noreferrer",
          label,
          icon: true,
        });
      } else {
        checked.internal++;
        expect({ target: link.target, rel: link.rel, icon: link.icon }, where).toEqual({ target: null, rel: null, icon: false });
      }
    }
  }
  // The pages really have both kinds: GitHub, LinkedIn, credits, Google Fonts, the Figma forum.
  expect(checked.external).toBeGreaterThan(20);
  expect(checked.internal).toBeGreaterThan(20);
});
