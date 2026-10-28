import { KeyRound, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createUser, resetPassword, setUserActive } from "@/app/actions/users";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Logins" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await query("SELECT id, username, full_name, role, active, created_at FROM users ORDER BY role, full_name");

  return (
    <>
      <PageHead icon={UserCog} title="Logins" subtitle="Who can sign in, and what they can see." />

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 20 }}>
        <Section icon={UserPlus} title="Create a login">
          <div className="card-pad">
          <ActionForm action={createUser} resetOnSuccess>
            <div className="fields">
              <label className="field"><span>Full name</span><input className="input" name="full_name" required /></label>
              <label className="field"><span>Username</span><input className="input" name="username" required autoCapitalize="none" autoComplete="off" /></label>
            </div>
            <div className="fields">
              <label className="field">
                <span>Access</span>
                <select className="select" name="role" defaultValue="worker">
                  <option value="worker">Worker (staff)</option>
                  <option value="admin">Admin (owner)</option>
                </select>
              </label>
              <label className="field"><span>Password</span><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
            </div>
            <div><SubmitButton><UserPlus size={16} /> Create login</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="What each role can do">
          <div className="card-pad">
          <dl className="kv">
            <dt><span className="badge badge-worker">Worker</span></dt>
            <dd style={{ fontWeight: 400 }}>Book orders, add customers, complete pending deliveries, add expenses, mark today&apos;s attendance. Cannot see completed orders, balances, wages or reports.</dd>
            <dt><span className="badge badge-admin">Admin</span></dt>
            <dd style={{ fontWeight: 400 }}>Everything: full order history, customer balances and ledgers, daily accounts, payroll, staff wages and logins.</dd>
          </dl>
        </div>
        </Section>
      </div>

      <Section icon={Users} title="Everyone with access">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Since</th><th>Status</th><th>Reset password</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong>{u.id === me.id && <span className="muted"> (you)</span>}</td>
                  <td>{u.username}</td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td className="nowrap">{fmtDate(u.created_at)}</td>
                  <td>
                    {u.id === me.id ? <span className="badge badge-delivered">active</span> : (
                      <form action={setUserActive.bind(null, u.id, !u.active)}>
                        <ConfirmButton
                          message={u.active ? `Disable ${u.full_name}? They will be signed out.` : `Re-enable ${u.full_name}?`}
                          className={`btn btn-sm ${u.active ? "btn-danger" : ""}`}
                        >
                          {u.active ? "Disable" : "Enable"}
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                  <td>
                    <ActionForm action={resetPassword} className="row" resetOnSuccess>
                      <input type="hidden" name="id" value={u.id} />
                      <input className="input input-sm" name="password" type="password" placeholder="New password" minLength={8} required autoComplete="new-password" style={{ width: 160 }} />
                      <SubmitButton className="btn btn-sm"><KeyRound size={14} /> Set</SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
