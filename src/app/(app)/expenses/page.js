import { BarChart3, Filter, Fuel, MoreHorizontal, Receipt, ReceiptText, Save, Trash2, Truck, UtensilsCrossed, Wrench } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addExpense, deleteExpense } from "@/app/actions/expenses";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { EXPENSE_CATEGORIES, inr, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.expenses");

const CATEGORY_ICONS = { fuel: Fuel, maintenance: Wrench, transport: Truck, food_tea: UtensilsCrossed, other: MoreHorizontal };

export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const today = todayISO();

  return (
    <>
      <PageHead icon={Receipt} title={t("nav.expenses")} subtitle={t("expenses.subtitle")} />
      <Section icon={ReceiptText} title={t("expenses.add")} subtitle={t("expenses.addSubtitle")} className="section-gap">
        <div className="card-pad">
        <ActionForm action={addExpense} resetOnSuccess>
          <div className="fields">
            <label className="field">
              <span>{t("common.date")}</span>
              <input className="input" type="date" name="expense_date" defaultValue={today} max={today} required />
            </label>
            <label className="field">
              <span>{t("common.type")}</span>
              <select className="select" name="category" required defaultValue="">
                <option value="" disabled>{t("expenses.choose")}</option>
                {Object.keys(EXPENSE_CATEGORIES).map((k) => <option key={k} value={k}>{t(`expense.${k}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t("common.amountRs")}</span>
              <input className="input num" type="number" name="amount" min="0.01" step="0.01" inputMode="decimal" required />
            </label>
          </div>
          <label className="field">
            <span>{t("common.details")}</span>
            <input className="input" name="description" placeholder={t("expenses.placeholder")} />
          </label>
          <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("expenses.save")}</SubmitButton></div>
        </ActionForm>
        </div>
      </Section>

      {user.role === "admin" && <ExpenseReport cid={user.company_id} searchParams={await searchParams} today={today} />}
    </>
  );
}

async function ExpenseReport({ cid, searchParams: sp, today }) {
  const { t, fmtDate } = await getI18n();
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to : today;
  const category = EXPENSE_CATEGORIES[sp.category] ? sp.category : "";

  const params = [from, to];
  let extra = "";
  if (category) { extra = "AND e.category = ?"; params.push(category); }

  const [rows, byCategory] = await Promise.all([
    query(
      `SELECT e.*, u.full_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.company_id = ${cid} AND e.expense_date BETWEEN ? AND ? AND e.deleted_at IS NULL ${extra}
       ORDER BY e.expense_date DESC, e.id DESC`,
      params,
    ),
    query(
      `SELECT category, SUM(amount) AS total FROM expenses e
       WHERE e.company_id = ${cid} AND e.expense_date BETWEEN ? AND ? AND e.deleted_at IS NULL ${extra} GROUP BY category`,
      params,
    ),
  ]);
  const totals = Object.fromEntries(byCategory.map((r) => [r.category, r.total]));
  const grand = byCategory.reduce((s, r) => s + r.total, 0);

  return (
    <Section icon={BarChart3} title={t("expenses.report")} subtitle={t("common.totalOf", { amount: inr(grand) })}>
      <form className="filters">
        <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <label className="field">
          <span>{t("common.type")}</span>
          <select className="select" name="category" defaultValue={category}>
            <option value="">{t("expenses.allTypes")}</option>
            {Object.keys(EXPENSE_CATEGORIES).map((k) => <option key={k} value={k}>{t(`expense.${k}`)}</option>)}
          </select>
        </label>
        <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
      </form>

      <div className="stats" style={{ padding: "16px 20px 0", marginBottom: 0 }}>
        {Object.keys(EXPENSE_CATEGORIES).map((k) => (
          <Stat key={k} icon={CATEGORY_ICONS[k]} tone={k === "fuel" ? "brown" : undefined} label={t(`expense.${k}`)} value={inr(totals[k] ?? 0)} />
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title={t("expenses.none")}>{t("expenses.noneText")}</EmptyState>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr><th>{t("common.date")}</th><th>{t("common.type")}</th><th>{t("common.details")}</th><th>{t("expenses.enteredBy")}</th><th className="num">{t("common.amount")}</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtDate(e.expense_date)}</td>
                  <td>{t(`expense.${e.category}`)}</td>
                  <td className="muted">{e.description || "—"}</td>
                  <td>{e.full_name || "—"}</td>
                  <td className="num">{inr(e.amount)}</td>
                  <td className="right">
                    <form action={deleteExpense.bind(null, e.id)}>
                      <ConfirmButton message={t("expenses.deleteConfirm")} className="btn btn-ghost btn-sm btn-danger">
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
