import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import Logo from "@/components/Logo";
import SubmitButton from "@/components/SubmitButton";
import { signup } from "@/app/actions/auth";
import { getI18n } from "@/lib/i18n/server";
import { SITE } from "@/lib/site";

export const metadata = {
  title: { absolute: "Start a free trial | R.K. Enterprises" },
  description: "Create a workspace for orders, dispatch, ledgers and attendance.",
  alternates: { canonical: "/signup" },
  };

export default async function SignupPage() {
  if (!SITE.signupOpen) notFound();
  const { t } = await getI18n();
  return (
    <main className="status-page">
      <div className="backdrop" aria-hidden="true" />
      <Link href="/" aria-label={t("app.name")}><Logo size={44} /></Link>
      <div className="card card-pad signup-card">
        <h1>{t("signup.title")}</h1>
        <p className="muted">{t("signup.sub")}</p>
        <ActionForm action={signup}>
          <label className="field"><span>{t("signup.company")}</span><input className="input" name="company_name" required maxLength={120} autoComplete="organization" /></label>
          <label className="field"><span>{t("signup.owner")}</span><input className="input" name="full_name" required maxLength={100} autoComplete="name" /></label>
          <label className="field"><span>{t("common.username")}</span><input className="input" name="username" required maxLength={50} autoCapitalize="none" spellCheck={false} autoComplete="username" /></label>
          <label className="field"><span>{t("common.password")}</span><input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" /><small>{t("signup.passwordHint")}</small></label>
          <label className="signup-agree">
            <input type="checkbox" name="agree" required />
            <span>{t("signup.agree")} <Link href="/terms">{t("legal.terms")}</Link> {t("signup.and")} <Link href="/privacy">{t("legal.privacy")}</Link></span>
          </label>
          <SubmitButton className="btn btn-accent btn-lg">{t("signup.submit")}</SubmitButton>
        </ActionForm>
        <p className="muted signup-alt">{t("signup.have")} <Link href="/login">{t("login.title")}</Link></p>
      </div>
    </main>
  );
}
