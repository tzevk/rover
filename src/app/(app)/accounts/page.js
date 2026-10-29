import Link from "next/link";
import { ArrowDownLeft, BadgeIndianRupee, BookOpenCheck, ChevronLeft, ChevronRight, CreditCard, HandCoins, HardHat, Receipt, Scale, Truck } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ATTENDANCE, EXPENSE_CATEGORIES, inr, qty, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.accounts");

export default async function AccountsPage({ searchParams }) {
  await requireAdmin();
  const { t, fmtDate, fmtTime } = await getI18n();
  const today = todayISO();
  const { date: requested } = await searchParams;
  const date = isDate(requested) && requested <= today ? requested : today;

  const [deliveries, [booked], payments, expenses, attendance] = await Promise.all([
    query(
      `SELECT o.id, o.delivered_qty, o.rate, o.total_amount, o.paid_amount, o.balance_amount, o.vehicle_number,
              o.delivered_at, c.name, c.id AS cid
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'delivered' AND DATE(o.delivered_at) = ? ORDER BY o.delivered_at`,
      [date],
    ),
    query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(ordered_qty), 0) AS qty, COALESCE(SUM(ordered_qty * rate), 0) AS value
       FROM orders WHERE DATE(booked_at) = ? AND status <> 'cancelled'`,
      [date],
    ),
    query(
      `SELECT p.id, p.amount, p.note, c.name, c.id AS cid FROM customer_payments p
       JOIN customers c ON c.id = p.customer_id WHERE p.paid_on = ? AND p.deleted_at IS NULL ORDER BY p.id`,
      [date],
    ),
    query("SELECT id, category, amount, description FROM expenses WHERE expense_date = ? AND deleted_at IS NULL ORDER BY id", [date]),
    query(
      `SELECT a.status, s.daily_wage FROM attendance a JOIN staff s ON s.id = a.staff_id WHERE a.att_date = ?`,
      [date],
    ),
  ]);

  const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const sales = sum(deliveries, "total_amount");
  const paidAtDelivery = sum(deliveries, "paid_amount");
  const creditGiven = sum(deliveries, "balance_amount");
  const laterPayments = sum(payments, "amount");
  const expenseTotal = sum(expenses, "amount");
  const cashIn = paidAtDelivery + laterPayments;
  const net = cashIn - expenseTotal;
  const wages = attendance.reduce((s, a) => s + a.daily_wage * ATTENDANCE[a.status].weight, 0);
  const byCategory = Object.keys(EXPENSE_CATEGORIES)
    .map((k) => [k, expenses.filter((e) => e.category === k).reduce((s, e) => s + e.amount, 0)])
    .filter(([, v]) => v > 0);

  return (
    <>
      <PageHead icon={BookOpenCheck} title={t("nav.accounts")} subtitle={fmtDate(date)}>
        <div className="date-nav">
          <Link className="btn btn-sm" href={`/accounts?date=${shiftDate(date, -1)}`} aria-label={t("common.prevDay")}><ChevronLeft size={16} /></Link>
          <form className="row">
            <input className="input input-sm" type="date" name="date" defaultValue={date} max={today} />
            <button className="btn btn-sm">{t("common.go")}</button>
          </form>
          {date < today && (
            <Link className="btn btn-sm" href={`/accounts?date=${shiftDate(date, 1)}`} aria-label={t("common.nextDay")}><ChevronRight size={16} /></Link>
          )}
        </div>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Scale} label={t("accounts.netCash")} value={inr(net)} hint={t("accounts.netCashHint")} />
        <Stat icon={BadgeIndianRupee} label={t("accounts.sales")} value={inr(sales)} hint={t("accounts.salesHint", { n: deliveries.length, qty: qty(sum(deliveries, "delivered_qty")) })} />
        <Stat icon={HandCoins} tone="ok" label={t("accounts.cashIn")} value={inr(cashIn)} hint={t("accounts.cashInHint", { atDelivery: inr(paidAtDelivery), dues: inr(laterPayments) })} />
        <Stat icon={Receipt} tone="danger" label={t("nav.expenses")} value={inr(expenseTotal)} />
        <Stat icon={CreditCard} tone="brown" label={t("accounts.creditGiven")} value={inr(creditGiven)} hint={t("accounts.creditHint")} />
        <Stat icon={HardHat} label={t("accounts.wages")} value={inr(wages)} hint={t("accounts.wagesHint", { amount: inr(net - wages) })} />
      </div>

      <div className="stack">
        <Section icon={Truck} title={t("accounts.deliveries")} subtitle={t("accounts.alsoBooked", { n: booked.n, qty: qty(booked.qty), value: inr(booked.value) })}>
          {deliveries.length === 0 ? <EmptyState icon={Truck} title={t("accounts.noDeliveries")} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t("common.time")}</th><th>{t("common.order")}</th><th>{t("common.customer")}</th><th>{t("common.vehicle")}</th><th className="num">{t("common.qty")}</th><th className="num">{t("common.total")}</th><th className="num">{t("common.paid")}</th><th className="num">{t("common.balance")}</th></tr></thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{fmtTime(d.delivered_at)}</td>
                      <td><Link className="cell-link" href={`/deliveries/${d.id}`}>#{d.id}</Link></td>
                      <td><Link className="cell-link" href={`/customers/${d.cid}`}>{d.name}</Link></td>
                      <td>{d.vehicle_number}</td>
                      <td className="num">{qty(d.delivered_qty)}</td>
                      <td className="num">{inr(d.total_amount)}</td>
                      <td className="num">{inr(d.paid_amount)}</td>
                      <td className={`num ${d.balance_amount > 0 ? "due" : ""}`}>{inr(d.balance_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={5}>{t("common.total")}</td><td className="num">{inr(sales)}</td><td className="num">{inr(paidAtDelivery)}</td><td className="num">{inr(creditGiven)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </Section>

        <div className="grid-2" style={{ alignItems: "start" }}>
          <Section icon={ArrowDownLeft} title={t("accounts.payments")} subtitle={t("common.totalOf", { amount: inr(laterPayments) })}>
            {payments.length === 0 ? <EmptyState icon={HandCoins} title={t("accounts.noPayments")} /> : (
              <table className="table">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td><Link className="cell-link" href={`/customers/${p.cid}`}>{p.name}</Link>{p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}</td>
                      <td className="num">{inr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section icon={Receipt} title={t("nav.expenses")} subtitle={t("common.totalOf", { amount: inr(expenseTotal) })} action={<HeadLink href={`/expenses?from=${date}&to=${date}`}>{t("common.details")}</HeadLink>}>
            {byCategory.length === 0 ? <EmptyState icon={Receipt} title={t("accounts.noExpenses")} /> : (
              <table className="table">
                <tbody>
                  {byCategory.map(([k, v]) => (
                    <tr key={k}><td>{t(`expense.${k}`)}</td><td className="num">{inr(v)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td>{t("common.total")}</td><td className="num">{inr(expenseTotal)}</td></tr></tfoot>
              </table>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
