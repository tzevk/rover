"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { ATTENDANCE, todayISO } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const saveAttendance = guarded("saveAttendance", async (_prev, formData) => {
  const user = await requireUser();
  const { t, fmtDate } = await getI18n();
  const today = todayISO();
  // Workers can only mark today; the Admin can correct any past day.
  const date = user.role === "admin" ? String(formData.get("date") || today) : today;
  if (!isDate(date) || date > today) return { error: t("common.pickValidDate") };

  const rows = [];
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^s_(\d+)$/);
    if (m && ATTENDANCE[value]) rows.push([user.company_id, Number(m[1]), date, value, user.id]);
  }
  if (rows.length === 0) return { error: t("action.markOne") };

  // Saving twice is harmless: one row per person per day, updated in place.
  const saved = await transaction(async (tx) => {
    const ours = await tx.query("SELECT id FROM staff WHERE company_id = ? AND id IN (?)", [user.company_id, rows.map((r) => r[1])]);
    if (ours.length !== new Set(rows.map((r) => r[1])).size) return false;
    await tx.query(
      `INSERT INTO attendance (company_id, staff_id, att_date, status, marked_by) VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
      [rows],
    );
    await audit(tx, user, "attendance.save", "attendance", null, {
      date, marks: Object.fromEntries(rows.map(([, id, , status]) => [id, status])),
    });
    return true;
  });
  if (!saved) return { error: t("action.markOne") };
  invalidate(TAGS.attendance);
  revalidatePath("/attendance");
  return { ok: true, message: t("action.attendanceSaved", { count: rows.length, date: fmtDate(date) }) };
});
