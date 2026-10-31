import { UNITS } from "@/lib/format";

export default function MaterialFields({ t, m }) {
  return (
    <>
      <div className="fields">
        <label className="field"><span>{t("common.nameRequired")}</span><input className="input" name="name" required maxLength={80} defaultValue={m?.name} placeholder={t("stock.namePlaceholder")} /></label>
        <label className="field"><span>{t("stock.unit")}</span>
          <select className="select" name="unit" defaultValue={m?.unit ?? "tonne"}>
            {UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t("stock.defaultRate")}</span><input className="input num" type="number" name="default_rate" min="0" step="0.01" inputMode="decimal" defaultValue={m?.default_rate} /></label>
      </div>
      <div className="fields">
        <label className="field"><span>{t("stock.opening")}</span><input className="input num" type="number" name="opening_stock" min="0" step="0.01" inputMode="decimal" defaultValue={m?.opening_stock} /></label>
        <label className="field"><span>{t("stock.lowAt")}</span><input className="input num" type="number" name="low_stock" min="0" step="0.01" inputMode="decimal" defaultValue={m?.low_stock} /></label>
        <label className="field"><span>{t("stock.kgPerUnit")}</span><input className="input num" type="number" name="kg_per_unit" min="0.01" step="0.01" inputMode="decimal" defaultValue={m?.kg_per_unit ?? 1000} required /><small>{t("stock.kgPerUnitHint")}</small></label>
      </div>
    </>
  );
}
