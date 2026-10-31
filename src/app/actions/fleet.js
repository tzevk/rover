"use server";

import { revalidatePath } from "next/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, cleanVehicle, saveVehicleNumber, transaction } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { isDate, num, text } from "@/lib/validate";

const optionalKg = (v) => { if (!v) return null; const n = num(v); return n > 0 ? n : NaN; };

export const addVehicle = guarded("addVehicle", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const number = cleanVehicle(formData.get("number"));
  const ownership = formData.get("ownership") === "own" ? "own" : "outside";
  const driver = text(formData.get("driver"), 100);
  const phone = text(formData.get("phone"), 20);
  const tare = optionalKg(formData.get("tare_kg"));
  if (!number) return { error: t("action.vehicle") };
  if (Number.isNaN(tare)) return { error: t("deliver.tareRule") };
  await transaction(async (tx) => {
    const id = await saveVehicleNumber(tx, user.company_id, number, tare);
    await tx.query("UPDATE vehicles SET ownership = ?, driver = ?, phone = ?, active = 1 WHERE id = ? AND company_id = ?", [ownership, driver || null, phone || null, id, user.company_id]);
    await audit(tx, user, "vehicle.save", "vehicle", id, { number, ownership, driver, tare });
  });
  invalidate(TAGS.vehicles);
  revalidatePath("/vehicles");
  return { ok: true, message: t("common.added", { name: number }) };
});

async function ownVehicle(tx, user, id) {
  const [vehicle] = await tx.query("SELECT id, number FROM vehicles WHERE id = ? AND company_id = ?", [id, user.company_id]);
  return vehicle;
}

// Fuel is also an expense. Both are written together, so the accounts can't miss it.
export const addFuel = guarded("addFuel", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const vehicleId = Number(formData.get("vehicle_id"));
  const date = String(formData.get("log_date") || todayISO());
  const litres = num(formData.get("litres"));
  const amount = num(formData.get("amount"));
  const odometer = formData.get("odometer_km") ? Math.round(num(formData.get("odometer_km"))) : null;
  if (!vehicleId) return { error: t("vehicles.chooseVehicle") };
  if (!isDate(date) || date > todayISO()) return { error: t("common.pickValidDate") };
  if (!(litres > 0)) return { error: t("vehicles.litresRule") };
  if (!(amount > 0)) return { error: t("common.amountPositive") };
  if (Number.isNaN(odometer) || odometer < 0) return { error: t("vehicles.odometerRule") };
  const rid = requestId(formData);
  const result = await transaction(async (tx) => {
    const vehicle = await ownVehicle(tx, user, vehicleId);
    if (!vehicle) return { error: t("vehicles.notFound") };
    const expense = await tx.query(
      "INSERT INTO expenses (company_id, expense_date, category, amount, description, created_by, request_id) VALUES (?, ?, 'fuel', ?, ?, ?, ?)",
      [user.company_id, date, amount, `${vehicle.number} · ${litres} L`, user.id, rid],
    );
    const res = await tx.query(
      "INSERT INTO fuel_logs (company_id, vehicle_id, log_date, litres, amount, odometer_km, expense_id, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, vehicleId, date, litres, amount, odometer, expense.insertId, user.id, rid],
    );
    await audit(tx, user, "fuel.add", "vehicle", vehicleId, { fuelId: res.insertId, date, litres, amount, odometer });
    return { ok: true, message: t("vehicles.fuelSaved", { vehicle: vehicle.number, amount: inr(amount) }) };
  });
  if (result.ok) {
    invalidate(TAGS.vehicles, TAGS.expenses);
    revalidatePath("/vehicles");
    revalidatePath("/expenses");
  }
  return result;
});

export const addMaintenance = guarded("addMaintenance", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const vehicleId = Number(formData.get("vehicle_id"));
  const date = String(formData.get("log_date") || todayISO());
  const description = text(formData.get("description"));
  const amount = num(formData.get("amount"));
  const nextDue = String(formData.get("next_due") || "");
  if (!vehicleId) return { error: t("vehicles.chooseVehicle") };
  if (!isDate(date) || date > todayISO()) return { error: t("common.pickValidDate") };
  if (!description) return { error: t("vehicles.workRequired") };
  if (!(amount > 0)) return { error: t("common.amountPositive") };
  if (nextDue && !isDate(nextDue)) return { error: t("common.pickValidDate") };
  const rid = requestId(formData);
  const result = await transaction(async (tx) => {
    const vehicle = await ownVehicle(tx, user, vehicleId);
    if (!vehicle) return { error: t("vehicles.notFound") };
    const expense = await tx.query(
      "INSERT INTO expenses (company_id, expense_date, category, amount, description, created_by, request_id) VALUES (?, ?, 'maintenance', ?, ?, ?, ?)",
      [user.company_id, date, amount, `${vehicle.number} · ${description}`.slice(0, 255), user.id, rid],
    );
    const res = await tx.query(
      "INSERT INTO maintenance_logs (company_id, vehicle_id, log_date, description, amount, next_due, expense_id, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, vehicleId, date, description, amount, nextDue || null, expense.insertId, user.id, rid],
    );
    await audit(tx, user, "maintenance.add", "vehicle", vehicleId, { maintenanceId: res.insertId, date, description, amount, nextDue });
    return { ok: true, message: t("vehicles.workSaved", { vehicle: vehicle.number, amount: inr(amount) }) };
  });
  if (result.ok) {
    invalidate(TAGS.vehicles, TAGS.expenses);
    revalidatePath("/vehicles");
    revalidatePath("/expenses");
  }
  return result;
});
