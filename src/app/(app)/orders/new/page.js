import { ClipboardPen, Info, PlusCircle } from "lucide-react";
import { PageHead, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import NewOrderForm from "./NewOrderForm";

export const generateMetadata = pageTitle("nav.newOrder");

export default async function NewOrderPage() {
  await requireUser();
  const { t } = await getI18n();
  // Workers see names and phones only — never balances.
  const customers = await cached("customer-list", { tags: [TAGS.customers], ttl: 300 }, () =>
    query("SELECT id, name, phone FROM customers ORDER BY name"),
  );
  return (
    <>
      <PageHead icon={PlusCircle} title={t("newOrder.title")} subtitle={t("newOrder.subtitle")} />
      <div className="split">
        <Section icon={ClipboardPen} title={t("newOrder.details")} subtitle={t("newOrder.allRequired")}>
          <div className="card-pad"><NewOrderForm customers={customers} /></div>
        </Section>
        <Section icon={Info} title={t("newOrder.how")} className="aside-card">
          <ol className="steps">
            <li><strong>{t("newOrder.step1")}</strong> {t("newOrder.step1Text")}</li>
            <li><strong>{t("newOrder.step2")}</strong> {t("newOrder.step2Text")}</li>
            <li><strong>{t("newOrder.step3")}</strong> {t("newOrder.step3Text")}</li>
          </ol>
        </Section>
      </div>
    </>
  );
}
