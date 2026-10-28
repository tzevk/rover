import Link from "next/link";
import {
  ArrowRight, BadgeIndianRupee, CalendarCheck, CircleCheckBig, Clock, HandCoins, LayoutDashboard,
  PlusCircle, Receipt, Scale, Sun, Truck, Wallet,
} from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CUSTOMER_BALANCES, query } from "@/lib/db";
import { fmtDateTime, inr, qty, todayISO } from "@/lib/format";
import { firstName, greeting } from "@/lib/greeting";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireUser();
  return user.role === "admin" ? <AdminDashboard user={user} /> : <WorkerHome user={user} />;
}

async function WorkerHome({ user }) {
  const today = todayISO();
  // Only counts of the worker's own work today — no amounts, no completed-order details.
  const [[{ pending }], [{ booked }], [{ delivered }]] = await Promise.all([
    query("SELECT COUNT(*) AS pending FROM orders WHERE status = 'pending'"),
    query("SELECT COUNT(*) AS booked FROM orders WHERE booked_by = ? AND DATE(booked_at) = ?", [user.id, today]),
    query("SELECT COUNT(*) AS delivered FROM orders WHERE delivered_by = ? AND DATE(delivered_at) = ?", [user.id, today]),
  ]);
  const tiles = [
    { href: "/orders/new", icon: PlusCircle, title: "Book new order", text: "Customer, quantity and rate." },
    { href: "/deliveries", icon: Truck, title: "Pending deliveries", text: "Vehicle, quantity and payment.", count: pending },
    { href: "/expenses", icon: Receipt, title: "Add expense", text: "Fuel, maintenance, transport, tea." },
    { href: "/attendance", icon: CalendarCheck, title: "Today's attendance", text: "Present, absent or half-day." },
  ];

  return (
    <>
      <PageHead icon={Sun} eyebrow={`${greeting()}, ${firstName(user.full_name)}`} title="Your day at the quarry"
        subtitle="Everything you need for today, one tap away." />

      <div className="stats">
        <Stat icon={PlusCircle} label="You booked today" value={booked} hint={booked === 1 ? "order" : "orders"} />
        <Stat icon={CircleCheckBig} tone="ok" label="You delivered today" value={delivered} hint={delivered === 1 ? "load" : "loads"} />
        <Stat icon={Clock} tone="brown" label="Waiting to deliver" value={pending} hint="across the quarry" />
      </div>

      <div className="tiles">
        {tiles.map(({ href, icon: Icon, title, text, count }) => (
          <Link key={href} href={href} className="card tile">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="ico"><Icon size={22} /></span>
              {count !== undefined && <span className="count">{count}</span>}
            </div>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <span className="tile-go"><ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>
    </>
  );
}

async function AdminDashboard({ user }) {
  const today = todayISO();
  const [[pending], [delivered], [payments], [expenses], [outstanding], oldestPending, topDue] = await Promise.all([
    query("SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS value FROM orders WHERE status = 'pending'"),
    query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(delivered_qty), 0) AS qty, COALESCE(SUM(total_amount), 0) AS sales,
              COALESCE(SUM(paid_amount), 0) AS paid
       FROM orders WHERE status = 'delivered' AND DATE(delivered_at) = ?`,
      [today],
    ),
    query("SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments WHERE paid_on = ? AND deleted_at IS NULL", [today]),
    query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date = ? AND deleted_at IS NULL", [today]),
    query(`SELECT COALESCE(SUM(outstanding), 0) AS total FROM (${CUSTOMER_BALANCES}) b WHERE outstanding > 0`),
    query(
      `SELECT o.id, o.ordered_qty, o.total_amount, o.booked_at, c.name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'pending' ORDER BY o.booked_at LIMIT 6`,
    ),
    query(`SELECT * FROM (${CUSTOMER_BALANCES}) b WHERE outstanding > 0 ORDER BY outstanding DESC LIMIT 6`),
  ]);
  const collected = delivered.paid + payments.total;

  return (
    <>
      <PageHead icon={LayoutDashboard} eyebrow={`${greeting()}, ${firstName(user.full_name)}`} title="Dashboard"
        subtitle="Here's how the quarry is doing today.">
        <Link href="/accounts" className="btn"><Scale size={16} /> Daily accounts</Link>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Wallet} label="Total outstanding" value={inr(outstanding.total)} hint="across all customers" />
        <Stat icon={BadgeIndianRupee} label="Today's sales" value={inr(delivered.sales)} hint={`${delivered.n} deliveries · ${qty(delivered.qty)} qty`} />
        <Stat icon={HandCoins} tone="ok" label="Collected today" value={inr(collected)} hint="at delivery + later payments" />
        <Stat icon={Receipt} tone="danger" label="Expenses today" value={inr(expenses.total)} hint={`net cash ${inr(collected - expenses.total)}`} />
        <Stat icon={Truck} tone="brown" label="Pending deliveries" value={pending.n} hint={`worth ${inr(pending.value)}`} />
      </div>

      <div className="grid-2">
        <Section icon={Clock} title="Waiting longest" subtitle="Oldest pending orders first"
          action={<HeadLink href="/deliveries">All pending</HeadLink>}>
          {oldestPending.length === 0 ? (
            <EmptyState icon={CircleCheckBig} title="All caught up">No pending orders right now.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {oldestPending.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="cell-link" href={`/deliveries/${o.id}`}>#{o.id} · {o.name}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(o.booked_at)}</div>
                      </td>
                      <td className="num">{qty(o.ordered_qty)}</td>
                      <td className="num">{inr(o.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section icon={Wallet} title="Highest balances" subtitle="Customers who owe the most"
          action={<HeadLink href="/customers">Balance report</HeadLink>}>
          {topDue.length === 0 ? (
            <EmptyState icon={CircleCheckBig} title="Nothing owed">Every customer is fully paid up.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {topDue.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link className="cell-link" href={`/customers/${c.id}`}>{c.name}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{c.phone || "—"}</div>
                      </td>
                      <td className="num due">{inr(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
