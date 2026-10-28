import { BarChart3, Filter, Fuel, MoreHorizontal, Receipt, ReceiptText, Save, Trash2, Truck, UtensilsCrossed, Wrench } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addExpense, deleteExpense } from "@/app/actions/expenses";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { EXPENSE_CATEGORIES, fmtDate, inr, todayISO } from "@/lib/format";
import { isDate } from "@/lib/validate";

export const metadata = { title: "Expenses" };

const CATEGORY_ICONS = { fuel: Fuel, maintenance: Wrench, transport: Truck, food_tea: UtensilsCrossed, other: MoreHorizontal };

export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser();
  const today = todayISO();

  return (
    <>
      <PageHead icon={Receipt} title="Expenses" subtitle="Daily quarry running costs." />
      <Section icon={ReceiptText} title="Add an expense" subtitle="Fuel, maintenance, transport, food/tea or other" className="section-gap">
        <div className="card-pad">
        <ActionForm action={addExpense} resetOnSuccess>
          <div className="fields">
            <label className="field">
              <span>Date</span>
              <input className="input" type="date" name="expense_date" defaultValue={today} max={today} required />
            </label>
            <label className="field">
              <span>Type</span>
              <select className="select" name="category" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Amount (₹)</span>
              <input className="input num" type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" required />
            </label>
          </div>
          <label className="field">
            <span>Details</span>
            <input className="input" name="description" placeholder="e.g. 40 L diesel for loader" />
          </label>
          <div><SubmitButton className="btn btn-accent"><Save size={16} /> Save expense</SubmitButton></div>
        </ActionForm>
        </div>
      </Section>

      {user.role === "admin" && <ExpenseReport searchParams={await searchParams} today={today} />}
    </>
  );
}

async function ExpenseReport({ searchParams: sp, today }) {
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to : today;
  const category = EXPENSE_CATEGORIES[sp.category] ? sp.category : "";

  const params = [from, to];
  let extra = "";
  if (category) { extra = "AND e.category = ?"; params.push(category); }

  const [rows, byCategory] = await Promise.all([
    query(
      `SELECT e.*, u.full_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.expense_date BETWEEN ? AND ? AND e.deleted_at IS NULL ${extra}
       ORDER BY e.expense_date DESC, e.id DESC`,
      params,
    ),
    query(
      `SELECT category, SUM(amount) AS total FROM expenses e
       WHERE expense_date BETWEEN ? AND ? AND deleted_at IS NULL ${extra} GROUP BY category`,
      params,
    ),
  ]);
  const totals = Object.fromEntries(byCategory.map((r) => [r.category, r.total]));
  const grand = byCategory.reduce((s, r) => s + r.total, 0);

  return (
    <Section icon={BarChart3} title="Expense report" subtitle={`Total ${inr(grand)}`}>
      <form className="filters">
        <label className="field"><span>From</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label className="field"><span>To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <label className="field">
          <span>Type</span>
          <select className="select" name="category" defaultValue={category}>
            <option value="">All types</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn"><Filter size={16} /> Apply</button>
      </form>

      <div className="stats" style={{ padding: "16px 20px 0", marginBottom: 0 }}>
        {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
          <Stat key={k} icon={CATEGORY_ICONS[k]} tone={k === "fuel" ? "brown" : undefined} label={v} value={inr(totals[k] ?? 0)} />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses in this range">Pick other dates or a different type.</EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Details</th><th>Entered by</th><th className="num">Amount</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtDate(e.expense_date)}</td>
                  <td>{EXPENSE_CATEGORIES[e.category]}</td>
                  <td className="muted">{e.description || "—"}</td>
                  <td>{e.full_name || "—"}</td>
                  <td className="num">{inr(e.amount)}</td>
                  <td className="right">
                    <form action={deleteExpense.bind(null, e.id)}>
                      <ConfirmButton message="Delete this expense?" className="btn btn-ghost btn-sm btn-danger">
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
