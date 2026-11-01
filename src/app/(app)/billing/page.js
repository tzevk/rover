import Link from "next/link";
import { CreditCard, Download, History } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { PageHead, Section } from "@/components/ui";
import { startPayment } from "@/app/actions/billing";
import { requireAccount } from "@/lib/auth";
import { billingReady, PLAN_DAYS, planPrice } from "@/lib/billing";
import { query } from "@/lib/db";
import { inr } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.billing");

// Stays open after access ends: it's the one page that can restore it.
export default async function BillingPage() {
  const user = await requireAccount();
  const { t, fmtDate } = await getI18n();
  const until = user.access_until && fmtDate(user.access_until.slice(0, 10));
  const payments = user.role === "admin"
    ? await query("SELECT event_id, amount, created_at FROM billing_events WHERE company_id = ? ORDER BY created_at DESC LIMIT 36", [user.company_id])
    : [];
  const status = !user.has_access ? t("billing.expired")
    : !until ? t("billing.unlimited")
    : t(user.plan === "paid" ? "billing.paid" : "billing.trial", { date: until });

  return (
    <>
      <PageHead icon={CreditCard} title={t("nav.billing")} subtitle={user.company_name} />
      <Section icon={CreditCard} title={status}>
        <div className="card-pad">
          {user.role !== "admin" ? (
            <p className="muted" style={{ margin: 0 }}>{t("billing.askOwner")}</p>
          ) : !until ? null : billingReady() ? (
            <ActionForm action={startPayment}>
              <p style={{ margin: 0 }}>{t("billing.price", { amount: inr(planPrice()), days: PLAN_DAYS })}</p>
              <div><SubmitButton className="btn btn-accent"><CreditCard size={16} /> {t("billing.pay")}</SubmitButton></div>
            </ActionForm>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t("billing.unavailable")}</p>
          )}
        </div>
      </Section>
      {payments.length > 0 && (
        <Section icon={History} title={t("billing.history")}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("billing.paidOn")}</th><th className="num">{t("billing.amount")}</th></tr></thead>
              <tbody>{payments.map((p) => <tr key={p.event_id}><td>{fmtDate(p.created_at.slice(0, 10))}</td><td className="num">{inr(p.amount / 100)}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}
      {user.role === "admin" && (
        <Section icon={Download} title={t("billing.records")} subtitle={t("billing.recordsText")}>
          <div className="card-pad">
            <a className="btn" href="/api/export/all" download><Download size={16} /> {t("billing.download")}</a>
          </div>
        </Section>
      )}
      <p className="muted"><Link href="/help">{t("billing.help")}</Link></p>
    </>
  );
}
