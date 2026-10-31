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
    query(
      `SELECT u.id, u.company_id, u.site_id, u.username, u.full_name, u.role, u.session_version,
              c.name AS company_name, c.plan, c.access_until,
              (c.access_until IS NULL OR c.access_until > NOW()) AS has_access
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.id = ? AND u.active = 1`,
      [session.sub],
    ),
  );
  // Disabled, password reset, or role changed since this cookie was issued → not signed in.
  if (!user || user.session_version !== session.sv || user.role !== session.role) return null;
  return user;
});

// Signed in, whether or not the company's access has ended. Only for the shell and /billing.
export async function requireAccount() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUser() {
  const user = await requireAccount();
  if (!user.has_access) redirect("/billing");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
