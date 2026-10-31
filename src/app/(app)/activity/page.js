import Link from "next/link";
import { Ban, CalendarCheck, Contact, Filter, HandCoins, HardHat, History, PackageCheck, PlusCircle, Receipt, RotateCcw, UserCog } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.activity");


function actionIcon(action) {
  if (action === "order.book") return PlusCircle;
  if (action === "order.deliver") return PackageCheck;
  if (action === "order.cancel") return Ban;
  if (action === "order.reopen") return RotateCcw;
  const byEntity = { customer: Contact, payment: HandCoins, expense: Receipt, attendance: CalendarCheck, staff: HardHat, user: UserCog };
  return byEntity[action.split(".")[0]] ?? History;
}

const LINKS = { order: (id) => `/deliveries/${id}`, customer: (id) => `/customers/${id}` };

export default async function ActivityPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDateTime } = await getI18n();
  // Unknown actions/entities (added later without a translation) show their raw name.
  const label = (prefix, key) => { const s = t(`${prefix}.${key}`); return s === `${prefix}.${key}` ? key : s; };
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : shiftDate(today, -7);
  const to = isDate(sp.to) ? sp.to : today;
  const who = (sp.who ?? "").trim();

  const rows = await query(
    `SELECT * FROM audit_log
     WHERE company_id = ${cid} AND DATE(at) BETWEEN ? AND ? ${who ? "AND username = ?" : ""}
     ORDER BY id DESC LIMIT 500`,
    who ? [from, to, who] : [from, to],
  );

  return (
    <>
      <PageHead icon={History} title={t("nav.activity")} subtitle={t("activity.subtitle")} />
      <Section icon={History} title={t("activity.recent")} subtitle={t("activity.newestFirst")}>
        <form className="filters">
          <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <label className="field"><span>{t("common.username")}</span><input className="input" name="who" defaultValue={who} placeholder={t("activity.anyone")} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        {rows.length === 0 ? <EmptyState icon={History} title={t("activity.none")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("activity.when")}</th><th>{t("activity.who")}</th><th>{t("activity.what")}</th><th>{t("activity.record")}</th><th>{t("common.details")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDateTime(r.at)}</td>
                    <td>{r.username || t("activity.system")}</td>
                    <td className="nowrap"><span className="act">{(() => { const I = actionIcon(r.action); return <I size={15} />; })()}{label("audit", r.action)}</span></td>
                    <td className="nowrap">
                      {r.entity_id && LINKS[r.entity]
                        ? <Link className="cell-link" href={LINKS[r.entity](r.entity_id)}>{label("entity", r.entity)} #{r.entity_id}</Link>
                        : r.entity_id ? `${label("entity", r.entity)} #${r.entity_id}` : label("entity", r.entity)}
                    </td>
                    <td><code style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-word" }}>{r.details}</code></td>
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
