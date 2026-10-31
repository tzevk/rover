"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { isPincode } from "@/lib/gst.mjs";
import { getI18n } from "@/lib/i18n/server";
import { isDate, text } from "@/lib/validate";

// The transport details the portal asks for. They aren't printed on the invoice, so they can be
// filled in after it's issued; the buyer's name, prices and tax never can.
export const saveTransport = guarded("saveTransport", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const pincode = text(formData.get("buyer_pincode"), 6);
  const place = text(formData.get("buyer_place"), 60);
  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  const distance = distanceRaw === "" ? null : Number(distanceRaw);
  if (pincode && !isPincode(pincode)) return { error: t("company.pincodeRule") };
  if (distance !== null && !(Number.isInteger(distance) && distance >= 0 && distance <= 4000)) return { error: t("invoice.distanceRule") };
  await transaction(async (tx) => {
    const res = await tx.query(
      "UPDATE invoices SET buyer_pincode = ?, buyer_place = ?, distance_km = ? WHERE id = ? AND company_id = ? AND status = 'issued'",
      [pincode || null, place || null, distance, id, user.company_id],
    );
    if (res.affectedRows) await audit(tx, user, "invoice.transport", "invoice", id, { pincode, place, distance });
  });
  revalidatePath(`/invoices/${id}`);
  return { ok: true, message: t("action.saved") };
});

export const saveEwayBill = guarded("saveEwayBill", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const number = text(formData.get("ewb_no"), 14).replace(/\s/g, "");
  const date = String(formData.get("ewb_date") || "");
  if (!/^[0-9]{12}$/.test(number)) return { error: t("invoice.ewbRule") };
  if (!isDate(date)) return { error: t("common.pickValidDate") };
  await transaction(async (tx) => {
    const res = await tx.query("UPDATE invoices SET ewb_no = ?, ewb_date = ? WHERE id = ? AND company_id = ? AND status = 'issued'", [number, date, id, user.company_id]);
    if (res.affectedRows) await audit(tx, user, "invoice.ewb", "invoice", id, { number, date });
  });
  invalidate(TAGS.orders);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  return { ok: true, message: t("action.saved") };
});
