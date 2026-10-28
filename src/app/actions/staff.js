"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { num, text } from "@/lib/validate";

export const addStaff = guarded("addStaff", async (_prev, formData) => {
  const user = await requireAdmin();
  const name = text(formData.get("name"), 100);
  const phone = text(formData.get("phone"), 20);
  const wage = num(formData.get("daily_wage"));
  if (!name) return { error: "Name is required." };
  if (!(wage >= 0)) return { error: "Enter a valid daily wage." };
  await transaction(async (tx) => {
    const res = await tx.query("INSERT INTO staff (name, phone, daily_wage) VALUES (?, ?, ?)", [name, phone || null, wage]);
    await audit(tx, user, "staff.add", "staff", res.insertId, { name, phone, wage });
  });
  revalidatePath("/staff");
  return { ok: true, message: `Added ${name}.` };
});

export const updateStaff = guarded("updateStaff", async (_prev, formData) => {
  const user = await requireAdmin();
  const id = Number(formData.get("id"));
  const name = text(formData.get("name"), 100);
  const phone = text(formData.get("phone"), 20);
  const wage = num(formData.get("daily_wage"));
  const active = formData.get("active") === "on" ? 1 : 0;
  if (!name) return { error: "Name is required." };
  if (!(wage >= 0)) return { error: "Enter a valid daily wage." };
  await transaction(async (tx) => {
    const [before] = await tx.query("SELECT name, phone, daily_wage, active FROM staff WHERE id = ? FOR UPDATE", [id]);
    await tx.query("UPDATE staff SET name = ?, phone = ?, daily_wage = ?, active = ? WHERE id = ?", [
      name, phone || null, wage, active, id,
    ]);
    await audit(tx, user, "staff.update", "staff", id, { before, after: { name, phone, wage, active } });
  });
  revalidatePath("/staff");
  return { ok: true, message: "Saved." };
});
