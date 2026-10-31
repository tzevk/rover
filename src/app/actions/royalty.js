"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { flash } from "@/lib/flash";
import { getI18n } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";
import { isDate, num, text } from "@/lib/validate";

export const addPermit = guarded("addPermit", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const site = await currentSite(user);
  const permitNo = text(formData.get("permit_no"), 60);
  const from = String(formData.get("valid_from") || "");
  const to = String(formData.get("valid_to") || "");
  const allowed = num(formData.get("qty_allowed"));
  const materialId = Number(formData.get("material_id")) || null;
  const note = text(formData.get("note"));
  if (!permitNo) return { error: t("royalty.numberRequired") };
  if (!isDate(from) || !isDate(to) || to < from) return { error: t("royalty.datesRule") };
  if (!(allowed > 0)) return { error: t("action.qtyPositive") };
  const result = await transaction(async (tx) => {
    const [taken] = await tx.query("SELECT id FROM royalty_permits WHERE company_id = ? AND permit_no = ?", [user.company_id, permitNo]);
    if (taken) return { error: t("stock.nameTaken", { name: permitNo }) };
    if (materialId) {
      const [own] = await tx.query("SELECT id FROM materials WHERE id = ? AND company_id = ?", [materialId, user.company_id]);
      if (!own) return { error: t("stock.notFound") };
    }
    const res = await tx.query(
      "INSERT INTO royalty_permits (company_id, site_id, material_id, permit_no, valid_from, valid_to, qty_allowed, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, site.id, materialId, permitNo, from, to, allowed, note || null, user.id],
    );
    await audit(tx, user, "permit.add", "permit", res.insertId, { permitNo, from, to, allowed, materialId });
    return { ok: true, message: t("common.added", { name: permitNo }) };
  });
  if (result.ok) {
    invalidate(TAGS.stock);
    revalidatePath("/royalty");
  }
  return result;
});

export const closePermit = guarded("closePermit", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query("UPDATE royalty_permits SET active = 0 WHERE id = ? AND company_id = ? AND active = 1", [id, user.company_id]);
    if (res.affectedRows) await audit(tx, user, "permit.close", "permit", id);
  });
  invalidate(TAGS.stock);
  await flash("flash.permitClosed");
  revalidatePath("/royalty");
}, { inPage: true });
