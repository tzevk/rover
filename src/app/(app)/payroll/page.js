import { Calculator, HardHat, Users, Wallet } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDate, inr, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }) {
  await requireAdmin();
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
      <PageHead icon={Wallet} title="Payroll" subtitle={`Salary from attendance · ${fmtDate(from)} – ${fmtDate(to)}`} />
      <div className="stats">
        <Stat accent icon={Wallet} label="Total salary payable" value={inr(total)} />
        <Stat icon={Users} label="Staff counted" value={data.length} />
      </div>

      <Section icon={Calculator} title="Salary by person" subtitle="Present = 1 day, Half-day = ½, Absent = 0">
        <form className="filters">
          <label className="field"><span>From</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <button className="btn"><Calculator size={16} /> Calculate</button>
        </form>
        {data.length === 0 ? (
          <EmptyState icon={HardHat} title="No staff yet">Add staff and mark attendance to see salaries.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th className="num">Present</th><th className="num">Half-day</th><th className="num">Absent</th>
                  <th className="num">Payable days</th><th className="num">Daily wage</th><th className="num">Salary</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{!r.active && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>inactive</span>}</td>
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
                <tr><td colSpan={6}>Total</td><td className="num">{inr(total)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
