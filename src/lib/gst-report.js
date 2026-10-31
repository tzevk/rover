import { query } from "./db";
import { B2C_LARGE_LIMIT, STATES } from "./gst.mjs";

export const isMonth = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? ""));

const round = (n) => Math.round(n * 100) / 100;

function addUp(rows, key, fields) {
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    const g = groups.get(k) ?? { ...r, ...Object.fromEntries(fields.map((f) => [f, 0])) };
    for (const f of fields) g[f] = round(g[f] + Number(r[f]));
    groups.set(k, g);
  }
  return [...groups.values()];
}

// A month's invoices sorted the way GSTR-1 asks for them. A working paper for whoever files the
// return; the portal's own upload formats change, so this doesn't claim to be one of them.
export async function gstReport(cid, month) {
  const rows = await query(
    `SELECT id, number, invoice_date, status, supplier_gstin, buyer_name, buyer_gstin, place_of_supply, hsn_code, item_name, uqc, qty,
            taxable_value, gst_rate, cgst, sgst, igst, total, fy
     FROM invoices WHERE company_id = ? AND DATE_FORMAT(invoice_date, '%Y-%m') = ? ORDER BY invoice_date, id`,
    [cid, month],
  );
  const issued = rows.filter((r) => r.status === "issued").map((r) => ({
    ...r,
    state: STATES[r.place_of_supply] ?? r.place_of_supply,
    interState: r.supplier_gstin.slice(0, 2) !== r.place_of_supply,
  }));
  const b2b = issued.filter((r) => r.buyer_gstin);
  const b2cLarge = issued.filter((r) => !r.buyer_gstin && r.interState && r.total > B2C_LARGE_LIMIT);
  const b2cSmall = addUp(issued.filter((r) => !r.buyer_gstin && !(r.interState && r.total > B2C_LARGE_LIMIT)),
    (r) => `${r.place_of_supply}|${r.gst_rate}`, ["taxable_value", "cgst", "sgst", "igst", "total"]);
  const hsn = addUp(issued, (r) => `${r.hsn_code}|${r.uqc}|${r.gst_rate}`, ["qty", "taxable_value", "cgst", "sgst", "igst", "total"]);

  // Numbers used in the month, per series, for GSTR-1's documents table.
  const series = new Map();
  for (const r of rows) {
    const s = series.get(r.supplier_gstin) ?? { gstin: r.supplier_gstin, from: r.number, to: r.number, total: 0, cancelled: 0 };
    s.to = r.number;
    s.total += 1;
    if (r.status === "cancelled") s.cancelled += 1;
    series.set(r.supplier_gstin, s);
  }
  const sum = (f) => round(issued.reduce((s, r) => s + Number(r[f]), 0));
  return {
    b2b, b2cLarge, b2cSmall, hsn, docs: [...series.values()],
    totals: { taxable: sum("taxable_value"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total"), count: issued.length },
  };
}
