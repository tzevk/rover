import { HardHat, Save, UserPlus, Users } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addStaff, updateStaff } from "@/app/actions/staff";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata = { title: "Staff & wages" };

export default async function StaffPage() {
  await requireAdmin();
  const staff = await query("SELECT * FROM staff ORDER BY active DESC, name");

  return (
    <>
      <PageHead icon={HardHat} title="Staff & wages" subtitle="Daily wages are visible to the Admin only." />

      <Section icon={UserPlus} title="Add a staff member" subtitle="They don't need a login to be on attendance" className="section-gap">
        <div className="card-pad">
        <ActionForm action={addStaff} resetOnSuccess>
          <div className="fields">
            <label className="field"><span>Name *</span><input className="input" name="name" required /></label>
            <label className="field"><span>Phone</span><input className="input" name="phone" type="tel" /></label>
            <label className="field"><span>Daily wage (₹)</span><input className="input num" name="daily_wage" type="number" min="0" step="0.01" required /></label>
          </div>
          <div><SubmitButton><UserPlus size={16} /> Add staff</SubmitButton></div>
        </ActionForm>
        </div>
      </Section>

      <Section icon={Users} title="All staff" subtitle="Inactive staff are hidden from attendance">
        {staff.length === 0 ? <EmptyState icon={HardHat} title="No staff yet">Add your first staff member above.</EmptyState> : (
          <div className="stack" style={{ padding: 16, gap: 10 }}>
            {staff.map((s) => (
              <ActionForm key={s.id} action={updateStaff} className="inset">
                <input type="hidden" name="id" value={s.id} />
                <div className="fields" style={{ alignItems: "end" }}>
                  <label className="field"><span>Name</span><input className="input input-sm" name="name" defaultValue={s.name} required /></label>
                  <label className="field"><span>Phone</span><input className="input input-sm" name="phone" defaultValue={s.phone ?? ""} /></label>
                  <label className="field"><span>Daily wage (₹)</span><input className="input input-sm num" name="daily_wage" type="number" min="0" step="0.01" defaultValue={s.daily_wage} /></label>
                  <div className="row" style={{ height: 36 }}>
                    <label className="row" style={{ gap: 6, fontSize: 14 }}>
                      <input type="checkbox" name="active" defaultChecked={!!s.active} /> Active
                    </label>
                    <SubmitButton className="btn btn-sm"><Save size={14} /> Save</SubmitButton>
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
