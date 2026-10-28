"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";
import { text } from "@/lib/validate";

// Simple brute-force brake: 5 wrong passwords locks that username+IP for 10 minutes.
const failures = (globalThis.__rqLoginFailures ??= new Map());
const MAX_TRIES = 5;
const LOCK_MS = 10 * 60 * 1000;

export async function login(_prev, formData) {
  const username = text(formData.get("username"), 50).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${username}|${ip}`;
  const rec = failures.get(key);
  if (rec && rec.count >= MAX_TRIES && Date.now() - rec.at < LOCK_MS) {
    const mins = Math.ceil((LOCK_MS - (Date.now() - rec.at)) / 60000);
    return { error: `Too many attempts. Try again in ${mins} min.` };
  }

  let user;
  try {
    [user] = await query(
      "SELECT id, username, password_hash, role, active, session_version FROM users WHERE username = ?",
      [username],
    );
  } catch (err) {
    console.error("login query failed", err);
    return { error: "Can't reach the database right now. Please try again." };
  }

  const ok = user && user.active && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    const prev = rec && Date.now() - rec.at < LOCK_MS ? rec.count : 0;
    failures.set(key, { count: prev + 1, at: Date.now() });
    return { error: user && !user.active ? "This account has been disabled." : "Incorrect username or password." };
  }
  failures.delete(key);

  await setSessionCookie(user);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
