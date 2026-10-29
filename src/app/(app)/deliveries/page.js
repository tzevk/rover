import Link from "next/link";
import { CheckCircle2, CircleCheckBig, ListFilter, Search, Truck } from "lucide-react";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, qty } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.deliveries");

export default async function DeliveriesPage({ searchParams }) {
  await requireUser();
  const { t, fmtDateTime } = await getI18n();
  const { q = "", done } = await searchParams;
  const like = `%${q.trim()}%`;

  // Only pending orders are ever listed here — completed ones live in the Admin's order history.
  const orders = await query(
    `SELECT o.id, o.ordered_qty, o.rate, o.total_amount, o.booked_at, c.name, c.phone, u.full_name AS booked_by
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = o.booked_by
     WHERE o.status = 'pending' AND (c.name LIKE ? OR c.phone LIKE ? OR o.id = ?)
     ORDER BY o.booked_at`,
    [like, like, Number(q) || 0],
  );

  return (
    <>
      <PageHead icon={Truck} title={t("nav.deliveries")} subtitle={t("deliveries.subtitle")} />

      {done && (
        <div className="alert alert-ok" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={18} /> {t("deliveries.done", { id: done })}
        </div>
      )}

      <Section icon={ListFilter} title={t("deliveries.waiting", { n: orders.length })} subtitle={t("deliveries.oldestFirst")}>
        <form className="filters">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">{t("common.search")}</span>
            <input className="input" name="q" defaultValue={q} placeholder={t("deliveries.searchPlaceholder")} />
          </label>
          <button className="btn"><Search size={16} /> {t("common.search")}</button>
        </form>

        {orders.length === 0 ? (
          <EmptyState icon={q ? Search : CircleCheckBig} title={t(q ? "deliveries.noMatches" : "home.allCaughtUp")}>
            {t(q ? "deliveries.noMatchesText" : "deliveries.noneText")}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>{t("common.order")}</th>
                  <th>{t("common.customer")}</th>
                  <th className="num">{t("common.qty")}</th>
                  <th className="num">{t("common.rate")}</th>
                  <th className="num">{t("common.total")}</th>
                  <th>{t("common.booked")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="nowrap"><span className="badge badge-pending">#{o.id}</span></td>
                    <td>
                      <strong>{o.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{o.phone || "—"}</div>
                    </td>
                    <td className="num" data-label={t("common.qty")}>{qty(o.ordered_qty)}</td>
                    <td className="num" data-label={t("common.rate")}>{inr(o.rate)}</td>
                    <td className="num" data-label={t("common.total")}>{inr(o.total_amount)}</td>
                    <td className="nowrap" data-label={t("common.booked")}>
                      {fmtDateTime(o.booked_at)}
                      <div className="muted" style={{ fontSize: 12 }}>{t("deliveries.by", { name: o.booked_by || "—" })}</div>
                    </td>
                    <td className="right wide">
                      <Link href={`/deliveries/${o.id}`} className="btn btn-primary btn-sm">
                        <Truck size={14} /> {t("deliveries.deliver")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
