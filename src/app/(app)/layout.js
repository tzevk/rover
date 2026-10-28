import { cookies } from "next/headers";
import Shell from "@/components/Shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { APP_NAME } from "@/lib/format";
import { longDate } from "@/lib/greeting";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'");
  return (
    <Shell user={user} appName={APP_NAME} pendingCount={n} today={longDate()} initialCollapsed={collapsed}>
      {children}
    </Shell>
  );
}
