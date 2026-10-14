import { expect, test, type Page } from "@playwright/test";

// The support button is a facade: Ko-fi's widget loads only after a click. These tests never
// reach the real Ko-fi: its script and page are replaced by local stand-ins.

const KOFI = /(^|\.)ko-fi\.com$/;
const isKofi = (url: string): boolean => KOFI.test(new URL(url).hostname);

/** A stand-in for Ko-fi's overlay script: draws a wrapper with an iframe holding a donate button. */
const FAKE_WIDGET = `
window.kofiWidgetOverlay = {
  draw(user, options) {
    window.__kofiDraw = { user, options };
    const wrap = document.createElement("div");
    wrap.className = "floatingchat-container-wrap";
    wrap.style.cssText = "position: fixed; bottom: 16px; height: 65px;";
    const frame = document.createElement("iframe");
    frame.className = "floatingchat-container";
    wrap.append(frame);
    document.body.append(wrap);
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<div class="floatingchat-donate-button closed">' + options["floating-chat.donateButton.text"] + "</div>");
    doc.close();
    doc.querySelector(".floatingchat-donate-button").addEventListener("click", () => { window.__kofiOpened = true; });
  },
};`;

function recordKofi(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (isKofi(request.url())) seen.push(request.url());
  });
  return seen;
}

test("no request goes to Ko-fi before the button is clicked", async ({ page }) => {
  const seen = recordKofi(page);
  for (const path of ["/", "/en/", "/fonts/", "/en/about/"]) {
    await page.goto(path);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("support-button")).toBeVisible();
  }
  expect(seen).toEqual([]);
  // Nothing from Ko-fi in the page either: no script tag, no preconnect.
  expect(await page.locator('[src*="ko-fi"], link[href*="ko-fi"]').count()).toBe(0);
});

test("the button: real <button>, label per language, accessible name, Ko-fi colours", async ({ page }) => {
  for (const [path, label, name] of [
    ["/", "Подкрепи проекта", "Подкрепи проекта в Ko-fi"],
    ["/en/", "Support the project", "Support the project on Ko-fi"],
  ]) {
    await page.goto(path!);
    const button = page.getByRole("button", { name });
    await expect(button).toHaveText(label!);
    await expect(button).toHaveAttribute("type", "button");
    expect(await button.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(el).position])).toEqual([
      "rgb(252, 191, 71)",
      "rgb(50, 56, 66)",
      "fixed",
    ]);
    await button.focus();
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  }
});

test("one click loads the widget, draws it with our label and colours, opens it and hides our button", async ({ page }) => {
  const seen = recordKofi(page);
  await page.route("https://storage.ko-fi.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_WIDGET }));
  await page.goto("/en/");
  await page.waitForLoadState("networkidle");
  expect(seen).toEqual([]);

  await page.getByTestId("support-button").click();
  await expect(page.getByTestId("support-button")).toBeHidden();
  expect(seen).toEqual(["https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"]);
  expect(await page.evaluate(() => (window as unknown as { __kofiOpened?: boolean }).__kofiOpened)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __kofiDraw: unknown }).__kofiDraw)).toEqual({
    user: "nedyalko",
    options: {
      type: "floating-chat",
      "floating-chat.donateButton.text": "Support the project",
      "floating-chat.donateButton.background-color": "#fcbf47",
      "floating-chat.donateButton.text-color": "#323842",
      "floating-chat.stylesheets": "[]",
    },
  });
});

test("if the widget can't load, Ko-fi's page opens in a new tab", async ({ page, context }) => {
  await context.route("https://storage.ko-fi.com/**", (route) => route.abort());
  await context.route("https://ko-fi.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Ko-fi</title>" }));
  await page.goto("/");
  const popup = page.waitForEvent("popup");
  await page.getByTestId("support-button").click();
  expect((await popup).url()).toBe("https://ko-fi.com/nedyalko");
  await expect(page.getByTestId("support-button")).toBeVisible(); // still there to try again
});

test("the footer has a plain Ko-fi link for visitors without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("footer-kofi")).toHaveAttribute("href", "https://ko-fi.com/nedyalko");
  await expect(page.getByTestId("footer-kofi")).toBeVisible();
  await expect(page.getByTestId("support-button")).toBeHidden(); // it needs JavaScript
  await context.close();
});

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the button steps aside from the converter's buttons and never covers the footer", async ({ page }) => {
    await page.goto("/");
    const support = page.getByTestId("support-button");
    await expect(support).toBeVisible();
    const scrollTo = (y: number) => page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);

    // Bring "Choose files" into the bottom-right corner, then away from it.
    const choose = await page.locator("#choose").evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    await scrollTo(choose - 812 + 30);
    await expect(support).toBeHidden(); // visibility: hidden, out of the tab order too
    await scrollTo(choose - 812 - 300);
    await expect(support).toBeVisible();

    await scrollTo(1e6);
    await expect(support).toBeVisible();
    const button = (await support.boundingBox())!;
    for (const link of await page.locator(".footer-links > *").all()) {
      const box = (await link.boundingBox())!;
      const overlaps = !(box.x + box.width < button.x || box.x > button.x + button.width || box.y + box.height < button.y || box.y > button.y + button.height);
      expect(overlaps, `the button covers "${await link.innerText()}"`).toBe(false);
    }
  });
});
