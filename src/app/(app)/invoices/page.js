import Link from "next/link";
import { FileText, Filter, Landmark, Settings2 } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { EWB_INTER_STATE_LIMIT } from "@/lib/gst.mjs";
import { isMonth } from "@/lib/gst-report";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.invoices");

export default async function InvoicesPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDate } = await getI18n();
  const { month: requested } = await searchParams;
  const month = isMonth(requested) ? requested : todayISO().slice(0, 7);
  const [[company], rows] = await Promise.all([
    query("SELECT gst_enabled, ewb_intra_limit FROM companies WHERE id = ?", [cid]),
    query(
      `SELECT id, order_id, number, invoice_date, status, buyer_name, buyer_gstin, taxable_value, cgst, sgst, igst, total, ewb_no, supplier_gstin, place_of_supply
       FROM invoices WHERE company_id = ? AND DATE_FORMAT(invoice_date, '%Y-%m') = ? ORDER BY invoice_date DESC, id DESC LIMIT 1000`,
      [cid, month],
    ),
  ]);
  const issued = rows.filter((r) => r.status === "issued");
  const sum = (f) => issued.reduce((s, r) => s + r[f], 0);
  const needsBill = (r) => r.total > (r.supplier_gstin.slice(0, 2) === r.place_of_supply ? company.ewb_intra_limit : EWB_INTER_STATE_LIMIT);

  return (
    <>
      <PageHead icon={FileText} title={t("nav.invoices")} subtitle={t("invoices.subtitle")}>
        <Link className="btn btn-sm" href={`/gst?month=${month}`}><Landmark size={14} /> {t("nav.gst")}</Link>
      </PageHead>

      {!company.gst_enabled && (
        <div className="alert alert-info section-gap"><Settings2 size={18} /><span>{t("invoices.off")} <Link className="inline-link" href="/company">{t("invoices.turnOn")}</Link></span></div>
      )}

      <div className="stats">
        <Stat accent icon={FileText} label={t("invoices.count")} value={issued.length} hint={t("invoices.value", { amount: inr(sum("total")) })} />
        <Stat icon={Landmark} label={t("invoices.taxable")} value={inr(sum("taxable_value"))} />
        <Stat icon={Landmark} tone="brown" label={t("invoices.tax")} value={inr(sum("cgst") + sum("sgst") + sum("igst"))} />
      </div>

      <Section icon={FileText} title={t("invoices.list")} action={<HeadLink href={`/gst?month=${month}`}>{t("gst.open")}</HeadLink>}>
        <form className="filters">
          <label className="field"><span>{t("common.month")}</span><input className="input" type="month" name="month" defaultValue={month} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        {rows.length === 0 ? <EmptyState icon={FileText} title={t("invoices.none")}>{t("invoices.noneText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("invoice.number")}</th><th>{t("common.date")}</th><th>{t("common.customer")}</th><th className="num">{t("invoices.taxable")}</th><th className="num">{t("invoices.tax")}</th><th className="num">{t("common.total")}</th><th>{t("invoice.ewb")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">
                      <Link className="cell-link" href={`/invoices/${r.id}`}>{r.number}</Link>
                      {r.status === "cancelled" && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>{t("invoice.cancelled")}</span>}
                    </td>
                    <td className="nowrap">{fmtDate(r.invoice_date)}</td>
                    <td>{r.buyer_name}{r.buyer_gstin && <div className="muted" style={{ fontSize: 12 }}>{r.buyer_gstin}</div>}</td>
                    <td className="num">{inr(r.taxable_value)}</td>
                    <td className="num">{inr(r.cgst + r.sgst + r.igst)}</td>
                    <td className="num">{inr(r.total)}</td>
                    <td className="nowrap">{r.ewb_no || (r.status === "issued" && needsBill(r) ? <span className="badge badge-pending">{t("invoice.ewbNeeded")}</span> : "—")}</td>
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
