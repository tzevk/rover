import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, CircleCheckBig, CircleSlash, HardHat, Save, TimerReset, Users, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { saveAttendance } from "@/app/actions/attendance";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ATTENDANCE, fmtDate, inr, shiftDate, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const today = todayISO();
  const { date: requested } = await searchParams;
  // Workers always work on today; the Admin can browse and correct past days.
  const date = isAdmin && isDate(requested) && requested <= today ? requested : today;

  const staff = await query(
    `SELECT s.id, s.name, s.daily_wage, a.status
     FROM staff s LEFT JOIN attendance a ON a.staff_id = s.id AND a.att_date = ?
     WHERE s.active = 1 OR a.status IS NOT NULL
     ORDER BY s.name`,
    [date],
  );
  const marked = staff.filter((s) => s.status);
  const count = (st) => marked.filter((s) => s.status === st).length;
  const wageCost = marked.reduce((t, s) => t + s.daily_wage * ATTENDANCE[s.status].weight, 0);

  return (
    <>
      <PageHead icon={CalendarCheck} title="Attendance" subtitle={isAdmin ? fmtDate(date) : `Today · ${fmtDate(date)}`}>
        {isAdmin && (
          <div className="date-nav">
            <Link className="btn btn-sm" href={`/attendance?date=${shiftDate(date, -1)}`} aria-label="Previous day"><ChevronLeft size={16} /></Link>
            <form className="row">
              <input className="input input-sm" type="date" name="date" defaultValue={date} max={today} />
              <button className="btn btn-sm">Go</button>
            </form>
            {date < today && (
              <Link className="btn btn-sm" href={`/attendance?date=${shiftDate(date, 1)}`} aria-label="Next day"><ChevronRight size={16} /></Link>
            )}
          </div>
        )}
      </PageHead>

      <div className="stats">
        <Stat icon={CircleCheckBig} tone="ok" label="Present" value={count("present")} />
        <Stat icon={TimerReset} tone="brown" label="Half-day" value={count("half_day")} />
        <Stat icon={CircleSlash} tone="danger" label="Absent" value={count("absent")} />
        {isAdmin && (
          <Stat accent icon={Wallet} label="Wage cost for the day" value={inr(wageCost)} />
        )}
      </div>

      <Section icon={Users} title="Mark attendance" subtitle={`${marked.length} of ${staff.length} marked`}>
        {staff.length === 0 ? (
          <EmptyState icon={HardHat} title="No staff yet">{isAdmin ? <Link href="/staff" className="btn btn-sm"><HardHat size={14} /> Add staff</Link> : "Ask the Admin to add staff."}</EmptyState>
        ) : (
          <ActionForm action={saveAttendance} className="">
            <input type="hidden" name="date" value={date} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    {isAdmin && <th className="num">Daily wage</th>}
                    {isAdmin && <th className="num">Earned</th>}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>
                        <div className="seg" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                          {Object.entries(ATTENDANCE).map(([value, { label }]) => (
                            <label key={value}>
                              <input type="radio" name={`s_${s.id}`} value={value} defaultChecked={s.status === value} />
                              <span>{label}</span>
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
              <SubmitButton className="btn btn-accent"><Save size={16} /> Save attendance</SubmitButton>
              <span className="muted" style={{ fontSize: 13 }}>{marked.length} of {staff.length} marked</span>
            </div>
          </ActionForm>
        )}
      </Section>
    </>
  );
}
