import { cookies } from "next/headers";
import Shell from "@/components/Shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireUser } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { APP_NAME } from "@/lib/format";
import { longDate } from "@/lib/greeting";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  // Shown on every page, so it's served from the cache and refreshed whenever an order changes.
  const [{ n }] = await cached("pending-count", { tags: [TAGS.orders], ttl: 60 }, () =>
    query("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
  );
  return (
    <Shell user={user} appName={APP_NAME} pendingCount={n} today={longDate()} initialCollapsed={collapsed}>
      {children}
    </Shell>
  );
}
