import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ClipboardList, PackageCheck, RotateCcw, Truck, Printer } from "lucide-react";
import ConfirmButton from "@/components/ConfirmButton";
import { PageHead, Section } from "@/components/ui";
import { cancelOrder, reopenOrder } from "@/app/actions/orders";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import DeliveryForm from "./DeliveryForm";

export const generateMetadata = pageTitle("deliver.title");

export default async function DeliverPage({ params }) {
  const user = await requireUser();
  const { t, fmtDateTime } = await getI18n();
  const { id } = await params;
  const [[order], vehicles] = await Promise.all([query(
    `SELECT o.*, c.name, c.phone, c.address, m.name AS material, m.unit, m.kg_per_unit
     FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN materials m ON m.id = o.material_id WHERE o.id = ? AND o.company_id = ${user.company_id}`,
    [Number(id)],
  ), query(`SELECT number, tare_kg FROM vehicles WHERE company_id = ${user.company_id} AND active = 1 ORDER BY number`)]);
  // Completed orders are hidden from workers entirely.
  if (!order || (order.status !== "pending" && user.role !== "admin")) notFound();

  return (
    <>
      <Link href="/deliveries" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> {t("nav.deliveries")}
      </Link>
      <PageHead icon={order.status === "pending" ? Truck : PackageCheck} eyebrow={order.name} title={t("common.orderNo", { id: order.id })}
        subtitle={order.status === "pending" ? t("deliver.pendingSubtitle") : t("deliver.bookedAt", { when: fmtDateTime(order.booked_at) })}>
        <span className={`badge badge-${order.status}`}>{t(`status.${order.status}`)}</span>
      </PageHead>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Section icon={order.status === "pending" ? Truck : PackageCheck} title={t(order.status === "pending" ? "deliver.dispatchPayment" : "deliver.deliveryDetails")}>
          <div className="card-pad">
          {order.status === "pending" ? (
            <DeliveryForm order={order} vehicles={vehicles} />
          ) : (
            <dl className="kv">
              <dt>{t("common.vehicle")}</dt><dd>{order.vehicle_number || "—"}</dd>
              <dt>{t("deliver.arrived")}</dt><dd>{fmtDateTime(order.arrival_time)}</dd>
              <dt>{t("deliver.dispatched")}</dt><dd>{fmtDateTime(order.dispatch_time)}</dd>
              {order.material && <><dt>{t("production.material")}</dt><dd>{order.material}</dd></>}
              {order.net_kg != null && <><dt>{t("deliver.gross")}</dt><dd>{qty(order.gross_kg)} kg</dd><dt>{t("deliver.tare")}</dt><dd>{qty(order.tare_kg)} kg</dd><dt>{t("deliver.net")}</dt><dd>{qty(order.net_kg)} kg</dd></>}
              {order.pass_no && <><dt>{t("deliver.passNo")}</dt><dd>{order.pass_no}</dd></>}
              <dt>{t("deliver.deliveredQty")}</dt><dd>{order.delivered_qty == null ? "—" : qty(order.delivered_qty)}</dd>
              <dt>{t("common.total")}</dt><dd>{inr(order.total_amount)}</dd>
              <dt>{t("common.paid")}</dt><dd>{inr(order.paid_amount)}</dd>
              <dt>{t("common.balance")}</dt><dd className={order.balance_amount > 0 ? "due" : ""}>{inr(order.balance_amount)}</dd>
            </dl>
          )}
          {order.status === "delivered" && <Link href={`/deliveries/${order.id}/challan`} className="btn btn-sm" style={{ marginTop: 14 }}><Printer size={14} /> {t("challan.print")}</Link>}
          </div>
        </Section>

        <aside className="stack">
          <Section icon={ClipboardList} title={t("deliver.booking")} subtitle={order.phone ? `${order.name} · ${order.phone}` : order.name}>
            <div className="card-pad">
              <dl className="kv">
                <dt>{t("deliver.orderedQty")}</dt><dd>{qty(order.ordered_qty)}</dd>
                <dt>{t("common.rate")}</dt><dd>{inr(order.rate)}</dd>
                <dt>{t("deliver.bookedTotal")}</dt><dd>{inr(order.ordered_qty * order.rate)}</dd>
                <dt>{t("common.booked")}</dt><dd>{fmtDateTime(order.booked_at)}</dd>
                <dt>{t("common.address")}</dt><dd>{order.address || "—"}</dd>
              </dl>
            </div>
          </Section>
          {user.role === "admin" && order.status === "pending" && (
            <form action={cancelOrder.bind(null, order.id)}>
              <ConfirmButton message={t("deliver.cancelConfirm", { id: order.id })}><Ban size={14} /> {t("deliver.cancelOrder")}</ConfirmButton>
            </form>
          )}
          {user.role === "admin" && order.status === "delivered" && (
            <Section icon={RotateCcw} title={t("deliver.mistake")}>
              <form action={reopenOrder.bind(null, order.id)} className="card-pad">
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                  {t("deliver.reopenText")}
                </p>
                <ConfirmButton message={t("deliver.reopenConfirm", { id: order.id })} className="btn btn-sm">
                  <RotateCcw size={14} /> {t("deliver.reopen")}
                </ConfirmButton>
              </form>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
