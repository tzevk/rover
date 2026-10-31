import { CheckCheck, Download, FileCode2, Filter, Save, Settings2, TriangleAlert } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { PageHead, Section, Stat } from "@/components/ui";
import { markImported, saveTallySettings } from "@/app/actions/tally";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { DEFAULT_LEDGERS, ledgerNames } from "@/lib/tally.mjs";
import { tallyData, undoneInTally, voucherCount } from "@/lib/tally-data";
import { isDate } from "@/lib/validate";

export const generateMetadata = pageTitle("nav.tally");

export default async function TallyPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t, fmtDate } = await getI18n();
  const sp = await searchParams;
  const today = todayISO();
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to : today;
  const [[company], data, undone] = await Promise.all([
    query("SELECT tally_company, tally_ledgers FROM companies WHERE id = ?", [cid]),
    tallyData(cid, from, to, true),
    undoneInTally(cid),
  ]);
  const ledgers = ledgerNames(company.tally_ledgers);
  const range = `from=${from}&to=${to}`;

  return (
    <>
      <PageHead icon={FileCode2} title={t("nav.tally")} subtitle={t("tally.subtitle")} />

      <div className="stats">
        <Stat accent icon={FileCode2} label={t("tally.new")} value={voucherCount(data)} hint={`${fmtDate(from)} – ${fmtDate(to)}`} />
        <Stat icon={FileCode2} label={t("tally.sales")} value={data.sales.length} />
        <Stat icon={FileCode2} label={t("tally.receipts")} value={data.receipts.length} />
        <Stat icon={FileCode2} label={t("tally.payments")} value={data.payments.length} />
      </div>

      {undone.length > 0 && (
        <div className="alert alert-error section-gap"><TriangleAlert size={18} /><span>{t("tally.undone", { list: undone.map((u) => u.ref).join(", ") })}</span></div>
      )}

      <Section icon={Download} title={t("tally.steps")} subtitle={t("tally.stepsSubtitle")} className="section-gap">
        <form className="filters">
          <label className="field"><span>{t("common.from")}</span><input className="input" type="date" name="from" defaultValue={from} /></label>
          <label className="field"><span>{t("common.to")}</span><input className="input" type="date" name="to" defaultValue={to} /></label>
          <button className="btn"><Filter size={16} /> {t("common.apply")}</button>
        </form>
        <div className="card-pad">
          <ol className="steps">
            <li>
              <strong>{t("tally.step1")}</strong> {t("tally.step1Text")}
              <div style={{ marginTop: 8 }}><a className="btn btn-sm" href={`/api/export/tally?kind=masters&${range}`} download><Download size={14} /> {t("tally.ledgers")}</a></div>
            </li>
            <li>
              <strong>{t("tally.step2")}</strong> {t("tally.step2Text")}
              <div style={{ marginTop: 8 }}><a className="btn btn-sm btn-primary" href={`/api/export/tally?kind=vouchers&${range}`} download><Download size={14} /> {t("tally.vouchers")}</a></div>
            </li>
            <li>
              <strong>{t("tally.step3")}</strong> {t("tally.step3Text")}
              <div style={{ marginTop: 8 }}>
                <ActionForm action={markImported}>
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />
                  <div><SubmitButton className="btn btn-sm"><CheckCheck size={14} /> {t("tally.mark")}</SubmitButton></div>
                </ActionForm>
              </div>
            </li>
          </ol>
        </div>
      </Section>

      <Section icon={Settings2} title={t("tally.settings")} subtitle={t("tally.settingsSubtitle")}>
        <div className="card-pad">
          <ActionForm action={saveTallySettings}>
            <label className="field"><span>{t("tally.company")}</span><input className="input" name="tally_company" maxLength={120} defaultValue={company.tally_company ?? ""} /><small>{t("tally.companyHint")}</small></label>
            <div className="fields">
              {Object.keys(DEFAULT_LEDGERS).map((key) => (
                <label key={key} className="field"><span>{t(`tally.ledger.${key}`)}</span><input className="input" name={`ledger_${key}`} maxLength={100} defaultValue={ledgers[key]} /></label>
              ))}
            </div>
            <div><SubmitButton className="btn"><Save size={16} /> {t("action.save")}</SubmitButton></div>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
