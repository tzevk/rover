import { cached, TAGS } from "./cache";
import { customerBalances, query, stockLevels } from "./db";
import { inr, qty, shiftDate, todayISO } from "./format";
import { EWB_INTER_STATE_LIMIT } from "./gst.mjs";
import { permitBalances } from "./royalty";

const DELAY_DAYS = 2;       // a booked order waiting longer than this
const OVERDUE_DAYS = 30;    // a balance with no money received for this long
const VARIANCE_PCT = 2;     // stock counts are expected to land within about 1–2% of book
const UNUSUAL_TIMES = 3;    // an expense this many times the usual for its type
const UNUSUAL_MIN_SAMPLES = 5;
const SERVICE_DAYS = 7;
const CASH_DAYS = 7;        // how far back a short or over cash count stays on the list
const PERMIT_PCT = 90;      // warn when a permit is this far used
const PERMIT_DAYS = 15;     // and this close to its end date

// Everything that needs a person, worked out from the records. Language-neutral, so it can be
// cached and worded by describeAlert on the way out.
export function getAlerts(companyId) {
  const cid = Number(companyId);
  return cached(`alerts:${cid}`, { tags: [TAGS.orders, TAGS.payments, TAGS.expenses, TAGS.customers, TAGS.stock, TAGS.vehicles, TAGS.cash], ttl: 60 }, async () => {
    const [stock, delayed, overdue, credit, counts, expenses, service, cashGaps, cashOpen, ewayDue, passMissing, permits] = await Promise.all([
      query(stockLevels(cid)),
      query(
        `SELECT o.id, c.name, DATEDIFF(NOW(), o.booked_at) AS days
         FROM orders o JOIN customers c ON c.id = o.customer_id
         WHERE o.company_id = ${cid} AND o.status = 'pending' AND o.booked_at < NOW() - INTERVAL ${DELAY_DAYS} DAY
         ORDER BY o.booked_at`,
      ),
      query(
        `SELECT b.id, b.name, b.outstanding, DATEDIFF(NOW(), GREATEST(COALESCE(p.last_paid, '1970-01-01'), COALESCE(o.last_paid, '1970-01-01'), o.first_sold)) AS days
         FROM (${customerBalances(cid)}) b
         JOIN (SELECT customer_id, MIN(delivered_at) AS first_sold, MAX(IF(paid_amount > 0, delivered_at, NULL)) AS last_paid
               FROM orders WHERE company_id = ${cid} AND status = 'delivered' GROUP BY customer_id) o ON o.customer_id = b.id
         LEFT JOIN (SELECT customer_id, MAX(paid_on) AS last_paid FROM customer_payments
                    WHERE company_id = ${cid} AND deleted_at IS NULL GROUP BY customer_id) p ON p.customer_id = b.id
         WHERE b.outstanding > 0
         HAVING days >= ${OVERDUE_DAYS}
         ORDER BY b.outstanding DESC`,
      ),
      query(`SELECT id, name, outstanding, credit_limit FROM (${customerBalances(cid)}) b WHERE credit_limit > 0 AND outstanding > credit_limit ORDER BY outstanding DESC`),
      query(
        `SELECT c.material_id, m.name, m.unit, c.difference, c.book_qty, c.count_date
         FROM stock_counts c JOIN materials m ON m.id = c.material_id
         WHERE c.company_id = ${cid} AND c.count_date >= CURDATE() - INTERVAL 30 DAY AND c.book_qty > 0
           AND ABS(c.difference) * 100 / c.book_qty > ${VARIANCE_PCT}
         ORDER BY c.id DESC`,
      ),
      query(
        `SELECT e.id, e.category, e.amount, e.expense_date, s.usual
         FROM expenses e JOIN (
           SELECT category, AVG(amount) AS usual, COUNT(*) AS n FROM expenses
           WHERE company_id = ${cid} AND deleted_at IS NULL AND expense_date >= CURDATE() - INTERVAL 90 DAY
           GROUP BY category HAVING n >= ${UNUSUAL_MIN_SAMPLES}
         ) s ON s.category = e.category
         WHERE e.company_id = ${cid} AND e.deleted_at IS NULL AND e.expense_date >= CURDATE() - INTERVAL 14 DAY
           AND e.amount > s.usual * ${UNUSUAL_TIMES}
         ORDER BY e.amount DESC`,
      ),
      query(
        `SELECT v.number, MAX(l.next_due) AS next_due
         FROM maintenance_logs l JOIN vehicles v ON v.id = l.vehicle_id
         WHERE l.company_id = ${cid} AND l.deleted_at IS NULL AND l.next_due IS NOT NULL
         GROUP BY v.id, v.number
         HAVING next_due <= CURDATE() + INTERVAL ${SERVICE_DAYS} DAY
         ORDER BY next_due`,
      ),
      query(
        `SELECT c.close_date, c.difference, s.name AS site FROM cash_closings c JOIN sites s ON s.id = c.site_id
         WHERE c.company_id = ${cid} AND c.difference <> 0 AND c.close_date >= CURDATE() - INTERVAL ${CASH_DAYS} DAY
         ORDER BY c.close_date DESC`,
      ),
      // Only sites that have started closing; a company that doesn't use it is never nagged.
      query(
        `SELECT s.name AS site, MAX(c.close_date) AS last FROM cash_closings c JOIN sites s ON s.id = c.site_id
         WHERE c.company_id = ${cid} AND s.active = 1 GROUP BY s.id, s.name
         HAVING last < CURDATE() - INTERVAL 1 DAY`,
      ),
      query(
        `SELECT i.id, i.number, i.total FROM invoices i JOIN companies c ON c.id = i.company_id
         WHERE i.company_id = ${cid} AND i.status = 'issued' AND i.ewb_no IS NULL AND i.invoice_date >= CURDATE() - INTERVAL 30 DAY
           AND i.total > IF(LEFT(i.supplier_gstin, 2) = i.place_of_supply, c.ewb_intra_limit, ${EWB_INTER_STATE_LIMIT})
         ORDER BY i.invoice_date, i.id`,
      ),
      query(
        `SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id
         WHERE o.company_id = ${cid} AND o.status = 'delivered' AND o.royalty_amount IS NOT NULL AND o.pass_no IS NULL
           AND o.dispatch_time >= NOW() - INTERVAL 30 DAY
         ORDER BY o.dispatch_time`,
      ),
      permitBalances(cid),
    ]);
    return [
      ...stock.filter((m) => m.on_hand < 0).map((m) => ({ kind: "negative", tone: "danger", href: `/stock/${m.id}`, name: m.name, qty: m.on_hand, unit: m.unit })),
      ...stock.filter((m) => m.on_hand >= 0 && m.low_stock > 0 && m.on_hand <= m.low_stock).map((m) => ({ kind: "low", tone: "warn", href: `/stock/${m.id}`, name: m.name, qty: m.on_hand, min: m.low_stock, unit: m.unit })),
      ...counts.map((c) => ({ kind: "variance", tone: "danger", href: `/stock/${c.material_id}`, name: c.name, qty: c.difference, unit: c.unit, pct: Math.abs(c.difference * 100 / c.book_qty) })),
      ...delayed.map((o) => ({ kind: "delayed", tone: "warn", href: `/deliveries/${o.id}`, id: o.id, name: o.name, days: o.days })),
      ...credit.map((c) => ({ kind: "credit", tone: "danger", href: `/customers/${c.id}`, name: c.name, amount: c.outstanding, limit: c.credit_limit })),
      ...overdue.map((c) => ({ kind: "overdue", tone: "danger", href: `/customers/${c.id}`, name: c.name, amount: c.outstanding, days: c.days })),
      ...expenses.map((e) => ({ kind: "expense", tone: "warn", href: "/expenses", category: e.category, amount: e.amount, usual: e.usual, date: e.expense_date })),
      ...service.map((v) => ({ kind: "service", tone: "warn", href: "/vehicles", name: v.number, date: v.next_due })),
      ...cashGaps.map((c) => ({ kind: c.difference < 0 ? "cashShort" : "cashOver", tone: "danger", href: `/cash?date=${c.close_date}`, name: c.site, amount: Math.abs(c.difference), date: c.close_date })),
      ...cashOpen.map((c) => ({ kind: "cashOpen", tone: "warn", href: "/cash", name: c.site, date: c.last })),
      ...ewayDue.map((i) => ({ kind: "eway", tone: "danger", href: `/invoices/${i.id}`, name: i.number, amount: i.total })),
      ...passMissing.map((o) => ({ kind: "pass", tone: "warn", href: `/deliveries/${o.id}`, id: o.id, name: o.name })),
      ...permits.filter((p) => p.used * 100 >= p.qty_allowed * PERMIT_PCT).map((p) => ({ kind: "permitUsed", tone: "danger", href: "/royalty", name: p.permit_no, pct: (p.used * 100) / p.qty_allowed })),
      ...permits.filter((p) => p.valid_to <= shiftDate(todayISO(), PERMIT_DAYS)).map((p) => ({ kind: "permitEnding", tone: "warn", href: "/royalty", name: p.permit_no, date: p.valid_to })),
    ];
  });
}

export function describeAlert(a, { t, fmtDate }) {
  const vars = { ...a };
  if (a.qty !== undefined) vars.qty = qty(a.qty);
  if (a.min !== undefined) vars.min = qty(a.min);
  if (a.unit) vars.unit = t(`unit.${a.unit}`);
  if (a.amount !== undefined) vars.amount = inr(a.amount);
  if (a.limit !== undefined) vars.limit = inr(a.limit);
  if (a.usual !== undefined) vars.usual = inr(a.usual);
  if (a.pct !== undefined) vars.pct = qty(a.pct);
  if (a.date) vars.date = fmtDate(a.date);
  if (a.category) vars.category = t(`expense.${a.category}`);
  return t(`alert.${a.kind}`, vars);
}
