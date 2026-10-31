import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Paths only the Admin may open (pages re-check this on the server too).
const ADMIN_ONLY = ["/alerts", "/company", "/api/export", "/enquiries", "/orders", "/customers", "/staff", "/payroll", "/accounts", "/users", "/activity", "/cash", "/invoices", "/gst", "/royalty", "/tally", "/sites"];
const WORKER_ALLOWED = ["/orders/new"];
// Gate staff hand over the invoice for a load they've just sent out; the page limits them to today's.
const WORKER_PREFIXES = ["/invoices/"];

// Redirect on the host the browser used, honouring a reverse proxy's X-Forwarded-* headers, so the
// session cookie always travels with the redirect.
function redirectTo(req, path) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(`${proto}://${host}${path}`);
}

// Per-IP request brake. Saves are POSTs (server actions), so they get the tighter limit.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3000, MAX_POSTS = 150; // high enough for a whole office behind one address; menu links preload pages
const hits = (globalThis.__rkRequestHits ??= new Map());

function overLimit(key, max) {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  const rec = hits.get(key);
  if (!rec || now - rec.start > WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }
  return ++rec.count > max;
}

// Addresses that need a login. Anything else that isn't public is simply a page that doesn't exist,
// so it gets a real 404. Every app page checks the login itself as well.
const APP_PATHS = ["/orders", "/deliveries", "/expenses", "/attendance", "/production", "/stock", "/vehicles", "/alerts", "/customers", "/accounts", "/payroll", "/staff", "/users", "/activity", "/company", "/billing", "/enquiries", "/cash", "/invoices", "/gst", "/royalty", "/tally", "/sites", "/api"];
const needsLogin = (pathname) => APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const SEO_PAGES = ["/small-business-operations-software", "/workshop-management-software", "/quarry-management-software", "/stone-crusher-management-software", "/aggregate-inventory-management", "/weighbridge-management-software", "/quarry-dispatch-management"];
// /gate holds no data of its own: it's the shell that works offline. Its API routes check the login
// themselves, so a device can be told "sign in again" instead of being redirected to a web page.
const PUBLIC = ["/login", "/signup", "/terms", "/privacy", "/gate", "/api/health", "/api/billing/webhook", "/api/offline/snapshot", "/api/offline/sync"];

function pageLang(req, lang) {
  const headers = new Headers(req.headers);
  headers.set("x-page-lang", lang);
  return headers;
}

const BUSY_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R.K. Enterprises</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f4ef;color:#1a2920;font-family:system-ui,sans-serif;text-align:center">
<div style="padding:24px"><h1 style="font-size:22px;margin:0 0 8px">Please wait a moment</h1><p style="color:#6d7266;margin:0">Too many requests just now. Try again in a minute.</p></div></body></html>`;

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;

  // Off by default: a plain-http install would otherwise redirect itself out of reach.
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (process.env.FORCE_HTTPS === "1" && proto === "http") {
    return NextResponse.redirect(`https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}${pathname}${search}`, 308);
  }

  const ip = clientIp(req.headers);
  if (overLimit(`all|${ip}`, MAX_REQUESTS) || (req.method === "POST" && overLimit(`post|${ip}`, MAX_POSTS))) {
    return new NextResponse(BUSY_PAGE, { status: 429, headers: { "Retry-After": "60", "Content-Type": "text/html; charset=utf-8" } });
  }

  if (PUBLIC.includes(pathname)) return NextResponse.next();

  // The public site: the language comes from the URL, not the visitor's cookie, so <html lang> is right for search engines.
  if (pathname === "/mr" || pathname === "/welcome" || SEO_PAGES.includes(pathname)) return NextResponse.next({ request: { headers: pageLang(req, pathname === "/mr" ? "mr" : "en") } });

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session && pathname === "/") {
    return NextResponse.rewrite(new URL("/welcome", req.url), { request: { headers: pageLang(req, "en") } });
  }
  if (!session && !needsLogin(pathname)) return NextResponse.next({ request: { headers: pageLang(req, "en") } });
  if (!session) {
    const res = redirectTo(req, "/login");
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  const adminOnly =
    ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !WORKER_ALLOWED.includes(pathname) && !WORKER_PREFIXES.some((p) => pathname.startsWith(p));
  if (adminOnly && session.role !== "admin") {
    return redirectTo(req, "/");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
