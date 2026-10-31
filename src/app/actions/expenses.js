"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { EXPENSE_CATEGORIES, inr, todayISO } from "@/lib/format";
import { isDate, num, text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

export const addExpense = guarded("addExpense", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const date = String(formData.get("expense_date") || "");
  const category = String(formData.get("category") || "");
  const amount = num(formData.get("amount"));
  const description = text(formData.get("description"));

  if (!isDate(date) || date > todayISO()) return { error: t("common.pickValidDate") };
  if (!EXPENSE_CATEGORIES[category]) return { error: t("action.expenseType") };
  if (!(amount > 0)) return { error: t("common.amountPositive") };

  await transaction(async (tx) => {
    const res = await tx.query(
      "INSERT INTO expenses (company_id, expense_date, category, amount, description, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, date, category, amount, description || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "expense.add", "expense", res.insertId, { date, category, amount, description });
  });
  invalidate(TAGS.expenses);
  revalidatePath("/expenses");
  return { ok: true, message: t("action.expenseSaved", { category: t(`expense.${category}`), amount: inr(amount) }) };
});

export const deleteExpense = guarded("deleteExpense", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query(
      "UPDATE expenses SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL",
      [user.id, id, user.company_id],
    );
    if (res.affectedRows) {
      // The fuel or repair record this came from goes with it, so the two never disagree.
      for (const table of ["fuel_logs", "maintenance_logs"]) {
        await tx.query(`UPDATE ${table} SET deleted_at = NOW(), deleted_by = ? WHERE expense_id = ? AND company_id = ? AND deleted_at IS NULL`, [user.id, id, user.company_id]);
      }
      await audit(tx, user, "expense.delete", "expense", id);
    }
  });
  invalidate(TAGS.expenses, TAGS.vehicles);
  revalidatePath("/expenses");
  revalidatePath("/vehicles");
}, { inPage: true });
