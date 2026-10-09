/// <reference lib="webworker" />
// Runs core/ (Python, fontTools) inside Pyodide. Everything is loaded lazily on the first
// request and served from this site: /runtime.json, /pyodide/<version>/* and the two wheels.

import type { FileAnalysis, FileConversion, Report, CoreError, WorkerRequest, WorkerResponse, Stage } from "../lib/protocol";

// The few Pyodide members we use (kept local so we do not depend on its type names).
interface PyProxy {
  toJs(options?: { dict_converter?: (entries: Iterable<[string, unknown]>) => unknown }): unknown;
  destroy(): void;
}
interface Pyodide {
  unpackArchive(buffer: ArrayBuffer, format: string): void;
  pyimport(name: string): {
    analyze_bytes(data: Uint8Array, licenseText?: string): PyProxy;
    convert_bytes(data: Uint8Array, fileName: string, mode: string, familySuffix?: string, familyName?: string): PyProxy;
    destroy(): void;
  };
}
type BytesApi = ReturnType<Pyodide["pyimport"]>;

interface RuntimeManifest {
  pyodide: string;
  wheels: { name: string; url: string; sha256: string }[];
}

type AnalyzeResult = { ok: true; report: Report } | { ok: false; error: CoreError };
type ConvertResult = { ok: true; file_name: string; report: Report } | { ok: false; error: CoreError };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function siteUrl(path: string): string {
  return new URL(import.meta.env.BASE_URL + path, ctx.location.origin).href;
}

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

function progress(id: number, stage: Stage, message: string, done?: number, total?: number): void {
  post({ type: "progress", id, stage, message, done, total });
}

// --- runtime ------------------------------------------------------------------

let booting: Promise<BytesApi> | undefined;

async function boot(): Promise<BytesApi> {
  // The messages of the start-up stages are developer notes; the page shows its own translated text.
  progress(0, "runtime", "loading Pyodide");
  // runtime.json is never cached; it names the Pyodide version, whose folder is cached for a year.
  const res = await fetch(siteUrl("runtime.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`runtime.json: HTTP ${res.status}`);
  const manifest = (await res.json()) as RuntimeManifest;
  const pyodideDir = `pyodide/${manifest.pyodide}/`;
  const { loadPyodide } = await import(/* @vite-ignore */ siteUrl(`${pyodideDir}pyodide.mjs`));
  const pyodide: Pyodide = await loadPyodide({ indexURL: siteUrl(pyodideDir) });

  progress(0, "packages", "loading fontTools and langbg");
  for (const wheel of manifest.wheels) {
    const response = await fetch(siteUrl(wheel.url));
    if (!response.ok) throw new Error(`${wheel.name}: HTTP ${response.status}`);
    pyodide.unpackArchive(await response.arrayBuffer(), "wheel");
  }
  const api = pyodide.pyimport("langbg.bytes_api");
  progress(0, "ready", "ready");
  return api;
}

function ready(): Promise<BytesApi> {
  // A failed boot is not cached, so the next request retries.
  booting ??= boot().catch((error) => {
    booting = undefined;
    throw error;
  });
  return booting;
}

// --- requests -----------------------------------------------------------------

function toPlain<T>(proxy: PyProxy): T {
  try {
    return proxy.toJs({ dict_converter: Object.fromEntries }) as T;
  } finally {
    proxy.destroy();
  }
}

function analyzeAll(api: BytesApi, id: number, request: Extract<WorkerRequest, { type: "analyze" }>): FileAnalysis[] {
  return request.files.map((file, i) => {
    progress(id, "file", file.name, i, request.files.length);
    const result = toPlain<AnalyzeResult>(api.analyze_bytes(new Uint8Array(file.data), request.licenseText));
    return { name: file.name, ...result };
  });
}

function convertAll(
  api: BytesApi,
  id: number,
  request: Extract<WorkerRequest, { type: "convert" }>,
  transfer: Transferable[],
): FileConversion[] {
  const { mode, familySuffix, familyName } = request.options;
  return request.files.map((file, i) => {
    progress(id, "file", file.name, i, request.files.length);
    const [result, bytes] = toPlain<[ConvertResult, Uint8Array | undefined]>(
      api.convert_bytes(new Uint8Array(file.data), file.name, mode, familySuffix, familyName),
    );
    if (!result.ok || !bytes) {
      return { name: file.name, ok: false, error: result.ok ? { code: "internal_error", message: "No font data returned" } : result.error };
    }
    const data = bytes.slice().buffer; // detached copy, safe to transfer
    transfer.push(data);
    return { name: file.name, ok: true, fileName: result.file_name, data, report: result.report };
  });
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const api = await ready();
    if (request.type === "preload") {
      post({ id: request.id, type: "result", result: { kind: "preload" } });
    } else if (request.type === "analyze") {
      const files = analyzeAll(api, request.id, request);
      post({ id: request.id, type: "result", result: { kind: "analyze", files } });
    } else {
      const transfer: Transferable[] = [];
      const files = convertAll(api, request.id, request, transfer);
      post({ id: request.id, type: "result", result: { kind: "convert", files } }, transfer);
    }
  } catch (error) {
    post({ id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
