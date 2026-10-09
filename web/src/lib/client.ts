// Promise wrapper around convert.worker.ts. The worker is created on first use.

import type {
  ConvertOptions,
  FileAnalysis,
  FileConversion,
  FontInput,
  ProgressEvent,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

type Pending = { resolve: (result: Extract<WorkerResponse, { type: "result" }>["result"]) => void; reject: (error: Error) => void };
// `Omit` does not distribute over a union, so spell it out.
type NewRequest = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

export class ConverterClient {
  onProgress: (event: ProgressEvent) => void = () => {};

  private worker?: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // Keep this exact `new Worker(new URL(...))` form: the bundler recognises it.
    const worker = new Worker(new URL("../worker/convert.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
    worker.onerror = (event) => this.failAll(new Error(event.message || "Worker crashed"));
    this.worker = worker;
    return worker;
  }

  private handle(message: WorkerResponse): void {
    if (message.type === "progress") {
      this.onProgress(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === "error") pending.reject(new Error(message.message));
    else pending.resolve(message.result);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined; // the next request starts a fresh worker
  }

  private request(message: NewRequest): Promise<Extract<WorkerResponse, { type: "result" }>["result"]> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id } as WorkerRequest);
    });
  }

  /** Loads Pyodide, fontTools and langbg without processing anything. */
  async preload(): Promise<void> {
    await this.request({ type: "preload" });
  }

  async analyze(files: FontInput[], licenseText?: string): Promise<FileAnalysis[]> {
    const result = await this.request({ type: "analyze", files, licenseText });
    if (result.kind !== "analyze") throw new Error("Unexpected worker reply");
    return result.files;
  }

  async convert(files: FontInput[], options: ConvertOptions): Promise<FileConversion[]> {
    const result = await this.request({ type: "convert", files, options });
    if (result.kind !== "convert") throw new Error("Unexpected worker reply");
    return result.files;
  }
}

export { runWhenIdle } from "./idle";
