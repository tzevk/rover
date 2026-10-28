import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "./db";
import { cached, TAGS } from "./cache";
import { SESSION_COOKIE, verifySession } from "./session";

// The cookie only proves who you are; role, active status and session version are re-checked in the DB.
export const getUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const [user] = await cached(`user:${session.sub}`, { tags: [TAGS.users], ttl: 30 }, () =>
    query("SELECT id, username, full_name, role, session_version FROM users WHERE id = ? AND active = 1", [session.sub]),
  );
  // Disabled, password reset, or role changed since this cookie was issued → not signed in.
  if (!user || user.session_version !== session.sv || user.role !== session.role) return null;
  return user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
