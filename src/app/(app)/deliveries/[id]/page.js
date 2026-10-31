import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ClipboardList, FileText, PackageCheck, RotateCcw, Truck, Printer } from "lucide-react";
import ConfirmButton from "@/components/ConfirmButton";
import OrderProgress from "@/components/OrderProgress";
import Phone from "@/components/Phone";
import { PageHead, Section } from "@/components/ui";
import { cancelOrder, reopenOrder } from "@/app/actions/orders";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty } from "@/lib/format";
import { stateOfGstin } from "@/lib/gst.mjs";
import { billingProfile } from "@/lib/dispatch";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import DeliveryForm from "./DeliveryForm";

export const generateMetadata = pageTitle("deliver.title");

export default async function DeliverPage({ params }) {
  const user = await requireUser();
  const { t, fmtDateTime } = await getI18n();
  const { id } = await params;
  const [[order], vehicles, materials] = await Promise.all([query(
    `SELECT o.*, c.name, c.phone, c.address, c.gstin AS customer_gstin, c.state_code, m.name AS material, m.unit, m.kg_per_unit, m.gst_rate
     FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN materials m ON m.id = o.material_id WHERE o.id = ? AND o.company_id = ${user.company_id}`,
    [Number(id)],
  ), query(`SELECT number, tare_kg FROM vehicles WHERE company_id = ${user.company_id} AND active = 1 ORDER BY number`),
  query(`SELECT id, name, unit, kg_per_unit, gst_rate FROM materials WHERE company_id = ${user.company_id} AND active = 1 ORDER BY name`)]);
  // Completed orders are hidden from workers entirely.
  if (!order || (order.status !== "pending" && user.role !== "admin")) notFound();
  const profile = await billingProfile({ query }, user.company_id, order.site_id);
  const gst = profile.gst_enabled && profile.gstin
    ? { inclusive: Boolean(profile.rates_include_gst), state: stateOfGstin(profile.gstin), buyerState: order.state_code || stateOfGstin(order.customer_gstin) || stateOfGstin(profile.gstin) }
    : null;
  const [invoice] = order.status === "delivered"
    ? await query("SELECT id, number FROM invoices WHERE order_id = ? AND status = 'issued'", [order.id])
    : [];

  return (
    <>
      <Link href="/deliveries" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> {t("nav.deliveries")}
      </Link>
      <PageHead icon={order.status === "pending" ? Truck : PackageCheck} eyebrow={order.name} title={t("common.orderNo", { id: order.id })}
        subtitle={order.status === "pending" ? t("deliver.pendingSubtitle") : t("deliver.bookedAt", { when: fmtDateTime(order.booked_at) })}>
        <span className={`badge badge-${order.status}`}>{t(`status.${order.status}`)}</span>
      </PageHead>

      {order.status !== "cancelled" && <OrderProgress order={order} invoice={invoice} usesGst={Boolean(gst)} t={t} />}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Section icon={order.status === "pending" ? Truck : PackageCheck} title={t(order.status === "pending" ? "deliver.dispatchPayment" : "deliver.deliveryDetails")}>
          <div className="card-pad">
          {order.status === "pending" ? (
            <DeliveryForm order={order} vehicles={vehicles} materials={materials} gst={gst} />
          ) : (
            <dl className="kv">
              <dt>{t("common.vehicle")}</dt><dd>{order.vehicle_number || "—"}</dd>
              <dt>{t("deliver.arrived")}</dt><dd>{fmtDateTime(order.arrival_time)}</dd>
              <dt>{t("deliver.dispatched")}</dt><dd>{fmtDateTime(order.dispatch_time)}</dd>
              {order.material && <><dt>{t("production.material")}</dt><dd>{order.material}</dd></>}
              {order.net_kg != null && <><dt>{t("deliver.gross")}</dt><dd>{qty(order.gross_kg)} kg</dd><dt>{t("deliver.tare")}</dt><dd>{qty(order.tare_kg)} kg</dd><dt>{t("deliver.net")}</dt><dd>{qty(order.net_kg)} kg</dd></>}
              {order.pass_no && <><dt>{t("deliver.passNo")}</dt><dd>{order.pass_no}</dd></>}
              <dt>{t("deliver.deliveredQty")}</dt><dd>{order.delivered_qty == null ? "—" : qty(order.delivered_qty)}</dd>
              {order.tax_amount > 0 && <><dt>{t("invoices.tax")}</dt><dd>{inr(order.tax_amount)}</dd></>}
              <dt>{t("common.total")}</dt><dd>{inr(order.total_amount)}</dd>
              <dt>{t("common.paid")}</dt><dd>{inr(order.paid_amount)}{order.paid_mode && order.paid_amount > 0 ? ` · ${t(`pay.${order.paid_mode}`)}` : ""}</dd>
              <dt>{t("common.balance")}</dt><dd className={order.balance_amount > 0 ? "due" : ""}>{inr(order.balance_amount)}</dd>
            </dl>
          )}
          {order.status === "delivered" && (
            <div className="row" style={{ marginTop: 14 }}>
              <Link href={`/deliveries/${order.id}/challan`} className="btn btn-sm"><Printer size={14} /> {t("challan.print")}</Link>
              {invoice && <Link href={`/invoices/${invoice.id}`} className="btn btn-sm"><FileText size={14} /> {invoice.number}</Link>}
            </div>
          )}
          </div>
        </Section>

        <aside className="stack">
          <Section icon={ClipboardList} title={t("deliver.booking")} subtitle={order.phone ? <>{order.name} · <Phone number={order.phone} /></> : order.name}>
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
                  {invoice && ` ${t("deliver.reopenInvoice", { number: invoice.number })}`}
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
