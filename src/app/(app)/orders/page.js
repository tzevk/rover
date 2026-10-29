import Link from "next/link";
import { BadgeIndianRupee, ClipboardList, Filter, HandCoins, ListFilter, SearchX, Wallet } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.orders");

const STATUSES = ["all", "pending", "delivered", "cancelled"];

export default async function OrdersPage({ searchParams }) {
  await requireAdmin();
  const { t, fmtDateTime, fmtTime } = await getI18n();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : shiftDate(today, -30);
  const to = isDate(sp.to) ? sp.to : today;
  const status = STATUSES.includes(sp.status) ? sp.status : "all";
  const q = (sp.q ?? "").trim();

  const where = ["DATE(o.booked_at) BETWEEN ? AND ?"];
  const params = [from, to];
  if (status !== "all") { where.push("o.status = ?"); params.push(status); }
  if (q) {
    where.push("(c.name LIKE ? OR o.vehicle_number LIKE ? OR o.id = ?)");
    params.push(`%${q}%`, `%${q}%`, Number(q) || 0);
  }

  const orders = await query(
    `SELECT o.*, c.name, c.id AS cid
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.booked_at DESC LIMIT 1000`,
    params,
  );

  const sum = (k) => orders.reduce((s, o) => s + (o.status === "delivered" ? Number(o[k]) || 0 : 0), 0);

  return (
    <>
      <PageHead icon={ClipboardList} title={t("nav.orders")} subtitle={t("orders.subtitle")} />
      <div className="stats">
        <Stat icon={ClipboardList} label={t("orders.inRange")} value={orders.length} />
        <Stat icon={BadgeIndianRupee} label={t("orders.deliveredValue")} value={inr(sum("total_amount"))} />
        <Stat icon={HandCoins} tone="ok" label={t("orders.paidAtDelivery")} value={inr(sum("paid_amount"))} />
        <Stat icon={Wallet} tone="danger" label={t("orders.leftAsBalance")} value={inr(sum("balance_amount"))} />
      </div>
      <Section icon={ListFilter} title={t("orders.all")} subtitle={t("orders.filterSubtitle")}>
        <form className="filters">
          <label className="field"><span>{t("orders.bookedFrom")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <label className="field">
            <span>{t("common.status")}</span>
            <select className="select" name="status" defaultValue={status}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}Title`)}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{t("common.search")}</span>
            <input className="input" name="q" defaultValue={q} placeholder={t("orders.searchPlaceholder")} />
          </label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>

        {orders.length === 0 ? (
          <EmptyState icon={SearchX} title={t("orders.none")}>{t("orders.noneText")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>{t("common.booked")}</th><th>{t("common.customer")}</th><th>{t("common.status")}</th>
                  <th className="num">{t("orders.ordered")}</th><th className="num">{t("orders.delivered")}</th><th className="num">{t("common.rate")}</th>
                  <th className="num">{t("common.total")}</th><th className="num">{t("common.paid")}</th><th className="num">{t("common.balance")}</th>
                  <th>{t("common.vehicle")}</th><th>{t("orders.arrivalDispatch")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="cell-link" href={`/deliveries/${o.id}`}>#{o.id}</Link></td>
                    <td className="nowrap">{fmtDateTime(o.booked_at)}</td>
                    <td><Link className="cell-link" href={`/customers/${o.cid}`}>{o.name}</Link></td>
                    <td><span className={`badge badge-${o.status}`}>{t(`status.${o.status}`)}</span></td>
                    <td className="num">{qty(o.ordered_qty)}</td>
                    <td className="num">{o.delivered_qty == null ? "—" : qty(o.delivered_qty)}</td>
                    <td className="num">{inr(o.rate)}</td>
                    <td className="num">{inr(o.total_amount)}</td>
                    <td className="num">{o.paid_amount == null ? "—" : inr(o.paid_amount)}</td>
                    <td className={`num ${o.balance_amount > 0 ? "due" : ""}`}>{o.balance_amount == null ? "—" : inr(o.balance_amount)}</td>
                    <td className="nowrap">{o.vehicle_number || "—"}</td>
                    <td className="nowrap">{o.arrival_time ? `${fmtTime(o.arrival_time)} – ${fmtTime(o.dispatch_time)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{t("orders.footer", { n: orders.length })}</td>
                  <td className="num">{qty(sum("delivered_qty"))}</td>
                  <td />
                  <td className="num">{inr(sum("total_amount"))}</td>
                  <td className="num">{inr(sum("paid_amount"))}</td>
                  <td className="num">{inr(sum("balance_amount"))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
