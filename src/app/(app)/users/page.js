import { KeyRound, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ConfirmButton from "@/components/ConfirmButton";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createUser, resetPassword, setUserActive } from "@/app/actions/users";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.users");

export default async function UsersPage() {
  const me = await requireAdmin();
  const { t, fmtDate } = await getI18n();
  const users = await query(`SELECT id, username, full_name, role, active, created_at FROM users WHERE company_id = ${me.company_id} ORDER BY role, full_name`);

  return (
    <>
      <PageHead icon={UserCog} title={t("nav.users")} subtitle={t("users.subtitle")} />

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 20 }}>
        <Section icon={UserPlus} title={t("users.create")}>
          <div className="card-pad">
          <ActionForm action={createUser} resetOnSuccess>
            <div className="fields">
              <label className="field"><span>{t("common.fullName")}</span><input className="input" name="full_name" required /></label>
              <label className="field"><span>{t("common.username")}</span><input className="input" name="username" required autoCapitalize="none" autoComplete="off" /></label>
            </div>
            <div className="fields">
              <label className="field">
                <span>{t("users.access")}</span>
                <select className="select" name="role" defaultValue="worker">
                  <option value="worker">{t("users.workerOption")}</option>
                  <option value="admin">{t("users.adminOption")}</option>
                </select>
              </label>
              <label className="field"><span>{t("common.password")}</span><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
            </div>
            <div><SubmitButton><UserPlus size={16} /> {t("users.createBtn")}</SubmitButton></div>
          </ActionForm>
          </div>
        </Section>

        <Section icon={ShieldCheck} title={t("users.roles")}>
          <div className="card-pad">
          <dl className="kv">
            <dt><span className="badge badge-worker">{t("users.workerBadge")}</span></dt>
            <dd style={{ fontWeight: 400 }}>{t("users.workerCan")}</dd>
            <dt><span className="badge badge-admin">{t("users.adminBadge")}</span></dt>
            <dd style={{ fontWeight: 400 }}>{t("users.adminCan")}</dd>
          </dl>
        </div>
        </Section>
      </div>

      <Section icon={Users} title={t("users.everyone")}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("common.name")}</th><th>{t("common.username")}</th><th>{t("users.role")}</th><th>{t("users.since")}</th><th>{t("common.status")}</th><th>{t("users.resetPassword")}</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong>{u.id === me.id && <span className="muted">{t("users.you")}</span>}</td>
                  <td>{u.username}</td>
                  <td><span className={`badge badge-${u.role}`}>{t(`role.${u.role}`)}</span></td>
                  <td className="nowrap">{fmtDate(u.created_at)}</td>
                  <td>
                    {u.id === me.id ? <span className="badge badge-delivered">{t("badge.active")}</span> : (
                      <form action={setUserActive.bind(null, u.id, !u.active)}>
                        <ConfirmButton
                          message={t(u.active ? "users.disableConfirm" : "users.enableConfirm", { name: u.full_name })}
                          className={`btn btn-sm ${u.active ? "btn-danger" : ""}`}
                        >
                          {t(u.active ? "users.disable" : "users.enable")}
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                  <td>
                    <ActionForm action={resetPassword} className="row" resetOnSuccess>
                      <input type="hidden" name="id" value={u.id} />
                      <input className="input input-sm" name="password" type="password" placeholder={t("users.newPassword")} minLength={8} required autoComplete="new-password" style={{ width: 160 }} />
                      <SubmitButton className="btn btn-sm"><KeyRound size={14} /> {t("users.set")}</SubmitButton>
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
