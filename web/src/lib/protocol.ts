// Messages between the page and convert.worker.ts, plus the shapes core/ returns.
// The report types mirror core/src/langbg/report.py (`Report.to_dict()`).

export type Mode = "default" | "stylistic";

export interface FontInput {
  name: string;
  data: ArrayBuffer;
}

export interface ConvertOptions {
  mode: Mode;
  /** Appended to the family name, e.g. " BG". Ignored when `familyName` is set. */
  familySuffix?: string;
  /** Replaces the family name entirely (the visitor typed one). */
  familyName?: string;
}

export interface LookupInfo {
  index: number;
  type: number;
  kind: string;
  codepoints: number[];
  rule_count: number | null;
  via_context: boolean;
}

export interface StylisticSetInfo {
  tag: string;
  feature_index: number;
  ui_name: string | null;
  scripts: string[];
}

/** A warning from core: data with a stable `code`; the page words it (ui.ts). */
export interface CoreWarning {
  /** The BGR language system differs from the script's default in more than `locl`. */
  code: "langsys_mismatch";
  script: string;
  only_bgr: string[];
  only_default: string[];
}

export interface OutputInfo {
  mode: Mode;
  family: string;
  ps_name: string;
  stylistic_set: string | null;
  stylistic_set_name_id: number | null;
}

export interface Report {
  has_bgr_locl: boolean;
  family: string;
  ps_name: string;
  scripts: string[];
  lookups: LookupInfo[];
  codepoints: number[];
  characters: string;
  is_variable: boolean;
  is_cff: boolean;
  locl_varied_by_feature_variations: boolean;
  reserved_font_names: string[];
  designer: string | null;
  already_converted: boolean;
  /** Every ssXX tag in the font -> its UI name. Most of these do NOT give Bulgarian forms. */
  stylistic_set_names: Record<string, string | null>;
  /** Non-empty: the font already works in Figma through these stylistic sets. */
  bulgarian_stylistic_sets: StylisticSetInfo[];
  warnings: CoreWarning[];
  output: OutputInfo | null;
}

/** A `LangbgError` from core (stable `code`) or `internal_error`. */
export interface CoreError {
  code: string;
  message: string;
  [extra: string]: unknown;
}

export type FileAnalysis = { name: string } & ({ ok: true; report: Report } | { ok: false; error: CoreError });

export type FileConversion = { name: string } & (
  | { ok: true; fileName: string; data: ArrayBuffer; report: Report }
  | { ok: false; error: CoreError }
);

// --- page -> worker ---------------------------------------------------------

export type WorkerRequest =
  | { id: number; type: "preload" }
  | { id: number; type: "analyze"; files: FontInput[]; licenseText?: string }
  | { id: number; type: "convert"; files: FontInput[]; options: ConvertOptions };

// --- worker -> page ---------------------------------------------------------

export type Stage = "runtime" | "packages" | "ready" | "file";

export interface ProgressEvent {
  /** Request that caused it; 0 for runtime start-up, which is shared by all requests. */
  id: number;
  stage: Stage;
  /** For stage "file": the file name. Other stages: a developer note, never shown to people. */
  message: string;
  /** For stage "file": files finished / total. */
  done?: number;
  total?: number;
}

export type WorkerResponse =
  | ({ type: "progress" } & ProgressEvent)
  | {
      id: number;
      type: "result";
      result:
        | { kind: "preload" }
        | { kind: "analyze"; files: FileAnalysis[] }
        | { kind: "convert"; files: FileConversion[] };
    }
  | { id: number; type: "error"; message: string };
