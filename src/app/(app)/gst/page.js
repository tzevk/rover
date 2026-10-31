import Link from "next/link";
import { Download, FileSpreadsheet, FileText, Filter, Landmark } from "lucide-react";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { inr, qty, todayISO } from "@/lib/format";
import { gstReport, isMonth } from "@/lib/gst-report";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.gst");

export default async function GstPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t } = await getI18n();
  const { month: requested } = await searchParams;
  const month = isMonth(requested) ? requested : todayISO().slice(0, 7);
  const r = await gstReport(cid, month);
  const sheets = [["b2b", r.b2b.length], ["b2cl", r.b2cLarge.length], ["b2cs", r.b2cSmall.length], ["hsn", r.hsn.length], ["docs", r.docs.length]];

  return (
    <>
      <PageHead icon={Landmark} title={t("nav.gst")} subtitle={t("gst.subtitle")}>
        <Link className="btn btn-sm" href={`/invoices?month=${month}`}><FileText size={14} /> {t("nav.invoices")}</Link>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Landmark} label={t("invoices.taxable")} value={inr(r.totals.taxable)} hint={t("gst.invoices", { n: r.totals.count })} />
        <Stat icon={Landmark} label="CGST" value={inr(r.totals.cgst)} />
        <Stat icon={Landmark} label="SGST" value={inr(r.totals.sgst)} />
        <Stat icon={Landmark} label="IGST" value={inr(r.totals.igst)} />
      </div>

      <Section icon={Filter} title={t("gst.sheets")} subtitle={t("gst.sheetsSubtitle")} className="section-gap">
        <form className="filters">
          <label className="field"><span>{t("common.month")}</span><input className="input" type="month" name="month" defaultValue={month} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        <ul className="link-list">
          {sheets.map(([kind, n]) => (
            <li key={kind}>
              <FileSpreadsheet size={18} />
              <span><strong>{t(`gst.sheet.${kind}`)}</strong><small>{t(`gst.sheetHint.${kind}`)}</small></span>
              <span className="muted">{n}</span>
              <a className="btn btn-sm" href={`/api/export/gst?month=${month}&kind=${kind}`} download><Download size={14} /> CSV</a>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={FileSpreadsheet} title={t("gst.sheet.hsn")} subtitle={t("gst.hsnSubtitle")}>
        {r.hsn.length === 0 ? <EmptyState icon={FileSpreadsheet} title={t("invoices.none")}>{t("invoices.noneText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>HSN</th><th>{t("common.details")}</th><th className="num">{t("common.qty")}</th><th className="num">{t("gst.rate")}</th><th className="num">{t("invoices.taxable")}</th><th className="num">{t("invoices.tax")}</th></tr></thead>
              <tbody>
                {r.hsn.map((x) => (
                  <tr key={`${x.hsn_code}${x.uqc}${x.gst_rate}`}>
                    <td>{x.hsn_code}</td><td>{x.item_name}</td><td className="num">{qty(x.qty)} {x.uqc}</td><td className="num">{x.gst_rate}%</td>
                    <td className="num">{inr(x.taxable_value)}</td><td className="num">{inr(x.cgst + x.sgst + x.igst)}</td>
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
