/** Starts `task` when the browser is idle after the page has loaded; never during first paint. */
export function runWhenIdle(task: () => void): void {
  const schedule = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(task, { timeout: 4000 });
    else setTimeout(task, 300); // Safari
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
