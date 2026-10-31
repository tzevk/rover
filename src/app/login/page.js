import Link from "next/link";
import Logo from "@/components/Logo";
import PrefsToggle from "@/components/PrefsToggle";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import { SITE } from "@/lib/site";
import LoginForm from "./LoginForm";

export const generateMetadata = pageTitle("login.title");

export default async function LoginPage({ searchParams }) {
  const { t } = await getI18n();
  const { out } = await searchParams;
  // The last word of the name is set in gold, e.g. "R.K. *Enterprises*".
  const words = t("app.name").trim().split(/\s+/);
  const last = words.pop();

  return (
    <main className="auth">
      <PrefsToggle className="prefs-dark" />
      <div className="auth-scene" aria-hidden="true" />

      <section className="auth-hero">
        <Logo size={64} />
        <p className="auth-kicker">{t("login.kicker")}</p>
        <h1 className="auth-title">
          {words.length > 0 && <>{words.join(" ")} </>}
          <em>{last}</em>
        </h1>
        <p className="auth-tagline">{t("login.tagline")}</p>
        <ul className="auth-points">
          <li>{t("login.point1")}</li>
          <li>{t("login.point2")}</li>
          <li>{t("login.point3")}</li>
        </ul>
      </section>

      <section className="auth-panel">
        {out && <div className="alert alert-ok" role="status">{t("flash.signedOut")}</div>}
        <LoginForm />
        <p className="auth-foot">{t("login.foot")}</p>
        {SITE.signupOpen && <p className="auth-foot">{t("signup.new")} <Link href="/signup">{t("signup.title")}</Link></p>}
        <p className="auth-foot auth-legal">{t("app.copyright", { year: new Date().getFullYear() })}</p>
      </section>
    </main>
  );
}
