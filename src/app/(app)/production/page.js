import Link from "next/link";
import { Factory, Filter, Save, Trash2 } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { addProduction, deleteProduction } from "@/app/actions/production";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { qty, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.production");

export default async function ProductionPage({ searchParams }) {
  const user = await requireUser();
  const cid = user.company_id;
  const { t, fmtDate } = await getI18n();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : shiftDate(today, -6);
  const to = isDate(sp.to) ? sp.to : today;
  const isAdmin = user.role === "admin";

  const [materials, rows] = await Promise.all([
    query(`SELECT id, name, unit FROM materials WHERE company_id = ${cid} AND active = 1 ORDER BY name`),
    query(
      `SELECT e.*, m.name, m.unit, i.name AS input_name, i.unit AS input_unit, u.full_name
       FROM production_entries e
       JOIN materials m ON m.id = e.material_id
       LEFT JOIN materials i ON i.id = e.input_material_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.company_id = ${cid} AND e.deleted_at IS NULL AND e.prod_date BETWEEN ? AND ?
       ORDER BY e.prod_date DESC, e.id DESC LIMIT 200`,
      [from, to],
    ),
  ]);
  const totals = Object.values(rows.reduce((all, r) => {
    (all[r.name] ??= { name: r.name, unit: r.unit, qty: 0 }).qty += r.qty;
    return all;
  }, {}));

  return (
    <>
      <PageHead icon={Factory} title={t("nav.production")} subtitle={t("production.subtitle")} />

      {materials.length === 0 ? (
        <Section icon={Factory} title={t("production.add")} className="section-gap">
          <EmptyState icon={Factory} title={t("stock.noneTitle")}>
            <p>{t("stock.noneText")}</p>
            {isAdmin && <Link href="/stock" className="btn btn-primary">{t("stock.add")}</Link>}
          </EmptyState>
        </Section>
      ) : (
        <Section icon={Factory} title={t("production.add")} subtitle={t("production.addSubtitle")} className="section-gap">
          <div className="card-pad">
            <ActionForm action={addProduction} resetOnSuccess>
              <div className="fields">
                <label className="field"><span>{t("common.date")}</span><input className="input" type="date" name="prod_date" defaultValue={today} max={today} required /></label>
                <label className="field"><span>{t("production.shift")}</span>
                  <select className="select" name="shift" defaultValue="day">
                    <option value="day">{t("production.day")}</option>
                    <option value="night">{t("production.night")}</option>
                  </select>
                </label>
                <label className="field"><span>{t("production.material")}</span>
                  <select className="select" name="material_id" required defaultValue="">
                    <option value="" disabled>{t("expenses.choose")}</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>{t("production.output")}</span><input className="input num" type="number" name="qty" min="0.01" step="0.01" inputMode="decimal" required /></label>
              </div>
              <div className="fields">
                <label className="field"><span>{t("production.input")}</span>
                  <select className="select" name="input_material_id" defaultValue="">
                    <option value="">{t("production.noInput")}</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>{t("production.inputQty")}</span><input className="input num" type="number" name="input_qty" min="0.01" step="0.01" inputMode="decimal" /></label>
                <label className="field"><span>{t("common.details")}</span><input className="input" name="note" maxLength={255} /></label>
              </div>
              <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("production.save")}</SubmitButton></div>
            </ActionForm>
          </div>
        </Section>
      )}

      <Section icon={Filter} title={t("production.history")}
        subtitle={totals.map((x) => `${x.name}: ${qty(x.qty)} ${t(`unit.${x.unit}`)}`).join(" · ") || undefined}>
        <form className="filters">
          <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        {rows.length === 0 ? <EmptyState icon={Factory} title={t("production.none")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>{t("common.date")}</th><th>{t("production.material")}</th><th className="num">{t("production.output")}</th>
                <th>{t("production.input")}</th><th>{t("common.details")}</th>{isAdmin && <th />}
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDate(r.prod_date)}<div className="muted" style={{ fontSize: 12 }}>{t(`production.${r.shift}`)}</div></td>
                    <td><strong>{r.name}</strong></td>
                    <td className="num">{qty(r.qty)} {t(`unit.${r.unit}`)}</td>
                    <td>{r.input_name ? `${r.input_name} · ${qty(r.input_qty)} ${t(`unit.${r.input_unit}`)}` : "—"}</td>
                    <td>{r.note || "—"}<div className="muted" style={{ fontSize: 12 }}>{r.full_name || ""}</div></td>
                    {isAdmin && (
                      <td className="right">
                        <form action={deleteProduction.bind(null, r.id)}>
                          <ConfirmButton message={t("production.deleteConfirm")}><Trash2 size={14} /></ConfirmButton>
                        </form>
                      </td>
                    )}
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
