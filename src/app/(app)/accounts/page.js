import Link from "next/link";
import { ArrowDownLeft, BadgeIndianRupee, BookOpenCheck, ChevronLeft, ChevronRight, CreditCard, HandCoins, HardHat, Receipt, Scale, Truck } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ATTENDANCE, EXPENSE_CATEGORIES, fmtDate, fmtTime, inr, qty, shiftDate, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Daily accounts" };

export default async function AccountsPage({ searchParams }) {
  await requireAdmin();
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
      <PageHead icon={BookOpenCheck} title="Daily accounts" subtitle={fmtDate(date)}>
        <div className="date-nav">
          <Link className="btn btn-sm" href={`/accounts?date=${shiftDate(date, -1)}`} aria-label="Previous day"><ChevronLeft size={16} /></Link>
          <form className="row">
            <input className="input input-sm" type="date" name="date" defaultValue={date} max={today} />
            <button className="btn btn-sm">Go</button>
          </form>
          {date < today && (
            <Link className="btn btn-sm" href={`/accounts?date=${shiftDate(date, 1)}`} aria-label="Next day"><ChevronRight size={16} /></Link>
          )}
        </div>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Scale} label="Net cash" value={inr(net)} hint="cash in − expenses" />
        <Stat icon={BadgeIndianRupee} label="Sales (delivered)" value={inr(sales)} hint={<>{deliveries.length} loads · {qty(sum(deliveries, "delivered_qty"))} qty</>} />
        <Stat icon={HandCoins} tone="ok" label="Cash in" value={inr(cashIn)} hint={<>{inr(paidAtDelivery)} at delivery + {inr(laterPayments)} dues</>} />
        <Stat icon={Receipt} tone="danger" label="Expenses" value={inr(expenseTotal)} />
        <Stat icon={CreditCard} tone="brown" label="Credit given" value={inr(creditGiven)} hint="added to customer balances" />
        <Stat icon={HardHat} label="Wages earned" value={inr(wages)} hint={`net after wages ${inr(net - wages)}`} />
      </div>

      <div className="stack">
        <Section icon={Truck} title="Deliveries" subtitle={<>Also booked today: {booked.n} orders · {qty(booked.qty)} qty · {inr(booked.value)}</>}>
          {deliveries.length === 0 ? <EmptyState icon={Truck} title="No deliveries on this day" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Time</th><th>Order</th><th>Customer</th><th>Vehicle</th><th className="num">Qty</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
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
                <tfoot><tr><td colSpan={5}>Total</td><td className="num">{inr(sales)}</td><td className="num">{inr(paidAtDelivery)}</td><td className="num">{inr(creditGiven)}</td></tr></tfoot>
              </table>
            </div>
          )}
        </Section>

        <div className="grid-2" style={{ alignItems: "start" }}>
          <Section icon={ArrowDownLeft} title="Payments against dues" subtitle={`Total ${inr(laterPayments)}`}>
            {payments.length === 0 ? <EmptyState icon={HandCoins} title="No payments received" /> : (
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

          <Section icon={Receipt} title="Expenses" subtitle={`Total ${inr(expenseTotal)}`} action={<HeadLink href={`/expenses?from=${date}&to=${date}`}>Details</HeadLink>}>
            {byCategory.length === 0 ? <EmptyState icon={Receipt} title="No expenses" /> : (
              <table className="table">
                <tbody>
                  {byCategory.map(([k, v]) => (
                    <tr key={k}><td>{EXPENSE_CATEGORIES[k]}</td><td className="num">{inr(v)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Total</td><td className="num">{inr(expenseTotal)}</td></tr></tfoot>
              </table>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
