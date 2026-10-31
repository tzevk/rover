"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { guarded } from "@/lib/action";
import { invalidate, TAGS } from "@/lib/cache";
import { clientIp } from "@/lib/client-ip";
import { audit, query, transaction } from "@/lib/db";
import { TRIAL_DAYS } from "@/lib/billing";
import { SITE } from "@/lib/site";
import { burnVerifyTime, hashPassword, needsRehash, verifyPassword } from "@/lib/password.mjs";
import { SESSION_COOKIE } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";
import { text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

// Brute-force brake. Three counters, so neither rotating IPs against one account nor trying
// one password across many accounts gets through. Attempts count before the password check,
// so parallel guesses can't all slip past the limit.
const failures = (globalThis.__rqLoginFailures ??= new Map());
const LOCK_MS = 10 * 60 * 1000;
const MAX_PASSWORD = 200;

function limitsFor(username, ip) {
  return [[`pair|${username}|${ip}`, 5], [`user|${username}`, 20], [`ip|${ip}`, 30]];
}

function lockedMs(limits) {
  const now = Date.now();
  return Math.max(0, ...limits.map(([key, max]) => {
    const rec = failures.get(key);
    return rec && rec.count >= max ? LOCK_MS - (now - rec.at) : 0;
  }));
}

function countAttempt(limits) {
  const now = Date.now();
  if (failures.size > 10_000) for (const [k, v] of failures) if (now - v.at > LOCK_MS) failures.delete(k);
  for (const [key] of limits) {
    const rec = failures.get(key);
    failures.set(key, { count: rec && now - rec.at < LOCK_MS ? rec.count + 1 : 1, at: now });
  }
}

// A correct password doesn't count against the shared username and IP limits.
function clearAttempt(limits) {
  failures.delete(limits[0][0]);
  for (const [key] of limits.slice(1)) {
    const rec = failures.get(key);
    if (rec) rec.count = Math.max(0, rec.count - 1);
  }
}

export const login = guarded("login", async (_prev, formData) => {
  const { t } = await getI18n();
  const username = text(formData.get("username"), 50).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: t("action.loginMissing") };
  if (password.length > MAX_PASSWORD) return { error: t("action.wrongLogin") };

  const limits = limitsFor(username, clientIp(await headers()));
  const wait = lockedMs(limits);
  if (wait > 0) return { error: t("action.tooMany", { mins: Math.ceil(wait / 60000) }) };
  countAttempt(limits);

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
  // "Disabled" is only ever told to someone who proved the password.
  const ok = user ? await verifyPassword(password, user.password_hash) : (await burnVerifyTime(password), false);
  if (!ok) return { error: t("action.wrongLogin") };
  clearAttempt(limits);
  if (!user.active) return { error: t("action.disabled") };

  // Quietly move older bcrypt hashes to scrypt now that we know the password.
  if (needsRehash(user.password_hash)) {
    await query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(password), user.id]).catch(() => {});
    invalidate(TAGS.users);
  }

  await setSessionCookie(user);
  redirect("/");
});

const USERNAME = /^[a-z0-9._-]{3,50}$/;
const SIGNUPS_PER_IP = 5;

// A new company with its owner login, on a free trial.
export const signup = guarded("signup", async (_prev, formData) => {
  const { t } = await getI18n();
  if (!SITE.signupOpen) return { error: t("action.failed") };
  const companyName = text(formData.get("company_name"), 120);
  const fullName = text(formData.get("full_name"), 100);
  const username = text(formData.get("username"), 50).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!companyName) return { error: t("signup.companyRequired") };
  if (!fullName) return { error: t("action.fullName") };
  if (!USERNAME.test(username)) return { error: t("action.usernameRule") };
  if (password.length < 8 || password.length > MAX_PASSWORD) return { error: t("action.passwordLength") };
  if (formData.get("agree") !== "on") return { error: t("signup.mustAgree") };

  const limits = [[`signup|${clientIp(await headers())}`, SIGNUPS_PER_IP]];
  if (lockedMs(limits) > 0) return { error: t("signup.tooMany") };
  countAttempt(limits);

  const hash = await hashPassword(password);
  const user = await transaction(async (tx) => {
    const [taken] = await tx.query("SELECT id FROM users WHERE username = ?", [username]);
    if (taken) return null;
    const company = await tx.query(
      "INSERT INTO companies (name, plan, access_until) VALUES (?, 'trial', DATE_ADD(NOW(), INTERVAL ? DAY))",
      [companyName, TRIAL_DAYS],
    );
    await tx.query("INSERT INTO sites (company_id, name) VALUES (?, 'Main site')", [company.insertId]);
    const res = await tx.query(
      "INSERT INTO users (company_id, username, full_name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
      [company.insertId, username, fullName, hash],
    );
    const [row] = await tx.query("SELECT id, company_id, username, role, session_version FROM users WHERE id = ?", [res.insertId]);
    await audit(tx, row, "user.create", "user", row.id, { username, fullName, role: "admin" });
    return row;
  });
  if (!user) return { error: t("action.usernameTaken", { username }) };
  invalidate(TAGS.users);
  await setSessionCookie(user);
  redirect("/");
});

export const logout = guarded("logout", async () => {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?out=1");
}, { inPage: true });
