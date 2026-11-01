import { cookies } from "next/headers";
import Link from "next/link";
import Shell from "@/components/Shell";
import { readFlash } from "@/lib/flash";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireAccount } from "@/lib/auth";
import { TRIAL_DAYS } from "@/lib/billing";
import { cached, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { longDate } from "@/lib/greeting";
import { getI18n } from "@/lib/i18n/server";
import { currentSite, getSites } from "@/lib/sites";

export const dynamic = "force-dynamic";

const RENEW_NOTICE_DAYS = 7;

function daysLeft(user) {
  if (user.role !== "admin" || !user.has_access || !user.access_until) return null;
  const days = Math.ceil((new Date(user.access_until.replace(" ", "T")) - Date.now()) / 86_400_000);
  return days <= (user.plan === "trial" ? TRIAL_DAYS : RENEW_NOTICE_DAYS) ? days : null;
}

export default async function AppLayout({ children }) {
  const user = await requireAccount();
  const { lang, t } = await getI18n();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const flash = readFlash(store, t);
  // Shown on every page, so it's served from the cache and refreshed whenever an order changes.
  const [{ n }] = await cached(`pending-count:${user.company_id}`, { tags: [TAGS.orders], ttl: 60 }, () =>
    query(`SELECT COUNT(*) AS n FROM orders WHERE company_id = ${user.company_id} AND status = 'pending'`),
  );
  const [sites, site] = await Promise.all([getSites(user.company_id), currentSite(user)]);
  const left = daysLeft(user);
  return (
    <Shell user={user} appName={t("app.name")} pendingCount={n} today={longDate(new Date(), lang)} initialCollapsed={collapsed}
      sites={sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} siteId={site.id} flash={flash}>
      {left !== null && (
        <Link href="/billing" className="plan-note">
          <span>{t(user.plan === "trial" ? "plan.trialLeft" : "plan.paidLeft", { days: left })}</span>
          <strong>{t("plan.renew")}</strong>
        </Link>
      )}
      {children}
    </Shell>
  );
}
