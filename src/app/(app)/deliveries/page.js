import Link from "next/link";
import { CheckCircle2, CircleCheckBig, ListFilter, Search, Truck } from "lucide-react";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime, inr, qty } from "@/lib/format";

export const metadata = { title: "Pending deliveries" };

export default async function DeliveriesPage({ searchParams }) {
  await requireUser();
  const { q = "", done } = await searchParams;
  const like = `%${q.trim()}%`;

  // Only pending orders are ever listed here — completed ones live in the Admin's order history.
  const orders = await query(
    `SELECT o.id, o.ordered_qty, o.rate, o.total_amount, o.booked_at, c.name, c.phone, u.full_name AS booked_by
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = o.booked_by
     WHERE o.status = 'pending' AND (c.name LIKE ? OR c.phone LIKE ? OR o.id = ?)
     ORDER BY o.booked_at`,
    [like, like, Number(q) || 0],
  );

  return (
    <>
      <PageHead icon={Truck} title="Pending deliveries" subtitle="Pick an order when its vehicle is loaded and dispatched." />

      {done && (
        <div className="alert alert-ok" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={18} /> Order #{done} delivered and the customer&apos;s balance has been updated.
        </div>
      )}

      <Section icon={ListFilter} title={`${orders.length} waiting`} subtitle="Oldest first">
        <form className="filters">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">Search</span>
            <input className="input" name="q" defaultValue={q} placeholder="Search customer, phone or order #" />
          </label>
          <button className="btn"><Search size={16} /> Search</button>
        </form>

        {orders.length === 0 ? (
          <EmptyState icon={q ? Search : CircleCheckBig} title={q ? "No matches" : "All caught up"}>
            {q ? "No pending orders match your search." : "There are no pending deliveries right now."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Total</th>
                  <th>Booked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap"><span className="badge badge-pending">#{o.id}</span></td>
                    <td>
                      <strong>{o.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{o.phone || "—"}</div>
                    </td>
                    <td className="num" data-label="Qty">{qty(o.ordered_qty)}</td>
                    <td className="num" data-label="Rate">{inr(o.rate)}</td>
                    <td className="num" data-label="Total">{inr(o.total_amount)}</td>
                    <td className="nowrap" data-label="Booked">
                      {fmtDateTime(o.booked_at)}
                      <div className="muted" style={{ fontSize: 12 }}>by {o.booked_by || "—"}</div>
                    </td>
                    <td className="right wide">
                      <Link href={`/deliveries/${o.id}`} className="btn btn-primary btn-sm">
                        <Truck size={14} /> Deliver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
