"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { cleanPrefix, isGstin, isPincode } from "@/lib/gst.mjs";
import { getI18n } from "@/lib/i18n/server";
import { num, text } from "@/lib/validate";

export const saveCompany = guarded("saveCompany", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const c = {
    name: text(formData.get("name"), 120),
    address: text(formData.get("address")),
    place: text(formData.get("place"), 60),
    pincode: text(formData.get("pincode"), 6),
    phone: text(formData.get("phone"), 20),
    gstin: text(formData.get("gstin"), 15).toUpperCase(),
    gstEnabled: formData.get("gst_enabled") === "on" ? 1 : 0,
    inclusive: formData.get("rates_include_gst") === "on" ? 1 : 0,
    prefix: cleanPrefix(formData.get("invoice_prefix")) || "INV",
    bank: text(formData.get("bank_details")),
    terms: text(formData.get("invoice_terms")),
    limit: num(formData.get("ewb_intra_limit") || 50000),
    passRequired: formData.get("pass_required") === "on" ? 1 : 0,
  };
  if (!c.name) return { error: t("signup.companyRequired") };
  if (c.gstin && !isGstin(c.gstin)) return { error: t("company.gstinRule") };
  if (c.pincode && !isPincode(c.pincode)) return { error: t("company.pincodeRule") };
  if (!(c.limit >= 0)) return { error: t("stock.numbersRule") };
  // An invoice needs a registered number and an address, so GST can't be switched on without them.
  if (c.gstEnabled && (!c.gstin || !c.address)) return { error: t("company.gstNeeds") };
  await transaction(async (tx) => {
    await tx.query(
      `UPDATE companies SET name = ?, address = ?, place = ?, pincode = ?, phone = ?, gstin = ?, gst_enabled = ?, rates_include_gst = ?,
         invoice_prefix = ?, bank_details = ?, invoice_terms = ?, ewb_intra_limit = ?, pass_required = ? WHERE id = ?`,
      [c.name, c.address || null, c.place || null, c.pincode || null, c.phone || null, c.gstin || null, c.gstEnabled, c.inclusive,
        c.prefix, c.bank || null, c.terms || null, c.limit, c.passRequired, user.company_id],
    );
    await audit(tx, user, "company.update", "company", user.company_id, c);
  });
  invalidate(TAGS.users);
  revalidatePath("/company");
  return { ok: true, message: t("action.saved") };
});
