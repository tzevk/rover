import { CreditCard } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { PageHead, Section } from "@/components/ui";
import { startPayment } from "@/app/actions/billing";
import { requireAccount } from "@/lib/auth";
import { billingReady, PLAN_DAYS, planPrice } from "@/lib/billing";
import { inr } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.billing");

// Stays open after access ends: it's the one page that can restore it.
export default async function BillingPage() {
  const user = await requireAccount();
  const { t, fmtDate } = await getI18n();
  const until = user.access_until && fmtDate(user.access_until.slice(0, 10));
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
    </>
  );
}
