import { HardHat, Save, UserPlus, Users } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addStaff, updateStaff } from "@/app/actions/staff";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.staff");

export default async function StaffPage() {
  await requireAdmin();
  const { t } = await getI18n();
  const staff = await query("SELECT * FROM staff ORDER BY active DESC, name");

  return (
    <>
      <PageHead icon={HardHat} title={t("nav.staff")} subtitle={t("staff.subtitle")} />

      <Section icon={UserPlus} title={t("staff.add")} subtitle={t("staff.addSubtitle")} className="section-gap">
        <div className="card-pad">
        <ActionForm action={addStaff} resetOnSuccess>
          <div className="fields">
            <label className="field"><span>{t("common.nameRequired")}</span><input className="input" name="name" required /></label>
            <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" /></label>
            <label className="field"><span>{t("common.dailyWageRs")}</span><input className="input num" name="daily_wage" type="number" min="0" step="0.01" required /></label>
          </div>
          <div><SubmitButton><UserPlus size={16} /> {t("common.addStaff")}</SubmitButton></div>
        </ActionForm>
        </div>
      </Section>

      <Section icon={Users} title={t("staff.all")} subtitle={t("staff.allSubtitle")}>
        {staff.length === 0 ? <EmptyState icon={HardHat} title={t("common.noStaffYet")}>{t("staff.noneText")}</EmptyState> : (
          <div className="stack" style={{ padding: 16, gap: 10 }}>
            {staff.map((s) => (
              <ActionForm key={s.id} action={updateStaff} className="inset">
                <input type="hidden" name="id" value={s.id} />
                <div className="fields" style={{ alignItems: "end" }}>
                  <label className="field"><span>{t("common.name")}</span><input className="input input-sm" name="name" defaultValue={s.name} required /></label>
                  <label className="field"><span>{t("common.phone")}</span><input className="input input-sm" name="phone" defaultValue={s.phone ?? ""} /></label>
                  <label className="field"><span>{t("common.dailyWageRs")}</span><input className="input input-sm num" name="daily_wage" type="number" min="0" step="0.01" defaultValue={s.daily_wage} /></label>
                  <div className="row" style={{ height: 36 }}>
                    <label className="row" style={{ gap: 6, fontSize: 14 }}>
                      <input type="checkbox" name="active" defaultChecked={!!s.active} /> {t("common.active")}
                    </label>
                    <SubmitButton className="btn btn-sm"><Save size={14} /> {t("common.save")}</SubmitButton>
                  </div>
                </div>
              </ActionForm>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
