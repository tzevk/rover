import { query } from "./db";
import { ledgerNames } from "./tally.mjs";
import { STATES } from "./gst.mjs";

const NEW_ONLY = (only, alias) => (only ? `AND ${alias}.tally_exported_at IS NULL` : "");

// Everything in a date range, as Tally vouchers. onlyNew leaves out what's already been imported.
export async function tallyData(cid, from, to, onlyNew) {
  const [[company], sales, atDelivery, receipts, expenses] = await Promise.all([
    query("SELECT name, tally_company, tally_ledgers FROM companies WHERE id = ?", [cid]),
    query(
      `SELECT o.id, DATE(o.delivered_at) AS date, c.name AS party, c.gstin, o.delivered_qty, o.rate, o.total_amount, o.vehicle_number,
              i.number, i.taxable_value, i.cgst, i.sgst, i.igst, i.total, i.place_of_supply, i.buyer_gstin
       FROM orders o JOIN customers c ON c.id = o.customer_id
       LEFT JOIN invoices i ON i.order_id = o.id AND i.status = 'issued'
       WHERE o.company_id = ? AND o.status = 'delivered' AND DATE(o.delivered_at) BETWEEN ? AND ? ${NEW_ONLY(onlyNew, "o")} ORDER BY o.delivered_at, o.id`,
      [cid, from, to],
    ),
    query(
      `SELECT o.id, DATE(o.delivered_at) AS date, c.name AS party, o.paid_amount AS amount, o.paid_mode AS mode, i.number
       FROM orders o JOIN customers c ON c.id = o.customer_id
       LEFT JOIN invoices i ON i.order_id = o.id AND i.status = 'issued'
       WHERE o.company_id = ? AND o.status = 'delivered' AND o.paid_amount > 0 AND DATE(o.delivered_at) BETWEEN ? AND ? ${NEW_ONLY(onlyNew, "o")} ORDER BY o.delivered_at, o.id`,
      [cid, from, to],
    ),
    query(
      `SELECT p.id, p.paid_on AS date, c.name AS party, p.amount, p.mode, p.note
       FROM customer_payments p JOIN customers c ON c.id = p.customer_id
       WHERE p.company_id = ? AND p.deleted_at IS NULL AND p.paid_on BETWEEN ? AND ? ${NEW_ONLY(onlyNew, "p")} ORDER BY p.paid_on, p.id`,
      [cid, from, to],
    ),
    query(
      `SELECT e.id, e.expense_date AS date, e.category, e.amount, e.paid_from, e.description
       FROM expenses e WHERE e.company_id = ? AND e.deleted_at IS NULL AND e.expense_date BETWEEN ? AND ? ${NEW_ONLY(onlyNew, "e")} ORDER BY e.expense_date, e.id`,
      [cid, from, to],
    ),
  ]);
  return {
    company: company.tally_company || "",
    ledgers: ledgerNames(company.tally_ledgers),
    sales: sales.map((s) => ({
      id: `rk-${cid}-sale-${s.id}`,
      date: s.date,
      number: s.number ?? `RK-${s.id}`,
      party: s.party,
      gstin: s.buyer_gstin ?? s.gstin,
      placeOfSupply: STATES[s.place_of_supply],
      narration: `Order ${s.id}, ${s.delivered_qty} at ${s.rate}, vehicle ${s.vehicle_number}`,
      taxable: s.taxable_value ?? s.total_amount,
      cgst: s.cgst ?? 0,
      sgst: s.sgst ?? 0,
      igst: s.igst ?? 0,
      total: s.total ?? s.total_amount,
    })),
    receipts: [
      ...atDelivery.map((r) => ({ id: `rk-${cid}-delivery-${r.id}`, date: r.date, number: `RCD-${r.id}`, party: r.party, mode: r.mode, amount: r.amount, narration: `Paid at delivery, order ${r.id}`, bill: { name: r.number ?? `RK-${r.id}`, type: "Agst Ref" } })),
      ...receipts.map((r) => ({ id: `rk-${cid}-receipt-${r.id}`, date: r.date, number: `RCP-${r.id}`, party: r.party, mode: r.mode, amount: r.amount, narration: r.note || "Payment received", bill: { name: `RCP-${r.id}`, type: "On Account" } })),
    ],
    payments: expenses.map((e) => ({ id: `rk-${cid}-expense-${e.id}`, date: e.date, number: `PAY-${e.id}`, category: e.category, from: e.paid_from, amount: e.amount, narration: e.description || e.category })),
  };
}

export const voucherCount = (d) => d.sales.length + d.receipts.length + d.payments.length;

// Records that reached Tally and were undone here afterwards: someone must remove them there.
export const undoneInTally = (cid) => query(
  `SELECT 'invoice' AS kind, number AS ref, cancelled_at AS at FROM invoices
     WHERE company_id = ? AND status = 'cancelled' AND tally_exported_at IS NOT NULL AND cancelled_at >= NOW() - INTERVAL 90 DAY
   UNION ALL
   SELECT 'payment', CONCAT('RCP-', id), deleted_at FROM customer_payments
     WHERE company_id = ? AND deleted_at IS NOT NULL AND tally_exported_at IS NOT NULL AND deleted_at >= NOW() - INTERVAL 90 DAY
   UNION ALL
   SELECT 'expense', CONCAT('PAY-', id), deleted_at FROM expenses
     WHERE company_id = ? AND deleted_at IS NOT NULL AND tally_exported_at IS NOT NULL AND deleted_at >= NOW() - INTERVAL 90 DAY
   ORDER BY at DESC LIMIT 100`,
  [cid, cid, cid],
);
