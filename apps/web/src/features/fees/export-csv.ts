/* Client-side CSV download (Export on the Fees screen). */

const NEEDS_QUOTES = /[",\n\r]/;
const QUOTE = /"/g;
const REVOKE_AFTER_MS = 10_000;

function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(QUOTE, '""')}"` : text;
}

export function toCsv(
  header: string[],
  rows: (string | number | null)[][]
): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke later: revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
