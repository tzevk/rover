"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { text } from "@/lib/validate";

export const saveCompany = guarded("saveCompany", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const name = text(formData.get("name"), 120);
  const address = text(formData.get("address"));
  const phone = text(formData.get("phone"), 20);
  const gstin = text(formData.get("gstin"), 15).toUpperCase();
  if (!name) return { error: t("signup.companyRequired") };
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) return { error: t("company.gstinRule") };
  await transaction(async (tx) => {
    await tx.query("UPDATE companies SET name = ?, address = ?, phone = ?, gstin = ? WHERE id = ?", [name, address || null, phone || null, gstin || null, user.company_id]);
    await audit(tx, user, "company.update", "company", user.company_id, { name, address, phone, gstin });
  });
  invalidate(TAGS.users);
  revalidatePath("/company");
  return { ok: true, message: t("action.saved") };
});
