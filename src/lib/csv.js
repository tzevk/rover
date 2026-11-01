// A spreadsheet can run a cell starting with these as a formula, so they're neutralised.
const cell = (v) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// The BOM makes Excel read Marathi names correctly.
export const csvText = (columns, rows) => `﻿${[columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n")}\r\n`;

export function csvResponse(filename, columns, rows) {
  return new Response(csvText(columns, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
