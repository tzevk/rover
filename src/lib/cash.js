import { query } from "./db";

// Cash that moved at a site between two dates, line by line. Only cash counts: UPI, bank and cheque
// money never reaches the cash box.
export async function cashMovements(cid, siteId, from, to) {
  const [sales, received, expenses] = await Promise.all([
    query(
      `SELECT o.id, o.paid_amount AS amount, o.delivered_at AS at, c.name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.company_id = ? AND o.site_id = ? AND o.status = 'delivered' AND o.paid_mode = 'cash' AND o.paid_amount > 0
         AND DATE(o.delivered_at) BETWEEN ? AND ? ORDER BY o.delivered_at`,
      [cid, siteId, from, to],
    ),
    query(
      `SELECT p.id, p.amount, p.paid_on AS at, c.name
       FROM customer_payments p JOIN customers c ON c.id = p.customer_id
       WHERE p.company_id = ? AND p.site_id = ? AND p.mode = 'cash' AND p.deleted_at IS NULL AND p.paid_on BETWEEN ? AND ? ORDER BY p.id`,
      [cid, siteId, from, to],
    ),
    query(
      `SELECT id, amount, expense_date AS at, category, description FROM expenses
       WHERE company_id = ? AND site_id = ? AND paid_from = 'cash' AND deleted_at IS NULL AND expense_date BETWEEN ? AND ? ORDER BY id`,
      [cid, siteId, from, to],
    ),
  ]);
  const sum = (rows) => Math.round(rows.reduce((s, r) => s + Number(r.amount) * 100, 0)) / 100;
  return { sales, received, expenses, cashSales: sum(sales), cashReceived: sum(received), cashExpenses: sum(expenses) };
}

// The period a closing on this date covers: the day after the previous closing, up to that date.
// A day nobody closed rolls into the next closing, so no cash ever falls between the cracks.
export async function closingPeriod(cid, siteId, date) {
  const [previous] = await query(
    "SELECT close_date, counted FROM cash_closings WHERE company_id = ? AND site_id = ? AND close_date < ? ORDER BY close_date DESC LIMIT 1",
    [cid, siteId, date],
  );
  return { previous: previous ?? null, from: previous ? nextDay(previous.close_date) : date };
}

function nextDay(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
