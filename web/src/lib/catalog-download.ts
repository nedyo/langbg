// The catalog's download button. Nothing converted is hosted: the page fetches the original font
// files from GitHub (addresses pinned to a google/fonts commit), converts them in the same worker the
// converter uses, and hands the visitor a ZIP. If anything fails, the page shows why and sends the
// visitor to the family on Google Fonts and to the manual converter; a partial ZIP is never offered.

import { format } from "../i18n/format";
import type { Dict } from "../i18n/ui";
import type { CatalogFile } from "./catalog";
import { ConverterClient } from "./client";
import { $ } from "./dom";
import { downloadBlob } from "./download";
import { describeError } from "./errors";
import { progressText } from "./progress";
import type { ConvertOptions } from "./protocol";
import { buildZip } from "./zip";

interface Island {
  /** The family name of the original (what the README tells people to write in code). */
  name: string;
  convertedName: string;
  designer: string | null;
  files: CatalogFile[];
  licenseFile: string;
  get: Dict["fonts"]["detail"]["get"];
  runtime: Dict["converter"]["runtime"];
  errors: Dict["converter"]["errors"];
  readme: Dict["converter"]["readme"];
}

const FETCH_TIMEOUT_MS = 60_000;
const FETCH_PARALLEL = 4;
const SUFFIX = " BG";

/** An error whose message is already a sentence in the page's language. */
class Failure extends Error {}

const island = JSON.parse(document.getElementById("catalog-island")?.textContent ?? "null") as Island | null;

if (island) {
  const s = island.get;
  const client = new ConverterClient();
  const button = $<HTMLButtonElement>("get-button");
  const status = $("get-status");
  const errorBox = $("get-error");
  const errorText = $("get-error-text");
  let busy = false;

  const say = (text: string, stage?: string): void => {
    status.textContent = text;
    if (stage) status.dataset.stage = stage;
    else delete status.dataset.stage;
  };

  client.onProgress = (event) => say(progressText(island.runtime, event), event.stage === "file" ? "converting" : event.stage);

  async function fetchBytes(file: { name: string; url: string }, cancel: AbortSignal): Promise<ArrayBuffer> {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(file.url, { signal: AbortSignal.any([cancel, timeout]) });
      if (!response.ok) throw new Failure(format(s.httpError, { status: response.status, file: file.name }));
      const data = await response.arrayBuffer();
      if (!data.byteLength) throw new Failure(format(s.httpError, { status: 204, file: file.name }));
      return data;
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(timeout.aborted ? s.timeout : s.networkError);
    }
  }

  /** Fetches everything, a few at a time. The first failure cancels the rest, and they stay quiet. */
  async function fetchAll(items: { name: string; url: string }[]): Promise<ArrayBuffer[]> {
    const results: ArrayBuffer[] = new Array(items.length);
    const cancel = new AbortController();
    let next = 0;
    let done = 0;
    const lane = async (): Promise<void> => {
      while (!cancel.signal.aborted && next < items.length) {
        const index = next++;
        try {
          results[index] = await fetchBytes(items[index], cancel.signal);
        } catch (error) {
          cancel.abort();
          throw error;
        }
        if (cancel.signal.aborted) return; // another lane failed: its error is on the page, not this count
        say(format(s.fetching, { done: ++done, total: items.length }), "fetching");
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_PARALLEL, items.length) }, lane));
    return results;
  }

  async function start(): Promise<void> {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    errorBox.hidden = true;
    try {
      say(format(s.fetching, { done: 0, total: island!.files.length + 1 }), "fetching");
      const buffers = await fetchAll([...island!.files, { name: "OFL.txt", url: island!.licenseFile }]);
      const license = buffers.pop() as ArrayBuffer;
      const options: ConvertOptions = { mode: "default", familySuffix: SUFFIX };
      const inputs = island!.files.map((file, i) => ({ name: file.name, data: buffers[i] }));
      const results = await client.convert(inputs, options);

      const fonts = results.map((result) => {
        if (!result.ok) {
          throw new Failure(format(s.convertError, { file: result.name, message: describeError(island!.errors, result.error) }));
        }
        return { name: result.fileName, data: result.data };
      });
      const first = results[0];
      const family = (first?.ok && first.report.output?.family) || island!.convertedName;
      const zip = buildZip(island!.readme, {
        fonts,
        licenses: [{ name: "OFL.txt", data: license }],
        pairs: [{ name: family, original: island!.name, designer: island!.designer }],
        stylisticSet: null,
      });
      downloadBlob(zip, `${family}.zip`);
      say(format(s.done, { name: family }), "done");
    } catch (error) {
      say("", undefined);
      errorText.textContent =
        error instanceof Failure ? error.message : format(island!.runtime.error, { message: error instanceof Error ? error.message : String(error) });
      errorBox.hidden = false;
    } finally {
      busy = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  button.addEventListener("click", () => void start());
}
