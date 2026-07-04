/**
 * Minimal CSV serializer for exports.
 *
 * RFC-4180-ish: fields containing commas, quotes, or newlines are quoted and
 * embedded quotes doubled.  null/undefined serialize as empty fields.
 */

export interface CsvColumn {
  key: string;
  header: string;
}

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// ponytail: LF line endings — RFC 4180 says CRLF, but every consumer accepts LF.
export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns: CsvColumn[],
): string {
  const lines = [columns.map((c) => escapeField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c.key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
