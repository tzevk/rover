import { Building2, FileText, Gem, Save } from "lucide-react";
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
  const [company] = await query(
    `SELECT name, address, place, pincode, phone, gstin, gst_enabled, rates_include_gst, invoice_prefix, bank_details, invoice_terms, ewb_intra_limit, pass_required
     FROM companies WHERE id = ?`,
    [user.company_id],
  );
  return (
    <>
      <PageHead icon={Building2} title={t("nav.company")} subtitle={t("company.subtitle")} />
      <ActionForm action={saveCompany}>
        <Section icon={Building2} title={t("company.details")}>
          <div className="card-pad form">
            <div className="fields">
              <label className="field"><span>{t("signup.company")}</span><input className="input" name="name" required maxLength={120} defaultValue={company.name} /></label>
              <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" maxLength={20} defaultValue={company.phone ?? ""} /></label>
              <label className="field"><span>GSTIN</span><input className="input" name="gstin" maxLength={15} defaultValue={company.gstin ?? ""} style={{ textTransform: "uppercase" }} /></label>
            </div>
            <label className="field"><span>{t("common.address")}</span><input className="input" name="address" maxLength={255} defaultValue={company.address ?? ""} /></label>
            <div className="fields fields-pair">
              <label className="field"><span>{t("customer.place")}</span><input className="input" name="place" maxLength={60} defaultValue={company.place ?? ""} /></label>
              <label className="field"><span>{t("company.pincode")}</span><input className="input" name="pincode" inputMode="numeric" maxLength={6} defaultValue={company.pincode ?? ""} /></label>
            </div>
          </div>
        </Section>

        <Section icon={FileText} title={t("company.gst")} subtitle={t("company.gstSubtitle")}>
          <div className="card-pad form">
            <label className="check"><input type="checkbox" name="gst_enabled" defaultChecked={Boolean(company.gst_enabled)} /> <span><strong>{t("company.gstOn")}</strong><small>{t("company.gstOnHint")}</small></span></label>
            <label className="check"><input type="checkbox" name="rates_include_gst" defaultChecked={Boolean(company.rates_include_gst)} /> <span><strong>{t("company.inclusive")}</strong><small>{t("company.inclusiveHint")}</small></span></label>
            <div className="fields">
              <label className="field"><span>{t("company.prefix")}</span><input className="input" name="invoice_prefix" maxLength={4} defaultValue={company.invoice_prefix} style={{ textTransform: "uppercase" }} /><small>{t("company.prefixHint")}</small></label>
              <label className="field"><span>{t("company.ewbLimit")}</span><input className="input num" type="number" name="ewb_intra_limit" min="0" step="1" inputMode="numeric" defaultValue={company.ewb_intra_limit} /><small>{t("company.ewbLimitHint")}</small></label>
            </div>
            <label className="field"><span>{t("company.bank")}</span><input className="input" name="bank_details" maxLength={255} defaultValue={company.bank_details ?? ""} /><small>{t("company.bankHint")}</small></label>
            <label className="field"><span>{t("company.terms")}</span><input className="input" name="invoice_terms" maxLength={255} defaultValue={company.invoice_terms ?? ""} /></label>
          </div>
        </Section>

        <Section icon={Gem} title={t("nav.royalty")}>
          <div className="card-pad form">
            <label className="check"><input type="checkbox" name="pass_required" defaultChecked={Boolean(company.pass_required)} /> <span><strong>{t("company.passRequired")}</strong><small>{t("company.passRequiredHint")}</small></span></label>
          </div>
        </Section>
        <div><SubmitButton className="btn btn-accent"><Save size={16} /> {t("action.save")}</SubmitButton></div>
      </ActionForm>
    </>
  );
}
