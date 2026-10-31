"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { hashPassword } from "@/lib/password.mjs";
import { setSessionCookie } from "@/lib/session-cookie";
import { text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

const USERNAME = /^[a-z0-9._-]{3,50}$/;

export const createUser = guarded("createUser", async (_prev, formData) => {
  const me = await requireAdmin();
  const { t } = await getI18n();
  const username = text(formData.get("username"), 50).toLowerCase();
  const fullName = text(formData.get("full_name"), 100);
  const role = formData.get("role") === "admin" ? "admin" : "worker";
  const password = String(formData.get("password") ?? "");

  if (!USERNAME.test(username)) return { error: t("action.usernameRule") };
  if (!fullName) return { error: t("action.fullName") };
  if (password.length < 8 || password.length > 200) return { error: t("action.passwordLength") };

  const hash = await hashPassword(password);
  const result = await transaction(async (tx) => {
    const [taken] = await tx.query("SELECT id FROM users WHERE username = ?", [username]);
    if (taken) return { error: t("action.usernameTaken", { username }) };
    const res = await tx.query("INSERT INTO users (company_id, username, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?)", [
      me.company_id, username, fullName, hash, role,
    ]);
    await audit(tx, me, "user.create", "user", res.insertId, { username, fullName, role });
    return { ok: true, message: t("action.loginCreated", { name: fullName, username }) };
  });
  if (result.ok) {
    invalidate(TAGS.users);
    revalidatePath("/users");
  }
  return result;
});

// Disabling also bumps session_version, which signs the person out on every device immediately.
export const setUserActive = guarded("setUserActive", async (id, active) => {
  const me = await requireAdmin();
  if (id === me.id) return;
  await transaction(async (tx) => {
    await tx.query("UPDATE users SET active = ?, session_version = session_version + 1 WHERE id = ? AND company_id = ?", [active ? 1 : 0, id, me.company_id]);
    await audit(tx, me, active ? "user.enable" : "user.disable", "user", id);
  });
  invalidate(TAGS.users);
  revalidatePath("/users");
}, { inPage: true });

export const resetPassword = guarded("resetPassword", async (_prev, formData) => {
  const me = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8 || password.length > 200) return { error: t("action.passwordLength") };
  const hash = await hashPassword(password);

  const user = await transaction(async (tx) => {
    await tx.query("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ? AND company_id = ?", [hash, id, me.company_id]);
    await audit(tx, me, "user.password_reset", "user", id);
    const [u] = await tx.query("SELECT id, role, session_version FROM users WHERE id = ? AND company_id = ?", [id, me.company_id]);
    return u;
  });
  invalidate(TAGS.users);
  // Everyone using the old password is signed out — except you, if you changed your own.
  if (id === me.id && user) {
    await setSessionCookie(user);
  }
  return { ok: true, message: t("action.passwordUpdated") };
});
