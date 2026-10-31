import { Building2, Save } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { PageHead, Section } from "@/components/ui";
import { saveCompany } from "@/app/actions/company";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.company");

export default async function CompanyPage() {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const [company] = await query("SELECT name, address, phone, gstin FROM companies WHERE id = ?", [user.company_id]);
  return (
    <>
      <PageHead icon={Building2} title={t("nav.company")} subtitle={t("company.subtitle")} />
      <Section icon={Building2} title={t("company.details")}>
        <div className="card-pad">
          <ActionForm action={saveCompany}>
            <div className="fields">
              <label className="field"><span>{t("signup.company")}</span><input className="input" name="name" required maxLength={120} defaultValue={company.name} /></label>
              <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" maxLength={20} defaultValue={company.phone ?? ""} /></label>
              <label className="field"><span>GSTIN</span><input className="input" name="gstin" maxLength={15} defaultValue={company.gstin ?? ""} style={{ textTransform: "uppercase" }} /></label>
            </div>
            <label className="field"><span>{t("common.address")}</span><input className="input" name="address" maxLength={255} defaultValue={company.address ?? ""} /></label>
            <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("action.save")}</SubmitButton></div>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
