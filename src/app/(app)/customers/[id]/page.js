import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeIndianRupee, BookText, Clock, HandCoins, IdCard, Save, Trash2, UserRound, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { deletePayment, recordPayment, updateCustomer } from "@/app/actions/customers";
import { requireAdmin } from "@/lib/auth";
import { customerBalances, query } from "@/lib/db";
import { inr, qty, todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("customer.title");

export default async function CustomerPage({ params }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDate, fmtDateTime } = await getI18n();
  const id = Number((await params).id);
  const [[customer], entries, pending] = await Promise.all([
    query(`SELECT * FROM (${customerBalances(cid)}) b WHERE id = ?`, [id]),
    query(
      `SELECT 'delivery' AS kind, id AS ref, delivered_at AS at, total_amount AS debit, paid_amount AS credit,
              delivered_qty, rate, vehicle_number, NULL AS note
       FROM orders WHERE company_id = ${cid} AND customer_id = ? AND status = 'delivered'
       UNION ALL
       SELECT 'payment', id, TIMESTAMP(paid_on, TIME(created_at)), 0, amount, NULL, NULL, NULL, note
       FROM customer_payments WHERE company_id = ${cid} AND customer_id = ? AND deleted_at IS NULL
       ORDER BY at, ref`,
      [id, id],
    ),
    query(`SELECT id, ordered_qty, total_amount, booked_at FROM orders WHERE company_id = ${cid} AND customer_id = ? AND status = 'pending' ORDER BY booked_at`, [id]),
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
        <ArrowLeft size={14} /> {t("customer.back")}
      </Link>
      <PageHead icon={UserRound} eyebrow={t("common.customer")} title={customer.name} subtitle={[customer.phone, customer.address].filter(Boolean).join(" · ") || t("customer.noContact")} />

      <div className="stats">
        <div className="card stat accent">
          <div className="label">{t(customer.outstanding < 0 ? "customer.advanceWithUs" : "customer.outstandingBalance")}</div>
          <div className="value">{inr(Math.abs(customer.outstanding))}</div>
        </div>
        <Stat icon={BadgeIndianRupee} label={t("customers.totalBilled")} value={inr(customer.billed)} hint={t("customer.deliveriesHint", { n: customer.orders })} />
        <Stat icon={HandCoins} tone="ok" label={t("customers.totalReceived")} value={inr(customer.paid)} />
        <Stat icon={Clock} tone="brown" label={t("customer.pendingOrders")} value={pending.length} />
      </div>

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 20 }}>
        <Section icon={HandCoins} title={t("customer.recordPayment")} subtitle={t("customer.reduces")}>
          <div className="card-pad">
          <ActionForm action={recordPayment} resetOnSuccess>
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="fields">
              <label className="field"><span>{t("common.amountRs")}</span><input className="input num" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label>
              <label className="field"><span>{t("common.date")}</span><input className="input" name="paid_on" type="date" defaultValue={todayISO()} max={todayISO()} required /></label>
            </div>
            <label className="field"><span>{t("common.note")}</span><input className="input" name="note" placeholder={t("customer.notePlaceholder")} /></label>
            <div><SubmitButton className="btn btn-accent"><HandCoins size={16} /> {t("customer.recordPaymentBtn")}</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>

        <Section icon={IdCard} title={t("customer.contact")}>
          <div className="card-pad">
          <ActionForm action={updateCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <div className="fields">
              <label className="field"><span>{t("common.name")}</span><input className="input" name="name" defaultValue={customer.name} required /></label>
              <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" defaultValue={customer.phone ?? ""} /></label>
            </div>
            <label className="field"><span>{t("common.address")}</span><input className="input" name="address" defaultValue={customer.address ?? ""} /></label>
            <label className="field"><span>{t("customer.creditLimit")}</span><input className="input num" type="number" name="credit_limit" min="0" step="0.01" inputMode="decimal" defaultValue={customer.credit_limit ?? ""} /><small>{t("customer.creditHint")}</small></label>
            <div><SubmitButton className="btn"><Save size={16} /> {t("customer.saveDetails")}</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>
      </div>

      {pending.length > 0 && (
        <Section icon={Clock} title={t("customer.pendingOrders")} className="section-gap">
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

      <Section icon={BookText} title={t("customer.ledger")} subtitle={t("customer.ledgerSubtitle")}>
        {ledger.length === 0 ? (
          <EmptyState icon={BookText} title={t("customer.nothingYet")}>{t("customer.nothingYetText")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t("common.date")}</th><th>{t("customer.entry")}</th><th className="num">{t("customers.billed")}</th><th className="num">{t("common.paid")}</th><th className="num">{t("common.balance")}</th><th /></tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={`${e.kind}-${e.ref}`}>
                    <td className="nowrap">{e.kind === "payment" ? fmtDate(e.at) : fmtDateTime(e.at)}</td>
                    <td>
                      {e.kind === "delivery" ? (
                        <>
                          <Link className="cell-link" href={`/deliveries/${e.ref}`}>{t("common.orderNo", { id: e.ref })}</Link>
                          <span className="muted"> · {qty(e.delivered_qty)} × {inr(e.rate)} · {e.vehicle_number}</span>
                        </>
                      ) : (
                        <>{t("customer.paymentReceived")}{e.note && <span className="muted"> · {e.note}</span>}</>
                      )}
                    </td>
                    <td className="num">{e.debit ? inr(e.debit) : ""}</td>
                    <td className="num">{e.credit ? inr(e.credit) : ""}</td>
                    <td className={`num ${e.running > 0 ? "due" : ""}`}>{inr(e.running)}</td>
                    <td className="right">
                      {e.kind === "payment" && (
                        <form action={deletePayment.bind(null, customer.id, e.ref)}>
                          <ConfirmButton message={t("customer.deletePaymentConfirm")} className="btn btn-ghost btn-sm btn-danger">
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
