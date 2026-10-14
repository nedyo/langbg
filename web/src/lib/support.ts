// The Ko-fi facade behind src/components/Support.astro. Before the first click nothing is
// requested from Ko-fi (an e2e test checks it). The floating button steps aside whenever it
// would cover one of the page's own buttons.

interface KofiOverlay {
  draw(user: string, options: Record<string, string>): void;
}

const LOAD_TIMEOUT = 4000; // short enough that the fallback still counts as the user's click
const RENDER_TIMEOUT = 6000;

/** The bottom-right corner both our button and Ko-fi's take, with some room around them. */
const CORNER = { width: 270, height: 96 };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("load error"));
    };
    document.head.append(script);
  });
}

function until<T>(check: () => T | null, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = (): void => {
      const value = check();
      if (value) resolve(value);
      else if (performance.now() - started > timeout) reject(new Error("timeout"));
      else window.setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Ko-fi draws two buttons (desktop and phone) and its stylesheet shows one of them. The shown
 * one, once its stylesheet has applied (the wrapper is then position: fixed).
 */
function shownKofiButton(): HTMLElement | null {
  for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe.floatingchat-container, iframe.floatingchat-container-mobi")) {
    const wrap = frame.parentElement;
    if (!wrap) continue;
    const style = getComputedStyle(wrap);
    if (style.position !== "fixed" || style.display === "none") continue;
    const button = frame.contentDocument?.querySelector<HTMLElement>(".floatingchat-donate-button");
    if (button) return button;
  }
  return null;
}

/** Ko-fi shows its button once its iframe is ready: the wrapper loses its inline opacity: 0. */
function kofiButtonVisible(): boolean {
  return [...document.querySelectorAll<HTMLElement>(".floatingchat-container-wrap, .floatingchat-container-wrap-mobi")].some(
    (wrap) => wrap.style.opacity !== "0" && getComputedStyle(wrap).display !== "none",
  );
}

/** Hides the floating buttons while one of the page's own buttons (or a [data-support-clear] block) is under them. */
function keepButtonsClear(): void {
  const root = document.documentElement;
  const covered = new Set<Element>();
  let observer: IntersectionObserver | null = null;

  const observe = (): void => {
    observer?.disconnect();
    covered.clear();
    root.classList.remove("support-tucked");
    // The observer's root shrinks to the bottom-right corner.
    const top = Math.max(0, window.innerHeight - CORNER.height);
    const left = Math.max(0, window.innerWidth - CORNER.width);
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) covered.add(entry.target);
          else covered.delete(entry.target);
        }
        root.classList.toggle("support-tucked", covered.size > 0);
      },
      { rootMargin: `-${top}px 0px 0px -${left}px` },
    );
    for (const element of document.querySelectorAll("main .button, main button, [data-support-clear]")) observer.observe(element);
  };

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(observe, 150);
  });
  observe();
}

export function setupSupport(): void {
  const button = document.getElementById("support-button") as HTMLButtonElement | null;
  if (!button) return;
  const { label = "", user = "", page = "", script = "" } = button.dataset;
  let state: "idle" | "loading" | "drawn" | "fallback" = "idle";

  const openPage = (): void => {
    window.open(page, "_blank", "noopener");
  };

  button.addEventListener("click", async () => {
    if (state === "fallback") return openPage();
    if (state !== "idle") return;
    state = "loading";
    button.setAttribute("aria-busy", "true");

    try {
      await loadScript(script);
      const overlay = (window as unknown as { kofiWidgetOverlay?: KofiOverlay }).kofiWidgetOverlay;
      if (!overlay) throw new Error("no widget");
      overlay.draw(user, {
        type: "floating-chat",
        "floating-chat.donateButton.text": label,
        "floating-chat.donateButton.background-color": "#fcbf47",
        "floating-chat.donateButton.text-color": "#323842",
        // No Google Fonts: the widget would load DM Sans from fonts.googleapis.com.
        "floating-chat.stylesheets": "[]",
      });
    } catch {
      state = "idle";
      button.removeAttribute("aria-busy");
      openPage();
      return;
    }

    state = "drawn";
    try {
      // Open the panel right away, so one click is enough.
      (await until(shownKofiButton, RENDER_TIMEOUT)).click();
      await until(kofiButtonVisible, RENDER_TIMEOUT);
      button.hidden = true;
    } catch {
      // Ko-fi drew nothing usable: from now on the button opens Ko-fi's page.
      state = "fallback";
      button.removeAttribute("aria-busy");
      openPage();
    }
  });

  button.hidden = false;
  keepButtonsClear();
}
