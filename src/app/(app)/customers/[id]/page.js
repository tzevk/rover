import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeIndianRupee, BookText, Clock, HandCoins, IdCard, Save, Trash2, UserRound, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { deletePayment, recordPayment, updateCustomer } from "@/app/actions/customers";
import { requireAdmin } from "@/lib/auth";
import { CUSTOMER_BALANCES, query } from "@/lib/db";
import { fmtDate, fmtDateTime, inr, qty, todayISO } from "@/lib/format";

export const metadata = { title: "Customer ledger" };

export default async function CustomerPage({ params }) {
  await requireAdmin();
  const id = Number((await params).id);
  const [[customer], entries, pending] = await Promise.all([
    query(`SELECT * FROM (${CUSTOMER_BALANCES}) b WHERE id = ?`, [id]),
    query(
      `SELECT 'delivery' AS kind, id AS ref, delivered_at AS at, total_amount AS debit, paid_amount AS credit,
              delivered_qty, rate, vehicle_number, NULL AS note
       FROM orders WHERE customer_id = ? AND status = 'delivered'
       UNION ALL
       SELECT 'payment', id, TIMESTAMP(paid_on, TIME(created_at)), 0, amount, NULL, NULL, NULL, note
       FROM customer_payments WHERE customer_id = ? AND deleted_at IS NULL
       ORDER BY at, ref`,
      [id, id],
    ),
    query("SELECT id, ordered_qty, total_amount, booked_at FROM orders WHERE customer_id = ? AND status = 'pending' ORDER BY booked_at", [id]),
  ]);
  if (!customer) notFound();

  let running = 0;
  const ledger = entries.map((e) => {
    running += e.debit - e.credit;
    return { ...e, running };
  }).reverse();

  return (
    <>
      <Link href="/customers" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> All customers
      </Link>
      <PageHead icon={UserRound} eyebrow="Customer" title={customer.name} subtitle={[customer.phone, customer.address].filter(Boolean).join(" · ") || "No contact details"} />

      <div className="stats">
        <div className="card stat accent">
          <div className="label">{customer.outstanding < 0 ? "Advance with us" : "Outstanding balance"}</div>
          <div className="value">{inr(Math.abs(customer.outstanding))}</div>
        </div>
        <Stat icon={BadgeIndianRupee} label="Total billed" value={inr(customer.billed)} hint={`${customer.orders} deliveries`} />
        <Stat icon={HandCoins} tone="ok" label="Total received" value={inr(customer.paid)} />
        <Stat icon={Clock} tone="brown" label="Pending orders" value={pending.length} />
      </div>

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 20 }}>
        <Section icon={HandCoins} title="Record a payment" subtitle="Reduces the outstanding balance">
          <div className="card-pad">
          <ActionForm action={recordPayment} resetOnSuccess>
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="fields">
              <label className="field"><span>Amount (₹)</span><input className="input num" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label>
              <label className="field"><span>Date</span><input className="input" name="paid_on" type="date" defaultValue={todayISO()} max={todayISO()} required /></label>
            </div>
            <label className="field"><span>Note</span><input className="input" name="note" placeholder="Cash / UPI / cheque no." /></label>
            <div><SubmitButton className="btn btn-accent"><HandCoins size={16} /> Record payment</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>

        <Section icon={IdCard} title="Contact details">
          <div className="card-pad">
          <ActionForm action={updateCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <div className="fields">
              <label className="field"><span>Name</span><input className="input" name="name" defaultValue={customer.name} required /></label>
              <label className="field"><span>Phone</span><input className="input" name="phone" type="tel" defaultValue={customer.phone ?? ""} /></label>
            </div>
            <label className="field"><span>Address</span><input className="input" name="address" defaultValue={customer.address ?? ""} /></label>
            <div><SubmitButton className="btn"><Save size={16} /> Save details</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>
      </div>

      {pending.length > 0 && (
        <Section icon={Clock} title="Pending orders" className="section-gap">
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {pending.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="cell-link" href={`/deliveries/${o.id}`}>#{o.id}</Link></td>
                    <td>{fmtDateTime(o.booked_at)}</td>
                    <td className="num">{qty(o.ordered_qty)}</td>
                    <td className="num">{inr(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section icon={BookText} title="Ledger" subtitle="Every delivery and payment, newest first">
        {ledger.length === 0 ? (
          <EmptyState icon={BookText} title="Nothing yet">Deliveries and payments will appear here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Entry</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={`${e.kind}-${e.ref}`}>
                    <td className="nowrap">{e.kind === "payment" ? fmtDate(e.at) : fmtDateTime(e.at)}</td>
                    <td>
                      {e.kind === "delivery" ? (
                        <>
                          <Link className="cell-link" href={`/deliveries/${e.ref}`}>Order #{e.ref}</Link>
                          <span className="muted"> · {qty(e.delivered_qty)} × {inr(e.rate)} · {e.vehicle_number}</span>
                        </>
                      ) : (
                        <>Payment received{e.note && <span className="muted"> · {e.note}</span>}</>
                      )}
                    </td>
                    <td className="num">{e.debit ? inr(e.debit) : ""}</td>
                    <td className="num">{e.credit ? inr(e.credit) : ""}</td>
                    <td className={`num ${e.running > 0 ? "due" : ""}`}>{inr(e.running)}</td>
                    <td className="right">
                      {e.kind === "payment" && (
                        <form action={deletePayment.bind(null, customer.id, e.ref)}>
                          <ConfirmButton message="Delete this payment entry?" className="btn btn-ghost btn-sm btn-danger">
                            <Trash2 size={14} />
                          </ConfirmButton>
                        </form>
                      )}
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
