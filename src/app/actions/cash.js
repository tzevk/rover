"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { cashMovements, closingPeriod } from "@/lib/cash";
import { audit, transaction } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";
import { isDate, num, round2, text } from "@/lib/validate";

// The figures are always worked out here from the records. Nothing the browser sends can change
// what the cash box was expected to hold; only what was counted, and what was taken out.
export const closeCash = guarded("closeCash", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const site = await currentSite(user);
  const date = String(formData.get("close_date") || "");
  const counted = num(formData.get("counted"));
  const deposited = formData.get("deposited") ? num(formData.get("deposited")) : 0;
  const note = text(formData.get("note"));
  if (!isDate(date) || date > todayISO()) return { error: t("common.pickValidDate") };
  if (!(counted >= 0) || !(deposited >= 0)) return { error: t("cash.amountsRule") };

  const { previous, from } = await closingPeriod(user.company_id, site.id, date);
  const opening = previous ? previous.counted : num(formData.get("opening") || 0);
  if (!(opening >= 0)) return { error: t("cash.amountsRule") };
  const m = await cashMovements(user.company_id, site.id, from, date);
  const expected = round2(opening + m.cashSales + m.cashReceived - m.cashExpenses - deposited);
  const difference = round2(counted - expected);
  if (difference !== 0 && !note) return { error: t("cash.noteRequired") };

  const result = await transaction(async (tx) => {
    const [later] = await tx.query("SELECT close_date FROM cash_closings WHERE company_id = ? AND site_id = ? AND close_date > ? LIMIT 1 FOR UPDATE", [user.company_id, site.id, date]);
    if (later) return { error: t("cash.laterClosed") };
    const [before] = await tx.query("SELECT * FROM cash_closings WHERE company_id = ? AND site_id = ? AND close_date = ? FOR UPDATE", [user.company_id, site.id, date]);
    const values = [opening, m.cashSales, m.cashReceived, m.cashExpenses, deposited, expected, counted, difference, note || null, user.id];
    if (before) {
      await tx.query(
        `UPDATE cash_closings SET opening = ?, cash_sales = ?, cash_received = ?, cash_expenses = ?, deposited = ?, expected = ?, counted = ?, difference = ?, note = ?, closed_by = ?, closed_at = NOW()
         WHERE id = ?`,
        [...values, before.id],
      );
      await audit(tx, user, "cash.recount", "cash", before.id, { date, before: { expected: before.expected, counted: before.counted, difference: before.difference }, after: { expected, counted, difference } });
    } else {
      const res = await tx.query(
        `INSERT INTO cash_closings (opening, cash_sales, cash_received, cash_expenses, deposited, expected, counted, difference, note, closed_by, company_id, site_id, close_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, user.company_id, site.id, date],
      );
      await audit(tx, user, "cash.close", "cash", res.insertId, { date, expected, counted, difference });
    }
    return { ok: true, message: t(difference === 0 ? "cash.closedExact" : difference > 0 ? "cash.closedOver" : "cash.closedShort", { amount: inr(Math.abs(difference)) }) };
  });
  if (result.ok) {
    invalidate(TAGS.cash);
    revalidatePath("/cash");
    revalidatePath("/alerts");
  }
  return result;
});
