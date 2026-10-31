"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { num, text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

export const addStaff = guarded("addStaff", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const name = text(formData.get("name"), 100);
  const phone = text(formData.get("phone"), 20);
  const wage = num(formData.get("daily_wage"));
  if (!name) return { error: t("action.nameRequired") };
  if (!(wage >= 0)) return { error: t("action.wage") };
  await transaction(async (tx) => {
    const res = await tx.query("INSERT INTO staff (company_id, name, phone, daily_wage) VALUES (?, ?, ?, ?)", [user.company_id, name, phone || null, wage]);
    await audit(tx, user, "staff.add", "staff", res.insertId, { name, phone, wage });
  });
  invalidate(TAGS.staff);
  revalidatePath("/staff");
  return { ok: true, message: t("common.added", { name }) };
});

export const updateStaff = guarded("updateStaff", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const name = text(formData.get("name"), 100);
  const phone = text(formData.get("phone"), 20);
  const wage = num(formData.get("daily_wage"));
  const active = formData.get("active") === "on" ? 1 : 0;
  if (!name) return { error: t("action.nameRequired") };
  if (!(wage >= 0)) return { error: t("action.wage") };
  await transaction(async (tx) => {
    const [before] = await tx.query("SELECT name, phone, daily_wage, active FROM staff WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!before) return;
    await tx.query("UPDATE staff SET name = ?, phone = ?, daily_wage = ?, active = ? WHERE id = ? AND company_id = ?", [
      name, phone || null, wage, active, id, user.company_id,
    ]);
    await audit(tx, user, "staff.update", "staff", id, { before, after: { name, phone, wage, active } });
  });
  invalidate(TAGS.staff);
  revalidatePath("/staff");
  return { ok: true, message: t("action.saved") };
});
