// The worker's progress, in the page's language. Shared by the converter and the catalog download.

import { format } from "../i18n/format";
import type { Dict } from "../i18n/ui";
import type { ProgressEvent } from "./protocol";

export function progressText(strings: Dict["converter"]["runtime"], event: ProgressEvent): string {
  if (event.stage === "file") {
    return format(strings.file, { done: (event.done ?? 0) + 1, total: event.total ?? 1, name: event.message });
  }
  return { runtime: strings.loadingPython, packages: strings.loadingPackages, ready: strings.ready }[event.stage];
}
