import Shell from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { APP_NAME } from "@/lib/format";
import { longDate } from "@/lib/greeting";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'");
  return (
    <Shell user={user} appName={APP_NAME} pendingCount={n} today={longDate()}>
      {children}
    </Shell>
  );
}
