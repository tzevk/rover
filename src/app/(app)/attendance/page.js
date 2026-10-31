import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, CircleCheckBig, CircleSlash, HardHat, Save, TimerReset, Users, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { saveAttendance } from "@/app/actions/attendance";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ATTENDANCE, inr, shiftDate, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.attendance");

export default async function AttendancePage({ searchParams }) {
  const user = await requireUser();
  const cid = user.company_id;
  const { t, fmtDate } = await getI18n();
  const isAdmin = user.role === "admin";
  const today = todayISO();
  const { date: requested } = await searchParams;
  // Workers always work on today; the Admin can browse and correct past days.
  const date = isAdmin && isDate(requested) && requested <= today ? requested : today;

  const staff = await query(
    `SELECT s.id, s.name, s.daily_wage, a.status
     FROM staff s LEFT JOIN attendance a ON a.staff_id = s.id AND a.att_date = ?
     WHERE s.company_id = ${cid} AND (s.active = 1 OR a.status IS NOT NULL)
     ORDER BY s.name`,
    [date],
  );
  const marked = staff.filter((s) => s.status);
  const count = (st) => marked.filter((s) => s.status === st).length;
  const wageCost = marked.reduce((t, s) => t + s.daily_wage * ATTENDANCE[s.status].weight, 0);

  return (
    <>
      <PageHead icon={CalendarCheck} title={t("nav.attendance")} subtitle={isAdmin ? fmtDate(date) : t("attendance.today", { date: fmtDate(date) })}>
        {isAdmin && (
          <div className="date-nav">
            <Link className="btn btn-sm" href={`/attendance?date=${shiftDate(date, -1)}`} aria-label={t("common.prevDay")}><ChevronLeft size={16} /></Link>
            <form className="row">
              <input className="input input-sm" type="date" name="date" defaultValue={date} max={today} />
              <button className="btn btn-sm">{t("common.go")}</button>
            </form>
            {date < today && (
              <Link className="btn btn-sm" href={`/attendance?date=${shiftDate(date, 1)}`} aria-label={t("common.nextDay")}><ChevronRight size={16} /></Link>
            )}
          </div>
        )}
      </PageHead>

      <div className="stats">
        <Stat icon={CircleCheckBig} tone="ok" label={t("att.present")} value={count("present")} />
        <Stat icon={TimerReset} tone="brown" label={t("att.half_day")} value={count("half_day")} />
        <Stat icon={CircleSlash} tone="danger" label={t("att.absent")} value={count("absent")} />
        {isAdmin && (
          <Stat accent icon={Wallet} label={t("attendance.wageCost")} value={inr(wageCost)} />
        )}
      </div>

      <Section icon={Users} title={t("attendance.mark")} subtitle={t("attendance.marked", { marked: marked.length, total: staff.length })}>
        {staff.length === 0 ? (
          <EmptyState icon={HardHat} title={t("common.noStaffYet")}>{isAdmin ? <Link href="/staff" className="btn btn-sm"><HardHat size={14} /> {t("common.addStaff")}</Link> : t("attendance.askAdmin")}</EmptyState>
        ) : (
          <ActionForm action={saveAttendance} className="">
            <input type="hidden" name="date" value={date} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("common.status")}</th>
                    {isAdmin && <th className="num">{t("common.dailyWage")}</th>}
                    {isAdmin && <th className="num">{t("attendance.earned")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>
                        <div className="seg" role="radiogroup" aria-label={t("attendance.for", { name: s.name })}>
                          {Object.keys(ATTENDANCE).map((value) => (
                            <label key={value}>
                              <input type="radio" name={`s_${s.id}`} value={value} defaultChecked={s.status === value} />
                              <span>{t(`att.${value}`)}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      {isAdmin && <td className="num">{inr(s.daily_wage)}</td>}
                      {isAdmin && <td className="num">{s.status ? inr(s.daily_wage * ATTENDANCE[s.status].weight) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ padding: 16 }}>
              <SubmitButton className="btn btn-accent"><Save size={16} /> {t("attendance.save")}</SubmitButton>
              <span className="muted" style={{ fontSize: 13 }}>{t("attendance.marked", { marked: marked.length, total: staff.length })}</span>
            </div>
          </ActionForm>
        )}
      </Section>
    </>
  );
}
