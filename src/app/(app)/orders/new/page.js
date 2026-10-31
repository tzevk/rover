import { ClipboardPen, Info, PlusCircle } from "lucide-react";
import { PageHead, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { getStock, query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { currentSite } from "@/lib/sites";
import NewOrderForm from "./NewOrderForm";

export const generateMetadata = pageTitle("nav.newOrder");

export default async function NewOrderPage() {
  const user = await requireUser();
  const cid = user.company_id;
  const { t } = await getI18n();
  // Workers see names and phones only, never balances.
  const customers = await cached(`customer-list:${cid}`, { tags: [TAGS.customers], ttl: 300 }, () =>
    query(`SELECT id, name, phone FROM customers WHERE company_id = ${cid} ORDER BY name`),
  );
  const materials = (await getStock(cid, await currentSite(user))).filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.name, unit: t(`unit.${m.unit}`), rate: m.default_rate, available: m.on_hand - m.reserved }));
  return (
    <>
      <PageHead icon={PlusCircle} title={t("newOrder.title")} subtitle={t("newOrder.subtitle")} />
      <div className="split">
        <Section icon={ClipboardPen} title={t("newOrder.details")} subtitle={t("newOrder.allRequired")}>
          <div className="card-pad"><NewOrderForm customers={customers} materials={materials} /></div>
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
