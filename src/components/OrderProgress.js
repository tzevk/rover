import { Check } from "lucide-react";
import { fmtTime, inr } from "@/lib/format";

// Where one order has got to, from booking to money. Dispatched and paid come straight from the
// order. Later payments settle a customer's balance rather than one order, so a balance left at
// delivery stays "due" here and the customer's ledger has the running figure.
export default function OrderProgress({ order, invoice, usesGst, t }) {
  const sent = order.status === "delivered";
  const steps = [
    { key: "booked", done: true, note: fmtTime(order.booked_at) },
    { key: "gate", done: Boolean(order.arrival_time), note: order.vehicle_number },
    { key: "weighed", done: order.net_kg != null || sent },
    { key: "dispatched", done: sent, note: fmtTime(order.dispatch_time) },
    ...(usesGst ? [{ key: "invoiced", done: Boolean(invoice), note: invoice?.number }] : []),
    { key: "paid", done: sent && order.balance_amount <= 0, note: sent && order.balance_amount > 0 ? t("track.due", { amount: inr(order.balance_amount) }) : null },
  ];
  const now = steps.findIndex((s) => !s.done);
  return (
    <ol className="order-progress" aria-label={t("track.label")} style={{ "--steps": steps.length }}>
      {steps.map((s, i) => (
        <li key={s.key} data-state={s.done ? "done" : i === now ? "now" : "next"} aria-current={i === now ? "step" : undefined}>
          <span className="order-dot">{s.done && <Check size={13} strokeWidth={3} />}</span>
          <strong>{t(`track.${s.key}`)}</strong>
          {s.note && <small>{s.note}</small>}
        </li>
      ))}
    </ol>
  );
}
