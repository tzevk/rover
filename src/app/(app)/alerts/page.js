import Link from "next/link";
import { ArrowRight, BellRing, CircleCheckBig } from "lucide-react";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { describeAlert, getAlerts } from "@/lib/alerts";
import { requireAdmin } from "@/lib/auth";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.alerts");

export default async function AlertsPage() {
  const { company_id: cid } = await requireAdmin();
  const i18n = await getI18n();
  const { t } = i18n;
  const alerts = await getAlerts(cid);
  return (
    <>
      <PageHead icon={BellRing} title={t("nav.alerts")} subtitle={t("alerts.subtitle")} />
      <Section icon={BellRing} title={t("alerts.count", { count: alerts.length })}>
        {alerts.length === 0 ? (
          <EmptyState icon={CircleCheckBig} title={t("alerts.none")}>{t("alerts.noneText")}</EmptyState>
        ) : (
          <ul className="alert-list">
            {alerts.map((a, i) => (
              <li key={i} className={`tone-${a.tone}`}>
                <Link href={a.href}>
                  <span className="alert-kind">{t(`alert.kind.${a.kind}`)}</span>
                  <span>{describeAlert(a, i18n)}</span>
                  <ArrowRight size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
