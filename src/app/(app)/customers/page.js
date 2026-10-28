import Link from "next/link";
import { BadgeIndianRupee, Contact, HandCoins, Search, Users, UserPlus, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createCustomer } from "@/app/actions/customers";
import { requireAdmin } from "@/lib/auth";
import { CUSTOMER_BALANCES, query } from "@/lib/db";
import { inr } from "@/lib/format";

export const metadata = { title: "Customers & balances" };

export default async function CustomersPage({ searchParams }) {
  await requireAdmin();
  const { q = "", show = "all" } = await searchParams;
  const like = `%${q.trim()}%`;
  const customers = await query(
    `SELECT * FROM (${CUSTOMER_BALANCES}) b
     WHERE (name LIKE ? OR phone LIKE ?) ${show === "due" ? "AND outstanding > 0" : ""}
     ORDER BY outstanding DESC, name`,
    [like, like],
  );
  const totals = customers.reduce(
    (t, c) => ({ billed: t.billed + c.billed, paid: t.paid + c.paid, outstanding: t.outstanding + Math.max(c.outstanding, 0) }),
    { billed: 0, paid: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHead icon={Contact} title="Customers & balances" subtitle="Outstanding = delivered value − paid at delivery − later payments." />

      <div className="stats">
        <Stat accent icon={Wallet} label="Outstanding" value={inr(totals.outstanding)} />
        <Stat icon={BadgeIndianRupee} label="Total billed" value={inr(totals.billed)} />
        <Stat icon={HandCoins} tone="ok" label="Total received" value={inr(totals.paid)} />
        <Stat icon={Users} tone="brown" label="Customers" value={customers.length} />
      </div>

      <details className="card" style={{ marginBottom: 20 }}>
        <summary><UserPlus size={18} /> Add a customer</summary>
        <div className="card-pad">
          <ActionForm action={createCustomer} resetOnSuccess>
            <div className="fields">
              <label className="field"><span>Name *</span><input className="input" name="name" required /></label>
              <label className="field"><span>Phone</span><input className="input" name="phone" type="tel" /></label>
              <label className="field"><span>Address</span><input className="input" name="address" /></label>
            </div>
            <div><SubmitButton><UserPlus size={16} /> Add customer</SubmitButton></div>
          </ActionForm>
        </div>
      </details>

      <Section icon={Contact} title="Balance report" subtitle="Highest outstanding first">
        <form className="filters">
          <label className="field" style={{ flex: 1 }}>
            <span>Search</span>
            <input className="input" name="q" defaultValue={q} placeholder="Name or phone" />
          </label>
          <label className="field">
            <span>Show</span>
            <select className="select" name="show" defaultValue={show}>
              <option value="all">All customers</option>
              <option value="due">Only with balance due</option>
            </select>
          </label>
          <button className="btn"><Search size={16} /> Apply</button>
        </form>
        {customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet">Add one above, or from the booking screen.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th><th>Phone</th><th>Address</th>
                  <th className="num">Deliveries</th><th className="num">Billed</th><th className="num">Received</th><th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="cell-link" href={`/customers/${c.id}`}>{c.name}</Link></td>
                    <td className="nowrap">{c.phone || "—"}</td>
                    <td className="muted">{c.address || "—"}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{inr(c.billed)}</td>
                    <td className="num">{inr(c.paid)}</td>
                    <td className={`num ${c.outstanding > 0 ? "due" : c.outstanding < 0 ? "credit" : ""}`}>
                      {c.outstanding < 0 ? `${inr(-c.outstanding)} adv.` : inr(c.outstanding)}
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
