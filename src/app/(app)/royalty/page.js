import { Download, Filter, Gem, Plus, ScrollText, X } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { addPermit, closePermit } from "@/app/actions/royalty";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty, todayISO } from "@/lib/format";
import { isMonth } from "@/lib/gst-report";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { permitBalances, royaltyRegister } from "@/lib/royalty";

export const generateMetadata = pageTitle("nav.royalty");

const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export default async function RoyaltyPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDate, fmtDateTime } = await getI18n();
  const { month: requested } = await searchParams;
  const today = todayISO();
  const month = isMonth(requested) ? requested : today.slice(0, 7);
  const [rows, permits, materials] = await Promise.all([
    royaltyRegister(cid, `${month}-01`, monthEnd(month)),
    permitBalances(cid),
    query("SELECT id, name FROM materials WHERE company_id = ? AND active = 1 AND royalty_per_unit > 0 ORDER BY name", [cid]),
  ]);
  const totalDue = rows.reduce((s, r) => s + r.royalty_amount, 0);
  const missing = rows.filter((r) => !r.pass_no).length;
  const byMaterial = Object.values(rows.reduce((all, r) => {
    const m = (all[r.material] ??= { name: r.material, unit: r.unit, qty: 0, amount: 0 });
    m.qty += r.delivered_qty;
    m.amount += r.royalty_amount;
    return all;
  }, {}));

  return (
    <>
      <PageHead icon={Gem} title={t("nav.royalty")} subtitle={t("royalty.subtitle")} />
      <div className="alert alert-info section-gap"><ScrollText size={18} /><span>{t("royalty.portalNote")}</span></div>

      <div className="stats">
        <Stat accent icon={Gem} label={t("royalty.due")} value={inr(totalDue)} hint={t("royalty.loads", { n: rows.length })} />
        <Stat icon={ScrollText} tone={missing ? "danger" : "ok"} label={t("royalty.noPass")} value={missing} />
        {byMaterial.slice(0, 2).map((m) => <Stat key={m.name} icon={Gem} label={m.name} value={`${qty(m.qty)} ${t(`unit.${m.unit}`)}`} hint={inr(m.amount)} />)}
      </div>

      <Section icon={ScrollText} title={t("royalty.permits")} subtitle={t("royalty.permitsSubtitle")} className="section-gap">
        {permits.length === 0 ? <EmptyState icon={ScrollText} title={t("royalty.noPermits")}>{t("royalty.noPermitsText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("royalty.permit")}</th><th>{t("common.date")}</th><th className="num">{t("royalty.allowed")}</th><th className="num">{t("royalty.used")}</th><th className="num">{t("royalty.left")}</th><th /></tr></thead>
              <tbody>
                {permits.map((p) => {
                  const pct = Math.min(100, (p.used * 100) / p.qty_allowed);
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.permit_no}</strong><div className="muted" style={{ fontSize: 12 }}>{[p.site, p.material].filter(Boolean).join(" · ")}</div></td>
                      <td className="nowrap">{fmtDate(p.valid_from)} – {fmtDate(p.valid_to)}{p.valid_to < today && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>{t("royalty.expired")}</span>}</td>
                      <td className="num">{qty(p.qty_allowed)}</td>
                      <td className="num">{qty(p.used)}<div className="meter" role="img" aria-label={`${Math.round(pct)}%`}><span style={{ width: `${pct}%` }} className={pct >= 90 ? "over" : undefined} /></div></td>
                      <td className={`num${p.qty_allowed - p.used < 0 ? " due" : ""}`}>{qty(p.qty_allowed - p.used)}</td>
                      <td className="right">
                        <form action={closePermit.bind(null, p.id)}>
                          <ConfirmButton message={t("royalty.closeConfirm")} className="btn btn-ghost btn-sm"><X size={14} /> {t("royalty.close")}</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-pad">
          <ActionForm action={addPermit} resetOnSuccess>
            <div className="fields">
              <label className="field"><span>{t("royalty.permit")}</span><input className="input" name="permit_no" required maxLength={60} /></label>
              <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="valid_from" required /></label>
              <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="valid_to" required /></label>
            </div>
            <div className="fields">
              <label className="field"><span>{t("royalty.allowed")}</span><input className="input num" type="number" name="qty_allowed" min="0.01" step="0.01" inputMode="decimal" required /></label>
              <label className="field"><span>{t("production.material")}</span>
                <select className="select" name="material_id" defaultValue="">
                  <option value="">{t("royalty.allMaterials")}</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="field"><span>{t("common.note")}</span><input className="input" name="note" maxLength={255} /></label>
            </div>
            <div><SubmitButton><Plus size={16} /> {t("royalty.add")}</SubmitButton></div>
          </ActionForm>
        </div>
      </Section>

      <Section icon={Gem} title={t("royalty.register")} action={<a className="btn btn-sm" href={`/api/export/royalty?month=${month}`} download><Download size={14} /> CSV</a>}>
        <form className="filters">
          <label className="field"><span>{t("common.month")}</span><input className="input" type="month" name="month" defaultValue={month} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        {rows.length === 0 ? <EmptyState icon={Gem} title={t("royalty.none")}>{t("royalty.noneText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("common.date")}</th><th>{t("deliver.passNo")}</th><th>{t("common.vehicle")}</th><th>{t("production.material")}</th><th>{t("common.customer")}</th><th className="num">{t("common.qty")}</th><th className="num">{t("royalty.amount")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDateTime(r.dispatch_time)}</td>
                    <td>{r.pass_no || <span className="badge badge-pending">{t("royalty.noPass")}</span>}</td>
                    <td>{r.vehicle_number}</td>
                    <td>{r.material}</td>
                    <td>{r.customer}</td>
                    <td className="num">{qty(r.delivered_qty)} {t(`unit.${r.unit}`)}</td>
                    <td className="num">{inr(r.royalty_amount)}</td>
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
