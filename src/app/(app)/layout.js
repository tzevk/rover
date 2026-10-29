import { cookies } from "next/headers";
import Shell from "@/components/Shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireUser } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { longDate } from "@/lib/greeting";
import { skyAt } from "@/lib/sky";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  // Shown on every page, so it's served from the cache and refreshed whenever an order changes.
  const [{ n }] = await cached("pending-count", { tags: [TAGS.orders], ttl: 60 }, () =>
    query("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
  );
  return (
    <Shell user={user} appName={t("app.name")} pendingCount={n} today={longDate(new Date(), lang)} initialCollapsed={collapsed} sky={skyAt()}>
      {children}
    </Shell>
  );
}
