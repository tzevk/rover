import { cached, TAGS } from "./cache";
import { customerBalances, query, stockLevels } from "./db";
import { inr, qty } from "./format";

const DELAY_DAYS = 2;       // a booked order waiting longer than this
const OVERDUE_DAYS = 30;    // a balance with no money received for this long
const VARIANCE_PCT = 2;     // stock counts are expected to land within about 1–2% of book
const UNUSUAL_TIMES = 3;    // an expense this many times the usual for its type
const UNUSUAL_MIN_SAMPLES = 5;
const SERVICE_DAYS = 7;

// Everything that needs a person, worked out from the records. Language-neutral, so it can be
// cached and worded by describeAlert on the way out.
export function getAlerts(companyId) {
  const cid = Number(companyId);
  return cached(`alerts:${cid}`, { tags: [TAGS.orders, TAGS.payments, TAGS.expenses, TAGS.customers, TAGS.stock, TAGS.vehicles], ttl: 60 }, async () => {
    const [stock, delayed, overdue, credit, counts, expenses, service] = await Promise.all([
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
