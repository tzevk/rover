import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PrintButton from "@/components/PrintButton";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { qty } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("challan.title");

// The slip that travels with the load. Quantities only: prices stay off it, so staff can print it.
export default async function ChallanPage({ params }) {
  const user = await requireUser();
  const { t, fmtDateTime } = await getI18n();
  const id = Number((await params).id);
  const [o] = await query(
    `SELECT o.*, c.name AS customer, c.phone AS customer_phone, c.address AS customer_address,
            m.name AS material, m.unit, co.name AS company, co.address AS company_address, co.phone AS company_phone, co.gstin
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN companies co ON co.id = o.company_id
     LEFT JOIN materials m ON m.id = o.material_id
     WHERE o.id = ? AND o.company_id = ${user.company_id} AND o.status = 'delivered'`,
    [id],
  );
  if (!o) notFound();
  const unit = o.unit ? ` ${t(`unit.${o.unit}`)}` : "";
  const row = (label, value) => value != null && value !== "" && <div><dt>{label}</dt><dd>{value}</dd></div>;

  return (
    <>
      <div className="row no-print" style={{ marginBottom: 14 }}>
        <Link href={user.role === "admin" ? `/deliveries/${o.id}` : "/deliveries"} className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> {t("nav.deliveries")}</Link>
        <PrintButton>{t("challan.print")}</PrintButton>
      </div>
      <article className="challan">
        <header>
          <div>
            <h1>{o.company}</h1>
            {o.company_address && <p>{o.company_address}</p>}
            <p>{[o.company_phone, o.gstin && `GSTIN ${o.gstin}`].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="challan-no"><span>{t("challan.title")}</span><strong>#{o.id}</strong></div>
        </header>
        <dl>
          {row(t("common.customer"), o.customer)}
          {row(t("common.phone"), o.customer_phone)}
          {row(t("common.address"), o.customer_address)}
          {row(t("production.material"), o.material)}
          {row(t("common.vehicle"), o.vehicle_number)}
          {row(t("deliver.passNo"), o.pass_no)}
          {row(t("deliver.arrived"), fmtDateTime(o.arrival_time))}
          {row(t("deliver.dispatched"), fmtDateTime(o.dispatch_time))}
          {row(t("deliver.gross"), o.gross_kg != null ? `${qty(o.gross_kg)} kg` : null)}
          {row(t("deliver.tare"), o.net_kg != null ? `${qty(o.tare_kg)} kg` : null)}
          {row(t("deliver.net"), o.net_kg != null ? `${qty(o.net_kg)} kg` : null)}
        </dl>
        <p className="challan-qty"><span>{t("deliver.deliveredQty")}</span><strong>{qty(o.delivered_qty)}{unit}</strong></p>
        <footer><span>{t("challan.driver")}</span><span>{t("challan.receiver")}</span></footer>
      </article>
    </>
  );
}
