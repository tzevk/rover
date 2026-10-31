import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, ClipboardCheck, History, Save } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import MaterialFields from "@/components/MaterialFields";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { recordCount, updateMaterial } from "@/app/actions/stock";
import { requireAdmin } from "@/lib/auth";
import { getStock, query } from "@/lib/db";
import { qty } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";

export const generateMetadata = pageTitle("nav.stock");

export default async function MaterialPage({ params }) {
  const user = await requireAdmin();
  const cid = user.company_id;
  const site = await currentSite(user);
  const { t, fmtDate } = await getI18n();
  const id = Number((await params).id);
  const m = (await getStock(cid, site)).find((x) => x.id === id);
  if (!m) notFound();

  const moves = await query(
    `SELECT 'made' AS kind, prod_date AS at, qty AS change_qty, note, id AS sort_id FROM production_entries
       WHERE company_id = ${cid} AND site_id = ${site.id} AND material_id = ? AND deleted_at IS NULL
     UNION ALL
     SELECT 'used', prod_date, -input_qty, note, id FROM production_entries
       WHERE company_id = ${cid} AND site_id = ${site.id} AND input_material_id = ? AND deleted_at IS NULL
     UNION ALL
     SELECT 'sold', DATE(delivered_at), -delivered_qty, CONCAT('#', id), id FROM orders
       WHERE company_id = ${cid} AND site_id = ${site.id} AND material_id = ? AND status = 'delivered'
     UNION ALL
     SELECT 'count', count_date, difference, note, id FROM stock_counts
       WHERE company_id = ${cid} AND site_id = ${site.id} AND material_id = ?
     ORDER BY at DESC, sort_id DESC LIMIT 80`,
    [id, id, id, id],
  );
  const unit = t(`unit.${m.unit}`);

  return (
    <>
      <Link href="/stock" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}><ArrowLeft size={14} /> {t("nav.stock")}</Link>
      <PageHead icon={Boxes} title={m.name} subtitle={t("stock.detailSubtitle")} />
      <div className="stats">
        <Stat accent icon={Boxes} label={t("stock.onHand")} value={`${qty(m.on_hand)} ${unit}`} />
        <Stat icon={Boxes} label={t("stock.reserved")} value={qty(m.reserved)} />
        <Stat icon={Boxes} tone="ok" label={t("stock.available")} value={qty(m.on_hand - m.reserved)} />
      </div>

      <div className="grid-2 section-gap">
        <Section icon={ClipboardCheck} title={t("stock.count")} subtitle={t("stock.countSubtitle")}>
          <div className="card-pad">
            <ActionForm action={recordCount} resetOnSuccess>
              <input type="hidden" name="material_id" value={m.id} />
              <div className="fields">
                <label className="field"><span>{t("stock.counted")}</span><input className="input num" type="number" name="counted_qty" min="0" step="0.01" inputMode="decimal" required /></label>
                <label className="field"><span>{t("common.details")}</span><input className="input" name="note" maxLength={255} /></label>
              </div>
              <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("stock.saveCount")}</SubmitButton></div>
            </ActionForm>
          </div>
        </Section>
        <Section icon={Boxes} title={t("stock.editMaterial")}>
          <div className="card-pad">
            <ActionForm action={updateMaterial}>
              <input type="hidden" name="id" value={m.id} />
              <MaterialFields t={t} m={m} />
              <label className="row" style={{ gap: 8 }}><input type="checkbox" name="active" defaultChecked={Boolean(m.active)} /> {t("stock.activeLabel")}</label>
              <div><SubmitButton className="btn"><Save size={16} /> {t("action.save")}</SubmitButton></div>
            </ActionForm>
          </div>
        </Section>
      </div>

      <Section icon={History} title={t("stock.movements")}>
        {moves.length === 0 ? <EmptyState icon={History} title={t("stock.noMovements")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("common.date")}</th><th>{t("common.type")}</th><th className="num">{t("common.qty")}</th><th>{t("common.details")}</th></tr></thead>
              <tbody>
                {moves.map((x, i) => (
                  <tr key={i}>
                    <td className="nowrap">{fmtDate(x.at)}</td>
                    <td>{t(`stock.move.${x.kind}`)}</td>
                    <td className={`num${x.change_qty < 0 ? " due" : " credit"}`}>{x.change_qty > 0 ? "+" : ""}{qty(x.change_qty)}</td>
                    <td>{x.note || "-"}</td>
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
