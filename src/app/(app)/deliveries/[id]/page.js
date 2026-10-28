import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ClipboardList, PackageCheck, RotateCcw, Truck } from "lucide-react";
import ConfirmButton from "@/components/ConfirmButton";
import { PageHead, Section } from "@/components/ui";
import { cancelOrder, reopenOrder } from "@/app/actions/orders";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime, inr, qty } from "@/lib/format";
import DeliveryForm from "./DeliveryForm";

export const metadata = { title: "Deliver order" };

export default async function DeliverPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const [order] = await query(
    `SELECT o.*, c.name, c.phone, c.address
     FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    [Number(id)],
  );
  // Completed orders are hidden from workers entirely.
  if (!order || (order.status !== "pending" && user.role !== "admin")) notFound();

  return (
    <>
      <Link href="/deliveries" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Pending deliveries
      </Link>
      <PageHead icon={order.status === "pending" ? Truck : PackageCheck} eyebrow={order.name} title={`Order #${order.id}`}
        subtitle={order.status === "pending" ? "Fill in the vehicle, times, quantity and payment to complete it." : `Booked ${fmtDateTime(order.booked_at)}`}>
        <span className={`badge badge-${order.status}`}>{order.status}</span>
      </PageHead>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Section icon={order.status === "pending" ? Truck : PackageCheck} title={order.status === "pending" ? "Dispatch & payment" : "Delivery details"}>
          <div className="card-pad">
          {order.status === "pending" ? (
            <DeliveryForm order={order} />
          ) : (
            <dl className="kv">
              <dt>Vehicle</dt><dd>{order.vehicle_number || "—"}</dd>
              <dt>Arrived</dt><dd>{fmtDateTime(order.arrival_time)}</dd>
              <dt>Dispatched</dt><dd>{fmtDateTime(order.dispatch_time)}</dd>
              <dt>Delivered qty</dt><dd>{order.delivered_qty == null ? "—" : qty(order.delivered_qty)}</dd>
              <dt>Total</dt><dd>{inr(order.total_amount)}</dd>
              <dt>Paid</dt><dd>{inr(order.paid_amount)}</dd>
              <dt>Balance</dt><dd className={order.balance_amount > 0 ? "due" : ""}>{inr(order.balance_amount)}</dd>
            </dl>
          )}
          </div>
        </Section>

        <aside className="stack">
          <Section icon={ClipboardList} title="Booking" subtitle={order.phone ? `${order.name} · ${order.phone}` : order.name}>
            <div className="card-pad">
              <dl className="kv">
                <dt>Ordered qty</dt><dd>{qty(order.ordered_qty)}</dd>
                <dt>Rate</dt><dd>{inr(order.rate)}</dd>
                <dt>Booked total</dt><dd>{inr(order.ordered_qty * order.rate)}</dd>
                <dt>Booked</dt><dd>{fmtDateTime(order.booked_at)}</dd>
                <dt>Address</dt><dd>{order.address || "—"}</dd>
              </dl>
            </div>
          </Section>
          {user.role === "admin" && order.status === "pending" && (
            <form action={cancelOrder.bind(null, order.id)}>
              <ConfirmButton message={`Cancel order #${order.id}? This can't be undone.`}><Ban size={14} /> Cancel this order</ConfirmButton>
            </form>
          )}
          {user.role === "admin" && order.status === "delivered" && (
            <Section icon={RotateCcw} title="Entered by mistake?">
              <form action={reopenOrder.bind(null, order.id)} className="card-pad">
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                  Reopening moves it back to pending and reverses the customer&apos;s balance.
                  The old details stay in the activity log.
                </p>
                <ConfirmButton message={`Reopen order #${order.id}? Its delivery details will be cleared.`} className="btn btn-sm">
                  <RotateCcw size={14} /> Reopen delivery
                </ConfirmButton>
              </form>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
