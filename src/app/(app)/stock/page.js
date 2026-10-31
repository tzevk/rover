import Link from "next/link";
import { AlertTriangle, Boxes, Layers, PackagePlus, Plus } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import MaterialFields from "@/components/MaterialFields";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { addMaterial } from "@/app/actions/stock";
import { requireUser } from "@/lib/auth";
import { getStock } from "@/lib/db";
import { qty } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";

export const generateMetadata = pageTitle("nav.stock");

export default async function StockPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const isAdmin = user.role === "admin";
  const all = await getStock(user.company_id, await currentSite(user));
  const materials = all.filter((m) => m.active);
  const low = materials.filter((m) => m.low_stock > 0 && m.on_hand <= m.low_stock);

  return (
    <>
      <PageHead icon={Boxes} title={t("nav.stock")} subtitle={t("stock.subtitle")} />
      <div className="stats">
        <Stat icon={Layers} label={t("stock.materials")} value={materials.length} />
        <Stat icon={AlertTriangle} tone={low.length ? "danger" : "ok"} label={t("stock.lowCount")} value={low.length} />
      </div>

      <Section icon={Boxes} title={t("stock.levels")} subtitle={t("stock.levelsSubtitle")}>
        {all.length === 0 ? <EmptyState icon={Boxes} title={t("stock.noneTitle")}><p>{t("stock.noneText")}</p></EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>{t("production.material")}</th><th className="num">{t("stock.onHand")}</th><th className="num">{t("stock.reserved")}</th>
                <th className="num">{t("stock.available")}</th><th className="num">{t("stock.produced")}</th><th className="num">{t("stock.delivered")}</th>
              </tr></thead>
              <tbody>
                {all.map((m) => {
                  const isLow = m.low_stock > 0 && m.on_hand <= m.low_stock;
                  const unit = t(`unit.${m.unit}`);
                  return (
                    <tr key={m.id}>
                      <td>
                        {isAdmin ? <Link className="cell-link" href={`/stock/${m.id}`}>{m.name}</Link> : <strong>{m.name}</strong>}
                        {isLow && <span className="badge badge-pending" style={{ marginLeft: 8 }}>{t("stock.low")}</span>}
                        {!m.active && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>{t("stock.inactive")}</span>}
                      </td>
                      <td className={`num${m.on_hand < 0 ? " due" : ""}`}>{qty(m.on_hand)} {unit}</td>
                      <td className="num">{qty(m.reserved)}</td>
                      <td className="num"><strong>{qty(m.on_hand - m.reserved)}</strong></td>
                      <td className="num">{qty(m.produced)}</td>
                      <td className="num">{qty(m.delivered)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {isAdmin && (
        <Section icon={PackagePlus} title={t("stock.add")} style={{ marginTop: 20 }}>
          <div className="card-pad">
            <ActionForm action={addMaterial} resetOnSuccess>
              <MaterialFields t={t} />
              <div><SubmitButton><Plus size={16} /> {t("stock.add")}</SubmitButton></div>
            </ActionForm>
          </div>
        </Section>
      )}
    </>
  );
}
