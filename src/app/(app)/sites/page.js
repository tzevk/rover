import { Banknote, Boxes, Filter, MapPin, Plus, Receipt, Save, Truck } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { addSite, updateSite } from "@/app/actions/sites";
import { requireAdmin } from "@/lib/auth";
import { query, stockLevels } from "@/lib/db";
import { inr, qty, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { getSites, withMain } from "@/lib/sites";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.sites");

function SiteFields({ t, site }) {
  return (
    <>
      <div className="fields">
        <label className="field"><span>{t("common.nameRequired")}</span><input className="input" name="name" required maxLength={80} defaultValue={site?.name} /></label>
        <label className="field"><span>{t("customer.place")}</span><input className="input" name="place" maxLength={60} defaultValue={site?.place ?? ""} /></label>
        <label className="field"><span>{t("company.pincode")}</span><input className="input" name="pincode" inputMode="numeric" maxLength={6} defaultValue={site?.pincode ?? ""} /></label>
      </div>
      <div className="fields">
        <label className="field"><span>{t("common.address")}</span><input className="input" name="address" maxLength={255} defaultValue={site?.address ?? ""} /></label>
        <label className="field"><span>GSTIN</span><input className="input" name="gstin" maxLength={15} defaultValue={site?.gstin ?? ""} style={{ textTransform: "uppercase" }} /><small>{t("sites.gstinHint")}</small></label>
      </div>
    </>
  );
}

export default async function SitesPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t } = await getI18n();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to : today;
  const sites = withMain(await getSites(cid));
  const range = [cid, from, to];

  const [sales, later, expenses, cash, made, stockBySite] = await Promise.all([
    query(
      `SELECT site_id, COUNT(*) AS loads, SUM(total_amount) AS sales, SUM(tax_amount) AS tax, SUM(paid_amount) AS paid, SUM(balance_amount) AS credit
       FROM orders WHERE company_id = ? AND status = 'delivered' AND DATE(delivered_at) BETWEEN ? AND ? GROUP BY site_id`,
      range,
    ),
    query("SELECT site_id, SUM(amount) AS amount FROM customer_payments WHERE company_id = ? AND deleted_at IS NULL AND paid_on BETWEEN ? AND ? GROUP BY site_id", range),
    query("SELECT site_id, SUM(amount) AS amount FROM expenses WHERE company_id = ? AND deleted_at IS NULL AND expense_date BETWEEN ? AND ? GROUP BY site_id", range),
    query("SELECT site_id, SUM(difference) AS difference, COUNT(*) AS days FROM cash_closings WHERE company_id = ? AND close_date BETWEEN ? AND ? GROUP BY site_id", range),
    query(
      `SELECT e.site_id, e.material_id, SUM(e.qty) AS qty FROM production_entries e
       WHERE e.company_id = ? AND e.deleted_at IS NULL AND e.prod_date BETWEEN ? AND ? GROUP BY e.site_id, e.material_id`,
      range,
    ),
    Promise.all(sites.map((s) => query(stockLevels(cid, s)).then((rows) => [s.id, rows]))),
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.site_id, r]));
  const [salesBy, laterBy, expensesBy, cashBy] = [by(sales), by(later), by(expenses), by(cash)];
  const stock = Object.fromEntries(stockBySite);
  const rows = sites.map((s) => {
    const sold = salesBy[s.id] ?? {};
    const collected = (sold.paid ?? 0) + (laterBy[s.id]?.amount ?? 0);
    const spent = expensesBy[s.id]?.amount ?? 0;
    return { ...s, loads: sold.loads ?? 0, sales: sold.sales ?? 0, tax: sold.tax ?? 0, credit: sold.credit ?? 0, collected, spent, net: collected - spent, cash: cashBy[s.id] ?? null };
  });
  const total = (k) => rows.reduce((sum, r) => sum + r[k], 0);
  const materials = (stock[sites[0].id] ?? []).filter((m) => m.active);
  const madeAt = (siteId, materialId) => made.find((m) => m.site_id === siteId && m.material_id === materialId)?.qty ?? 0;

  return (
    <>
      <PageHead icon={MapPin} title={t("nav.sites")} subtitle={t("sites.subtitle")} />

      <div className="stats">
        <Stat accent icon={Truck} label={t("accounts.sales")} value={inr(total("sales"))} hint={t("sites.loads", { n: total("loads") })} />
        <Stat icon={Banknote} tone="ok" label={t("sites.collected")} value={inr(total("collected"))} />
        <Stat icon={Receipt} tone="danger" label={t("nav.expenses")} value={inr(total("spent"))} />
        <Stat icon={Banknote} label={t("sites.net")} value={inr(total("net"))} />
      </div>

      <Section icon={MapPin} title={t("sites.compare")} className="section-gap">
        <form className="filters">
          <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("sites.site")}</th><th className="num">{t("sites.loadsHead")}</th><th className="num">{t("accounts.sales")}</th><th className="num">{t("sites.collected")}</th><th className="num">{t("accounts.creditGiven")}</th><th className="num">{t("nav.expenses")}</th><th className="num">{t("sites.net")}</th><th className="num">{t("cash.difference")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong>{!r.active && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>{t("stock.inactive")}</span>}</td>
                  <td className="num">{r.loads}</td>
                  <td className="num">{inr(r.sales)}</td>
                  <td className="num">{inr(r.collected)}</td>
                  <td className="num">{inr(r.credit)}</td>
                  <td className="num">{inr(r.spent)}</td>
                  <td className={`num${r.net < 0 ? " due" : ""}`}>{inr(r.net)}</td>
                  <td className={`num${r.cash?.difference ? " due" : ""}`}>{r.cash ? inr(r.cash.difference) : "—"}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && <tfoot><tr><td>{t("common.total")}</td><td className="num">{total("loads")}</td><td className="num">{inr(total("sales"))}</td><td className="num">{inr(total("collected"))}</td><td className="num">{inr(total("credit"))}</td><td className="num">{inr(total("spent"))}</td><td className="num">{inr(total("net"))}</td><td /></tr></tfoot>}
          </table>
        </div>
      </Section>

      <Section icon={Boxes} title={t("sites.stock")} subtitle={t("sites.stockSubtitle")} className="section-gap">
        {materials.length === 0 ? <EmptyState icon={Boxes} title={t("stock.noneTitle")}>{t("stock.noneText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("production.material")}</th>{rows.flatMap((r) => [<th key={r.id} className="num">{r.name}</th>, <th key={`m${r.id}`} className="num">{t("sites.made")}</th>])}</tr></thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong><div className="muted" style={{ fontSize: 12 }}>{t(`unit.${m.unit}`)}</div></td>
                    {rows.flatMap((r) => {
                      const level = stock[r.id].find((x) => x.id === m.id)?.on_hand ?? 0;
                      return [<td key={r.id} className={`num${level < 0 ? " due" : ""}`}>{qty(level)}</td>, <td key={`m${r.id}`} className="num muted">{qty(madeAt(r.id, m.id))}</td>];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section icon={Save} title={t("sites.manage")} subtitle={t("sites.manageSubtitle")} className="section-gap">
        <div className="card-pad stack">
          {sites.map((s) => (
            <details key={s.id} className="site-edit">
              <summary><MapPin size={15} /> {s.name}{!s.active && <span className="badge badge-cancelled">{t("stock.inactive")}</span>}</summary>
              <ActionForm action={updateSite}>
                <input type="hidden" name="id" value={s.id} />
                <SiteFields t={t} site={s} />
                <label className="row" style={{ gap: 8 }}><input type="checkbox" name="active" defaultChecked={Boolean(s.active)} /> {t("stock.activeLabel")}</label>
                <div><SubmitButton className="btn"><Save size={16} /> {t("action.save")}</SubmitButton></div>
              </ActionForm>
            </details>
          ))}
        </div>
      </Section>

      <Section icon={Plus} title={t("sites.add")}>
        <div className="card-pad">
          <ActionForm action={addSite} resetOnSuccess>
            <SiteFields t={t} />
            <div><SubmitButton><Plus size={16} /> {t("sites.add")}</SubmitButton></div>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
