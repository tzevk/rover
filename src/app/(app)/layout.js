import { cookies } from "next/headers";
import Shell from "@/components/Shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireAccount } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { longDate } from "@/lib/greeting";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireAccount();
  const { lang, t } = await getI18n();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  // Shown on every page, so it's served from the cache and refreshed whenever an order changes.
  const [{ n }] = await cached(`pending-count:${user.company_id}`, { tags: [TAGS.orders], ttl: 60 }, () =>
    query(`SELECT COUNT(*) AS n FROM orders WHERE company_id = ${user.company_id} AND status = 'pending'`),
  );
  return (
    <Shell user={user} appName={t("app.name")} pendingCount={n} today={longDate(new Date(), lang)} initialCollapsed={collapsed}>
      {children}
    </Shell>
  );
}
