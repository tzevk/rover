import Link from "next/link";
import { Ban, CalendarCheck, Contact, Filter, HandCoins, HardHat, History, PackageCheck, PlusCircle, Receipt, RotateCcw, UserCog } from "lucide-react";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDateTime, shiftDate, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Activity log" };

const LABELS = {
  "order.book": "Booked order", "order.deliver": "Completed delivery", "order.cancel": "Cancelled order",
  "order.reopen": "Reopened delivery", "customer.create": "Added customer", "customer.update": "Edited customer",
  "payment.record": "Recorded payment", "payment.delete": "Deleted payment", "expense.add": "Added expense",
  "expense.delete": "Deleted expense", "attendance.save": "Saved attendance", "staff.add": "Added staff",
  "staff.update": "Edited staff", "user.create": "Created login", "user.enable": "Enabled login",
  "user.disable": "Disabled login", "user.password_reset": "Reset password",
};

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
  await requireAdmin();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : shiftDate(today, -7);
  const to = isDate(sp.to) ? sp.to : today;
  const who = (sp.who ?? "").trim();

  const rows = await query(
    `SELECT * FROM audit_log
     WHERE DATE(at) BETWEEN ? AND ? ${who ? "AND username = ?" : ""}
     ORDER BY id DESC LIMIT 500`,
    who ? [from, to, who] : [from, to],
  );

  return (
    <>
      <PageHead icon={History} title="Activity log" subtitle="Every change, who made it and when. Entries can't be edited or removed." />
      <Section icon={History} title="Recent changes" subtitle="Newest first">
        <form className="filters">
          <label className="field"><span>From</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <label className="field"><span>Username</span><input className="input" name="who" defaultValue={who} placeholder="Anyone" /></label>
          <button className="btn"><Filter size={16} /> Apply</button>
        </form>
        {rows.length === 0 ? <EmptyState icon={History} title="No activity in this range" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDateTime(r.at)}</td>
                    <td>{r.username || "system"}</td>
                    <td className="nowrap"><span className="act">{(() => { const I = actionIcon(r.action); return <I size={15} />; })()}{LABELS[r.action] ?? r.action}</span></td>
                    <td className="nowrap">
                      {r.entity_id && LINKS[r.entity]
                        ? <Link className="cell-link" href={LINKS[r.entity](r.entity_id)}>{r.entity} #{r.entity_id}</Link>
                        : r.entity_id ? `${r.entity} #${r.entity_id}` : r.entity}
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
