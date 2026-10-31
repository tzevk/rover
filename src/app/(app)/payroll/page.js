import { Calculator, HardHat, Users, Wallet } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.payroll");

export default async function PayrollPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDate } = await getI18n();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to : today;

  const rows = await query(
    `SELECT s.id, s.name, s.daily_wage, s.active,
            COALESCE(SUM(a.status = 'present'), 0)  AS present,
            COALESCE(SUM(a.status = 'half_day'), 0) AS half,
            COALESCE(SUM(a.status = 'absent'), 0)   AS absent
     FROM staff s
     LEFT JOIN attendance a ON a.staff_id = s.id AND a.att_date BETWEEN ? AND ?
     WHERE s.company_id = ${cid}
     GROUP BY s.id
     HAVING s.active = 1 OR present + half + absent > 0
     ORDER BY s.name`,
    [from, to],
  );
  const data = rows.map((r) => {
    const days = Number(r.present) + Number(r.half) * 0.5;
    return { ...r, days, salary: days * r.daily_wage };
  });
  const total = data.reduce((s, r) => s + r.salary, 0);

  return (
    <>
      <PageHead icon={Wallet} title={t("nav.payroll")} subtitle={t("payroll.subtitle", { from: fmtDate(from), to: fmtDate(to) })} />
      <div className="stats">
        <Stat accent icon={Wallet} label={t("payroll.totalPayable")} value={inr(total)} />
        <Stat icon={Users} label={t("payroll.staffCounted")} value={data.length} />
      </div>

      <Section icon={Calculator} title={t("payroll.byPerson")} subtitle={t("payroll.rule")}>
        <form className="filters">
          <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <button className="btn"><Calculator size={16} /> {t("payroll.calculate")}</button>
        </form>
        {data.length === 0 ? (
          <EmptyState icon={HardHat} title={t("common.noStaffYet")}>{t("payroll.noneText")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("common.name")}</th><th className="num">{t("att.present")}</th><th className="num">{t("att.half_day")}</th><th className="num">{t("att.absent")}</th>
                  <th className="num">{t("payroll.payableDays")}</th><th className="num">{t("common.dailyWage")}</th><th className="num">{t("payroll.salary")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{!r.active && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>{t("badge.inactive")}</span>}</td>
                    <td className="num">{r.present}</td>
                    <td className="num">{r.half}</td>
                    <td className="num">{r.absent}</td>
                    <td className="num">{r.days}</td>
                    <td className="num">{inr(r.daily_wage)}</td>
                    <td className="num"><strong>{inr(r.salary)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={6}>{t("common.total")}</td><td className="num">{inr(total)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
