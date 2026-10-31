import { Container, Fuel, Plus, Save, Wrench } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { addFuel, addMaintenance, addVehicle } from "@/app/actions/fleet";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.vehicles");

export default async function VehiclesPage() {
  const user = await requireUser();
  const cid = user.company_id;
  const isAdmin = user.role === "admin";
  const { t, fmtDate } = await getI18n();
  const today = todayISO();
  const month = `${today.slice(0, 8)}01`;

  const [vehicles, recent] = await Promise.all([
    query(
      `SELECT v.*, COALESCE(o.trips, 0) AS trips, COALESCE(o.moved, 0) AS moved,
              COALESCE(f.litres, 0) AS litres, COALESCE(f.cost, 0) AS fuel_cost,
              COALESCE(m.cost, 0) AS work_cost, m.next_due
       FROM vehicles v
       LEFT JOIN (SELECT vehicle_id, COUNT(*) AS trips, SUM(delivered_qty) AS moved FROM orders
                  WHERE company_id = ${cid} AND status = 'delivered' AND delivered_at >= ? GROUP BY vehicle_id) o ON o.vehicle_id = v.id
       LEFT JOIN (SELECT vehicle_id, SUM(litres) AS litres, SUM(amount) AS cost FROM fuel_logs
                  WHERE company_id = ${cid} AND deleted_at IS NULL AND log_date >= ? GROUP BY vehicle_id) f ON f.vehicle_id = v.id
       LEFT JOIN (SELECT vehicle_id, SUM(IF(log_date >= ?, amount, 0)) AS cost, MAX(next_due) AS next_due FROM maintenance_logs
                  WHERE company_id = ${cid} AND deleted_at IS NULL GROUP BY vehicle_id) m ON m.vehicle_id = v.id
       WHERE v.company_id = ${cid}
       ORDER BY v.ownership = 'own' DESC, trips DESC, v.number`,
      [month, month, month],
    ),
    query(
      `SELECT 'fuel' AS kind, f.log_date AS at, v.number, CONCAT(f.litres, ' L') AS detail, f.amount, f.id AS sort_id
         FROM fuel_logs f JOIN vehicles v ON v.id = f.vehicle_id
         WHERE f.company_id = ${cid} AND f.deleted_at IS NULL
       UNION ALL
       SELECT 'work', l.log_date, v.number, l.description, l.amount, l.id
         FROM maintenance_logs l JOIN vehicles v ON v.id = l.vehicle_id
         WHERE l.company_id = ${cid} AND l.deleted_at IS NULL
       ORDER BY at DESC, sort_id DESC LIMIT 20`,
    ),
  ]);

  const picker = (
    <label className="field"><span>{t("common.vehicle")}</span>
      <select className="select" name="vehicle_id" required defaultValue="">
        <option value="" disabled>{t("expenses.choose")}</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <PageHead icon={Container} title={t("nav.vehicles")} subtitle={t("vehicles.subtitle")} />

      {vehicles.length > 0 && (
        <div className="grid-2 section-gap">
          <Section icon={Fuel} title={t("vehicles.fuel")} subtitle={t("vehicles.fuelSubtitle")}>
            <div className="card-pad">
              <ActionForm action={addFuel} resetOnSuccess>
                <div className="fields">
                  {picker}
                  <label className="field"><span>{t("common.date")}</span><input className="input" type="date" name="log_date" defaultValue={today} max={today} required /></label>
                  <label className="field"><span>{t("vehicles.litres")}</span><input className="input num" type="number" name="litres" min="0.01" step="0.01" inputMode="decimal" required /></label>
                  <label className="field"><span>{t("common.amountRs")}</span><input className="input num" type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" required /></label>
                  <label className="field"><span>{t("vehicles.odometer")}</span><input className="input num" type="number" name="odometer_km" min="0" step="1" inputMode="numeric" /></label>
                </div>
                <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("vehicles.saveFuel")}</SubmitButton></div>
              </ActionForm>
            </div>
          </Section>
          <Section icon={Wrench} title={t("vehicles.work")} subtitle={t("vehicles.fuelSubtitle")}>
            <div className="card-pad">
              <ActionForm action={addMaintenance} resetOnSuccess>
                <div className="fields">
                  {picker}
                  <label className="field"><span>{t("common.date")}</span><input className="input" type="date" name="log_date" defaultValue={today} max={today} required /></label>
                  <label className="field"><span>{t("vehicles.workDone")}</span><input className="input" name="description" required maxLength={200} /></label>
                  <label className="field"><span>{t("common.amountRs")}</span><input className="input num" type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" required /></label>
                  <label className="field"><span>{t("vehicles.nextDue")}</span><input className="input" type="date" name="next_due" /></label>
                </div>
                <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("vehicles.saveWork")}</SubmitButton></div>
              </ActionForm>
            </div>
          </Section>
        </div>
      )}

      {isAdmin && (
        <details className="card" style={{ marginBottom: 20 }}>
          <summary><Plus size={18} /> {t("vehicles.add")}</summary>
          <div className="card-pad">
            <ActionForm action={addVehicle} resetOnSuccess>
              <div className="fields">
                <label className="field"><span>{t("deliver.vehicleNumber")}</span><input className="input" name="number" required maxLength={20} placeholder="MH 12 AB 1234" style={{ textTransform: "uppercase" }} /></label>
                <label className="field"><span>{t("vehicles.ownership")}</span>
                  <select className="select" name="ownership" defaultValue="own">
                    <option value="own">{t("vehicles.own")}</option>
                    <option value="outside">{t("vehicles.outside")}</option>
                  </select>
                </label>
                <label className="field"><span>{t("vehicles.driver")}</span><input className="input" name="driver" maxLength={100} /></label>
                <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" maxLength={20} /></label>
                <label className="field"><span>{t("deliver.tare")}</span><input className="input num" type="number" name="tare_kg" min="1" step="1" inputMode="numeric" /></label>
              </div>
              <div><SubmitButton><Plus size={16} /> {t("vehicles.add")}</SubmitButton></div>
            </ActionForm>
          </div>
        </details>
      )}

      <Section icon={Container} title={t("vehicles.list")} subtitle={t("vehicles.listSubtitle")} className="section-gap">
        {vehicles.length === 0 ? <EmptyState icon={Container} title={t("vehicles.none")}><p>{t("vehicles.noneText")}</p></EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>{t("common.vehicle")}</th><th className="num">{t("vehicles.trips")}</th><th className="num">{t("deliver.tare")}</th>
                <th className="num">{t("vehicles.litres")}</th>{isAdmin && <th className="num">{t("vehicles.cost")}</th>}<th>{t("vehicles.nextDue")}</th>
              </tr></thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.number}</strong><div className="muted" style={{ fontSize: 12 }}>{t(`vehicles.${v.ownership}`)}{v.driver ? ` · ${v.driver}` : ""}</div></td>
                    <td className="num">{v.trips}</td>
                    <td className="num">{v.tare_kg ? qty(v.tare_kg) : "—"}</td>
                    <td className="num">{qty(v.litres)}</td>
                    {isAdmin && <td className="num">{inr(v.fuel_cost + v.work_cost)}</td>}
                    <td className={`nowrap${v.next_due && v.next_due <= today ? " due" : ""}`}>{v.next_due ? fmtDate(v.next_due) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {recent.length > 0 && (
        <Section icon={Fuel} title={t("vehicles.recent")}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("common.date")}</th><th>{t("common.vehicle")}</th><th>{t("common.details")}</th>{isAdmin && <th className="num">{t("common.amount")}</th>}</tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.kind}-${r.sort_id}`}>
                    <td className="nowrap">{fmtDate(r.at)}</td><td>{r.number}</td><td>{r.detail}</td>
                    {isAdmin && <td className="num">{inr(r.amount)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
