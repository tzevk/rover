"use server";

import { revalidatePath } from "next/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { flash } from "@/lib/flash";
import { todayISO } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";
import { isDate, num, text } from "@/lib/validate";

export const addProduction = guarded("addProduction", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const date = String(formData.get("prod_date") || todayISO());
  const shift = formData.get("shift") === "night" ? "night" : "day";
  const materialId = Number(formData.get("material_id"));
  const quantity = num(formData.get("qty"));
  const inputId = Number(formData.get("input_material_id")) || null;
  const inputRaw = formData.get("input_qty");
  const inputQty = inputRaw ? num(inputRaw) : null;
  const note = text(formData.get("note"));

  if (!isDate(date) || date > todayISO()) return { error: t("common.pickValidDate") };
  if (!materialId) return { error: t("production.chooseMaterial") };
  if (!(quantity > 0)) return { error: t("action.qtyPositive") };
  if (Boolean(inputId) !== Boolean(inputRaw)) return { error: t("production.inputBoth") };
  if (inputId && !(inputQty > 0)) return { error: t("action.qtyPositive") };
  if (inputId === materialId) return { error: t("production.sameMaterial") };

  const ids = inputId ? [materialId, inputId] : [materialId];
  const site = await currentSite(user);
  const result = await transaction(async (tx) => {
    const ours = await tx.query("SELECT id FROM materials WHERE company_id = ? AND id IN (?)", [user.company_id, ids]);
    if (ours.length !== ids.length) return { error: t("stock.notFound") };
    const res = await tx.query(
      `INSERT INTO production_entries (company_id, site_id, prod_date, shift, material_id, qty, input_material_id, input_qty, note, created_by, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.company_id, site.id, date, shift, materialId, quantity, inputId, inputQty, note || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "production.add", "production", res.insertId, { date, shift, materialId, quantity, inputId, inputQty });
    return { ok: true, message: t("production.saved") };
  });
  if (result.ok) {
    invalidate(TAGS.stock);
    revalidatePath("/production");
    revalidatePath("/stock");
  }
  return result;
});

export const deleteProduction = guarded("deleteProduction", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query(
      "UPDATE production_entries SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL",
      [user.id, id, user.company_id],
    );
    if (res.affectedRows) await audit(tx, user, "production.delete", "production", id);
  });
  invalidate(TAGS.stock);
  await flash("flash.productionDeleted");
  revalidatePath("/production");
  revalidatePath("/stock");
}, { inPage: true });
