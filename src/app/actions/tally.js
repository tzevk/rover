"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { DEFAULT_LEDGERS } from "@/lib/tally.mjs";
import { isDate, text } from "@/lib/validate";

export const saveTallySettings = guarded("saveTallySettings", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const company = text(formData.get("tally_company"), 120);
  // Only names that differ are kept, so a future change to the defaults still reaches this company.
  const custom = Object.fromEntries(Object.entries(DEFAULT_LEDGERS)
    .map(([key, fallback]) => [key, text(formData.get(`ledger_${key}`), 100), fallback])
    .filter(([, name, fallback]) => name && name !== fallback)
    .map(([key, name]) => [key, name]));
  await transaction(async (tx) => {
    await tx.query("UPDATE companies SET tally_company = ?, tally_ledgers = ? WHERE id = ?", [company || null, JSON.stringify(custom), user.company_id]);
    await audit(tx, user, "tally.settings", "company", user.company_id, { company, custom });
  });
  revalidatePath("/tally");
  return { ok: true, message: t("action.saved") };
});

// Confirmed by a person after a good import, not on download: a file that failed to import must
// stay available to try again.
export const markImported = guarded("markImported", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const from = String(formData.get("from") || "");
  const to = String(formData.get("to") || "");
  if (!isDate(from) || !isDate(to) || to < from) return { error: t("common.pickValidDate") };
  const cid = user.company_id;
  const count = await transaction(async (tx) => {
    const orders = await tx.query("UPDATE orders SET tally_exported_at = NOW() WHERE company_id = ? AND status = 'delivered' AND tally_exported_at IS NULL AND DATE(delivered_at) BETWEEN ? AND ?", [cid, from, to]);
    await tx.query("UPDATE invoices SET tally_exported_at = NOW() WHERE company_id = ? AND status = 'issued' AND tally_exported_at IS NULL AND invoice_date BETWEEN ? AND ?", [cid, from, to]);
    const payments = await tx.query("UPDATE customer_payments SET tally_exported_at = NOW() WHERE company_id = ? AND deleted_at IS NULL AND tally_exported_at IS NULL AND paid_on BETWEEN ? AND ?", [cid, from, to]);
    const expenses = await tx.query("UPDATE expenses SET tally_exported_at = NOW() WHERE company_id = ? AND deleted_at IS NULL AND tally_exported_at IS NULL AND expense_date BETWEEN ? AND ?", [cid, from, to]);
    const n = orders.affectedRows + payments.affectedRows + expenses.affectedRows;
    await audit(tx, user, "tally.imported", "company", cid, { from, to, records: n });
    return n;
  });
  revalidatePath("/tally");
  return { ok: true, message: t("tally.marked", { n: count }) };
});
