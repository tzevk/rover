import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "./session";

// Marks the cookie Secure only when the site is actually served over HTTPS; a Secure cookie
// on a plain-http deployment would silently never be stored, making sign-in impossible.
export async function setSessionCookie(user) {
  const h = await headers();
  const https = h.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || (h.get("origin") ?? "").startsWith("https://");
  (await cookies()).set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}
