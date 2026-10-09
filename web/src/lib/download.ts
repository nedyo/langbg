// Hands a file to the visitor. Shared by the converter and the catalog download.

/** A file name that every system accepts: no path separators or reserved characters. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(fileName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
