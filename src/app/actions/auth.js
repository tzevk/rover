"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { invalidate, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { burnVerifyTime, hashPassword, needsRehash, verifyPassword } from "@/lib/password.mjs";
import { SESSION_COOKIE } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";
import { text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

// Simple brute-force brake: 5 wrong passwords locks that username+IP for 10 minutes.
const failures = (globalThis.__rqLoginFailures ??= new Map());
const MAX_TRIES = 5;
const LOCK_MS = 10 * 60 * 1000;

export async function login(_prev, formData) {
  const { t } = await getI18n();
  const username = text(formData.get("username"), 50).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: t("action.loginMissing") };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${username}|${ip}`;
  const rec = failures.get(key);
  if (rec && rec.count >= MAX_TRIES && Date.now() - rec.at < LOCK_MS) {
    const mins = Math.ceil((LOCK_MS - (Date.now() - rec.at)) / 60000);
    return { error: t("action.tooMany", { mins }) };
  }

  let user;
  try {
    [user] = await query(
      "SELECT id, username, password_hash, role, active, session_version FROM users WHERE username = ?",
      [username],
    );
  } catch (err) {
    console.error("login query failed", err);
    return { error: t("action.loginOffline") };
  }

  // Unknown usernames take as long as wrong passwords, so they can't be discovered by timing.
  const ok = user ? user.active && (await verifyPassword(password, user.password_hash)) : (await burnVerifyTime(password), false);
  if (!ok) {
    const prev = rec && Date.now() - rec.at < LOCK_MS ? rec.count : 0;
    failures.set(key, { count: prev + 1, at: Date.now() });
    return { error: t(user && !user.active ? "action.disabled" : "action.wrongLogin") };
  }
  failures.delete(key);

  // Quietly move older bcrypt hashes to scrypt now that we know the password.
  if (needsRehash(user.password_hash)) {
    await query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(password), user.id]).catch(() => {});
    invalidate(TAGS.users);
  }

  await setSessionCookie(user);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
