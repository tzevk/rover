// A spreadsheet can run a cell starting with these as a formula, so they're neutralised.
const cell = (v) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function csvResponse(filename, columns, rows) {
  const body = [columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
  return new Response(`﻿${body}\r\n`, { // the BOM makes Excel read Marathi names correctly
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
