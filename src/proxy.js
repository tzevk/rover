import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Paths only the Admin may open (pages re-check this on the server too).
const ADMIN_ONLY = ["/orders", "/customers", "/staff", "/payroll", "/accounts", "/users", "/activity"];
const WORKER_ALLOWED = ["/orders/new"];

// Redirect on the host the browser used, honouring a reverse proxy's X-Forwarded-* headers, so the
// session cookie always travels with the redirect.
function redirectTo(req, path) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(`${proto}://${host}${path}`);
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/health") return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const res = redirectTo(req, "/login");
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  const adminOnly =
    ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !WORKER_ALLOWED.includes(pathname);
  if (adminOnly && session.role !== "admin") {
    return redirectTo(req, "/");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
