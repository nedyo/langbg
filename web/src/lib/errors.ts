// Turns an error from core into a sentence in the page's language. The converter and the catalog download share it.

import { format } from "../i18n/format";
import type { Dict } from "../i18n/ui";
import type { CoreError } from "./protocol";

export function describeError(errors: Dict["converter"]["errors"], error: CoreError): string {
  const known = (errors as Record<string, string>)[error.code];
  if (error.code === "internal_error") return format(errors.internal_error, { message: error.message });
  return known ?? format(errors.fallback, { message: error.message });
}
