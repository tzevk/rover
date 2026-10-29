import Link from "next/link";
import {
  ArrowRight, BadgeIndianRupee, CalendarCheck, CircleCheckBig, Clock, HandCoins, LayoutDashboard,
  PlusCircle, Receipt, Scale, Sun, Truck, Wallet,
} from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { CUSTOMER_BALANCES, query } from "@/lib/db";
import { inr, qty, todayISO } from "@/lib/format";
import { firstName, greetingKey } from "@/lib/greeting";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.home");

export default async function HomePage() {
  const user = await requireUser();
  return user.role === "admin" ? <AdminDashboard user={user} /> : <WorkerHome user={user} />;
}

async function WorkerHome({ user }) {
  const { t } = await getI18n();
  const today = todayISO();
  // Only counts of the worker's own work today — no amounts, no completed-order details.
  const [[{ pending }], [{ booked }], [{ delivered }]] = await cached(
    `worker-home:${user.id}:${today}`, { tags: [TAGS.orders], ttl: 60 }, () => Promise.all([
      query("SELECT COUNT(*) AS pending FROM orders WHERE status = 'pending'"),
      query("SELECT COUNT(*) AS booked FROM orders WHERE booked_by = ? AND DATE(booked_at) = ?", [user.id, today]),
      query("SELECT COUNT(*) AS delivered FROM orders WHERE delivered_by = ? AND DATE(delivered_at) = ?", [user.id, today]),
    ]),
  );
  const tiles = [
    { href: "/orders/new", icon: PlusCircle, title: t("home.tileBook"), text: t("home.tileBookText") },
    { href: "/deliveries", icon: Truck, title: t("nav.deliveries"), text: t("home.tileDeliverText"), count: pending },
    { href: "/expenses", icon: Receipt, title: t("home.tileExpense"), text: t("home.tileExpenseText") },
    { href: "/attendance", icon: CalendarCheck, title: t("home.tileAttendance"), text: t("home.tileAttendanceText") },
  ];

  return (
    <>
      <PageHead icon={Sun} eyebrow={`${t(greetingKey())}, ${firstName(user.full_name)}`} title={t("home.workerTitle")}
        subtitle={t("home.workerSubtitle")} />

      <div className="stats">
        <Stat icon={PlusCircle} label={t("home.youBooked")} value={booked} hint={t("home.ordersUnit", { count: booked })} />
        <Stat icon={CircleCheckBig} tone="ok" label={t("home.youDelivered")} value={delivered} hint={t("home.loadsUnit", { count: delivered })} />
        <Stat icon={Clock} tone="brown" label={t("home.waiting")} value={pending} hint={t("home.acrossQuarry")} />
      </div>

      <div className="tiles">
        {tiles.map(({ href, icon: Icon, title, text, count }) => (
          <Link key={href} href={href} className="card tile">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="ico"><Icon size={22} /></span>
              {count !== undefined && <span className="count">{count}</span>}
            </div>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <span className="tile-go"><ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>
    </>
  );
}

async function AdminDashboard({ user }) {
  const { t, fmtDateTime } = await getI18n();
  const today = todayISO();
  const tags = [TAGS.orders, TAGS.payments, TAGS.expenses, TAGS.customers];
  const [[pending], [delivered], [payments], [expenses], [outstanding], oldestPending, topDue] = await cached(
    `dashboard:${today}`, { tags, ttl: 60 }, () => Promise.all([
    query("SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS value FROM orders WHERE status = 'pending'"),
    query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(delivered_qty), 0) AS qty, COALESCE(SUM(total_amount), 0) AS sales,
              COALESCE(SUM(paid_amount), 0) AS paid
       FROM orders WHERE status = 'delivered' AND DATE(delivered_at) = ?`,
      [today],
    ),
    query("SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments WHERE paid_on = ? AND deleted_at IS NULL", [today]),
    query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date = ? AND deleted_at IS NULL", [today]),
    query(`SELECT COALESCE(SUM(outstanding), 0) AS total FROM (${CUSTOMER_BALANCES}) b WHERE outstanding > 0`),
    query(
      `SELECT o.id, o.ordered_qty, o.total_amount, o.booked_at, c.name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = 'pending' ORDER BY o.booked_at LIMIT 6`,
    ),
    query(`SELECT * FROM (${CUSTOMER_BALANCES}) b WHERE outstanding > 0 ORDER BY outstanding DESC LIMIT 6`),
  ]));
  const collected = delivered.paid + payments.total;

  return (
    <>
      <PageHead icon={LayoutDashboard} eyebrow={`${t(greetingKey())}, ${firstName(user.full_name)}`} title={t("home.dashboard")}
        subtitle={t("home.dashboardSubtitle")}>
        <Link href="/accounts" className="btn"><Scale size={16} /> {t("nav.accounts")}</Link>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Wallet} label={t("home.totalOutstanding")} value={inr(outstanding.total)} hint={t("home.acrossCustomers")} />
        <Stat icon={BadgeIndianRupee} label={t("home.todaysSales")} value={inr(delivered.sales)} hint={t("home.salesHint", { n: delivered.n, qty: qty(delivered.qty) })} />
        <Stat icon={HandCoins} tone="ok" label={t("home.collectedToday")} value={inr(collected)} hint={t("home.collectedHint")} />
        <Stat icon={Receipt} tone="danger" label={t("home.expensesToday")} value={inr(expenses.total)} hint={t("home.netCashHint", { amount: inr(collected - expenses.total) })} />
        <Stat icon={Truck} tone="brown" label={t("nav.deliveries")} value={pending.n} hint={t("home.worthHint", { amount: inr(pending.value) })} />
      </div>

      <div className="grid-2">
        <Section icon={Clock} title={t("home.waitingLongest")} subtitle={t("home.oldestFirst")}
          action={<HeadLink href="/deliveries">{t("home.allPending")}</HeadLink>}>
          {oldestPending.length === 0 ? (
            <EmptyState icon={CircleCheckBig} title={t("home.allCaughtUp")}>{t("home.noPending")}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {oldestPending.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="cell-link" href={`/deliveries/${o.id}`}>#{o.id} · {o.name}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(o.booked_at)}</div>
                      </td>
                      <td className="num">{qty(o.ordered_qty)}</td>
                      <td className="num">{inr(o.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section icon={Wallet} title={t("home.highestBalances")} subtitle={t("home.oweMost")}
          action={<HeadLink href="/customers">{t("home.balanceReport")}</HeadLink>}>
          {topDue.length === 0 ? (
            <EmptyState icon={CircleCheckBig} title={t("home.nothingOwed")}>{t("home.allPaid")}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {topDue.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link className="cell-link" href={`/customers/${c.id}`}>{c.name}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{c.phone || "—"}</div>
                      </td>
                      <td className="num due">{inr(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
