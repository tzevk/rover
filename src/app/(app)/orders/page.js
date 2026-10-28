import Link from "next/link";
import { BadgeIndianRupee, ClipboardList, Filter, HandCoins, ListFilter, SearchX, Wallet } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime, fmtTime, inr, qty, shiftDate, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Order history" };

const STATUSES = ["all", "pending", "delivered", "cancelled"];

export default async function OrdersPage({ searchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : shiftDate(today, -30);
  const to = isDate(sp.to) ? sp.to : today;
  const status = STATUSES.includes(sp.status) ? sp.status : "all";
  const q = (sp.q ?? "").trim();

  const where = ["DATE(o.booked_at) BETWEEN ? AND ?"];
  const params = [from, to];
  if (status !== "all") { where.push("o.status = ?"); params.push(status); }
  if (q) {
    where.push("(c.name LIKE ? OR o.vehicle_number LIKE ? OR o.id = ?)");
    params.push(`%${q}%`, `%${q}%`, Number(q) || 0);
  }

  const orders = await query(
    `SELECT o.*, c.name, c.id AS cid
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.booked_at DESC LIMIT 1000`,
    params,
  );

  const sum = (k) => orders.reduce((s, o) => s + (o.status === "delivered" ? Number(o[k]) || 0 : 0), 0);

  return (
    <>
      <PageHead icon={ClipboardList} title="Order history" subtitle="Every order: pending, delivered and cancelled." />
      <div className="stats">
        <Stat icon={ClipboardList} label="Orders in range" value={orders.length} />
        <Stat icon={BadgeIndianRupee} label="Delivered value" value={inr(sum("total_amount"))} />
        <Stat icon={HandCoins} tone="ok" label="Paid at delivery" value={inr(sum("paid_amount"))} />
        <Stat icon={Wallet} tone="danger" label="Left as balance" value={inr(sum("balance_amount"))} />
      </div>
      <Section icon={ListFilter} title="All orders" subtitle="Filter by booking date, status or search">
        <form className="filters">
          <label className="field"><span>Booked from</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <label className="field">
            <span>Status</span>
            <select className="select" name="status" defaultValue={status}>
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Search</span>
            <input className="input" name="q" defaultValue={q} placeholder="Customer, vehicle or order #" />
          </label>
          <button className="btn"><Filter size={16} /> Apply</button>
        </form>

        {orders.length === 0 ? (
          <EmptyState icon={SearchX} title="No orders found">Try a wider date range or a different status.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Booked</th><th>Customer</th><th>Status</th>
                  <th className="num">Ordered</th><th className="num">Delivered</th><th className="num">Rate</th>
                  <th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th>
                  <th>Vehicle</th><th>Arrival – Dispatch</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="cell-link" href={`/deliveries/${o.id}`}>#{o.id}</Link></td>
                    <td className="nowrap">{fmtDateTime(o.booked_at)}</td>
                    <td><Link className="cell-link" href={`/customers/${o.cid}`}>{o.name}</Link></td>
                    <td><span className={`badge badge-${o.status}`}>{o.status}</span></td>
                    <td className="num">{qty(o.ordered_qty)}</td>
                    <td className="num">{o.delivered_qty == null ? "—" : qty(o.delivered_qty)}</td>
                    <td className="num">{inr(o.rate)}</td>
                    <td className="num">{inr(o.total_amount)}</td>
                    <td className="num">{o.paid_amount == null ? "—" : inr(o.paid_amount)}</td>
                    <td className={`num ${o.balance_amount > 0 ? "due" : ""}`}>{o.balance_amount == null ? "—" : inr(o.balance_amount)}</td>
                    <td className="nowrap">{o.vehicle_number || "—"}</td>
                    <td className="nowrap">{o.arrival_time ? `${fmtTime(o.arrival_time)} – ${fmtTime(o.dispatch_time)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{orders.length} orders · delivered totals</td>
                  <td className="num">{qty(sum("delivered_qty"))}</td>
                  <td />
                  <td className="num">{inr(sum("total_amount"))}</td>
                  <td className="num">{inr(sum("paid_amount"))}</td>
                  <td className="num">{inr(sum("balance_amount"))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
