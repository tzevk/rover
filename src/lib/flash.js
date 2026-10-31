import { cookies } from "next/headers";
import { FLASH_COOKIE } from "./ui-prefs";

// A one-click action (delete, cancel) has no form to show a message in, and often redirects. It
// leaves a short-lived note here for the next page to show. Only known messages are ever shown.
export async function flash(key, vars) {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ key, vars }), { path: "/", maxAge: 20, sameSite: "lax" });
}

export function readFlash(store, t) {
  const raw = store.get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { key, vars } = JSON.parse(raw);
    return String(key).startsWith("flash.") ? t(key, vars) : null;
  } catch {
    return null;
  }
}
