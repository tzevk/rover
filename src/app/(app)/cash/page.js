import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, ChevronLeft, ChevronRight, History, TriangleAlert } from "lucide-react";
import { EmptyState, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { cashMovements, closingPeriod } from "@/lib/cash";
import { query } from "@/lib/db";
import { inr, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";
import { isDate } from "@/lib/validate";
import CashForm from "./CashForm";

export const generateMetadata = pageTitle("nav.cash");

export default async function CashPage({ searchParams }) {
  const user = await requireAdmin();
  const cid = user.company_id;
  const { t, fmtDate } = await getI18n();
  const site = await currentSite(user);
  const today = todayISO();
  const { date: requested } = await searchParams;
  const date = isDate(requested) && requested <= today ? requested : today;

  const [{ previous, from }, [closing], [latest], history] = await Promise.all([
    closingPeriod(cid, site.id, date),
    query("SELECT c.*, u.full_name FROM cash_closings c LEFT JOIN users u ON u.id = c.closed_by WHERE c.company_id = ? AND c.site_id = ? AND c.close_date = ?", [cid, site.id, date]),
    query("SELECT MAX(close_date) AS last FROM cash_closings WHERE company_id = ? AND site_id = ?", [cid, site.id]),
    query("SELECT close_date, opening, expected, counted, difference, note FROM cash_closings WHERE company_id = ? AND site_id = ? ORDER BY close_date DESC LIMIT 30", [cid, site.id]),
  ]);
  const m = await cashMovements(cid, site.id, from, date);

  const cashIn = m.cashSales + m.cashReceived;
  const opening = previous?.counted ?? closing?.opening ?? 0;
  const deposited = closing?.deposited ?? 0;
  const expected = Math.round((opening + cashIn - m.cashExpenses - deposited) * 100) / 100;
  // Anything entered or changed since the count shows here, instead of silently moving the closing.
  const changedBy = closing ? Math.round((expected - closing.expected) * 100) / 100 : 0;
  const editable = !latest.last || date >= latest.last;
  const covers = from === date ? fmtDate(date) : `${fmtDate(from)} – ${fmtDate(date)}`;

  return (
    <>
      <PageHead icon={Banknote} eyebrow={site.name} title={t("nav.cash")} subtitle={t("cash.subtitle")}>
        <div className="date-nav">
          <Link className="btn btn-sm" href={`/cash?date=${shiftDate(date, -1)}`} aria-label={t("common.prevDay")}><ChevronLeft size={16} /></Link>
          <form className="row">
            <input className="input input-sm" type="date" name="date" defaultValue={date} max={today} aria-label={t("common.date")} />
            <button className="btn btn-sm">{t("common.go")}</button>
          </form>
          {date < today && <Link className="btn btn-sm" href={`/cash?date=${shiftDate(date, 1)}`} aria-label={t("common.nextDay")}><ChevronRight size={16} /></Link>}
        </div>
      </PageHead>

      <div className="stats">
        <Stat accent icon={Banknote} label={t("cash.expected")} value={inr(closing ? closing.expected : expected)} hint={t("cash.covers", { period: covers })} />
        <Stat icon={ArrowDownLeft} tone="ok" label={t("cash.in")} value={inr(cashIn)} hint={t("cash.inHint", { sales: inr(m.cashSales), dues: inr(m.cashReceived) })} />
        <Stat icon={ArrowUpRight} tone="danger" label={t("cash.out")} value={inr(m.cashExpenses)} />
        {closing && <Stat icon={TriangleAlert} tone={closing.difference === 0 ? "ok" : "danger"} label={t("cash.difference")} value={inr(closing.difference)} hint={t("cash.countedBy", { amount: inr(closing.counted), name: closing.full_name || "-" })} />}
      </div>

      {changedBy !== 0 && (
        <div className="alert alert-error section-gap"><TriangleAlert size={18} /><span>{t("cash.changed", { amount: inr(Math.abs(changedBy)) })}</span></div>
      )}

      <div className="grid-2 section-gap" style={{ alignItems: "start" }}>
        <Section icon={Banknote} title={t(closing ? "cash.closedTitle" : "cash.count")} subtitle={closing ? fmtDate(closing.close_date) : t("cash.countSubtitle")}>
          <div className="card-pad">
            {editable ? (
              <CashForm date={date} needsOpening={!previous} opening={opening} cashIn={cashIn} cashOut={m.cashExpenses} closing={closing ?? null} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>{t("cash.lockedText")}</p>
            )}
          </div>
        </Section>

        <Section icon={ArrowDownLeft} title={t("cash.movements")} subtitle={t("cash.covers", { period: covers })}>
          {m.sales.length + m.received.length + m.expenses.length === 0 ? <EmptyState icon={Banknote} title={t("cash.none")}>{t("cash.noneText")}</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {m.sales.map((s) => <tr key={`s${s.id}`}><td><Link className="cell-link" href={`/deliveries/${s.id}`}>{s.name}</Link><div className="muted" style={{ fontSize: 12 }}>{t("cash.atDelivery")}</div></td><td className="num credit">+{inr(s.amount)}</td></tr>)}
                  {m.received.map((r) => <tr key={`r${r.id}`}><td>{r.name}<div className="muted" style={{ fontSize: 12 }}>{t("cash.duesPaid")}</div></td><td className="num credit">+{inr(r.amount)}</td></tr>)}
                  {m.expenses.map((e) => <tr key={`e${e.id}`}><td>{t(`expense.${e.category}`)}<div className="muted" style={{ fontSize: 12 }}>{e.description || "-"}</div></td><td className="num due">−{inr(e.amount)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section icon={History} title={t("cash.history")}>
        {history.length === 0 ? <EmptyState icon={History} title={t("cash.noHistory")}>{t("cash.noHistoryText")}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("common.date")}</th><th className="num">{t("cash.expected")}</th><th className="num">{t("cash.counted")}</th><th className="num">{t("cash.difference")}</th><th>{t("common.note")}</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.close_date}>
                    <td className="nowrap"><Link className="cell-link" href={`/cash?date=${h.close_date}`}>{fmtDate(h.close_date)}</Link></td>
                    <td className="num">{inr(h.expected)}</td>
                    <td className="num">{inr(h.counted)}</td>
                    <td className={`num${h.difference < 0 ? " due" : h.difference > 0 ? " credit" : ""}`}>{inr(h.difference)}</td>
                    <td>{h.note || "-"}</td>
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
