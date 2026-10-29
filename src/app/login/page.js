import Logo from "@/components/Logo";
import PrefsToggle from "@/components/PrefsToggle";
import { getI18n, pageTitle } from "@/lib/i18n/server";
import SkyScene from "@/components/SkyScene";
import { skyAt } from "@/lib/sky";
import LoginForm from "./LoginForm";

export const generateMetadata = pageTitle("login.title");

export default async function LoginPage() {
  const { t } = await getI18n();
  // The last word of the name is set in gold italic, e.g. "Neeta" → "*Neeta*".
  const words = t("app.name").trim().split(/\s+/);
  const last = words.pop();

  return (
    <main className="auth">
      <PrefsToggle className="prefs-dark" />
      <div className="auth-scene" aria-hidden="true">
        <SkyScene initial={skyAt()} variant="hero" />
        <div className="auth-rings" />
        <svg className="auth-strata" viewBox="0 0 1440 360" preserveAspectRatio="none">
          <path d="M0 150 L150 84 L300 132 L470 40 L640 120 L800 66 L980 130 L1150 72 L1300 118 L1440 86 V360 H0Z" fill="#1b3727" />
          <path d="M0 200 L180 146 L350 188 L540 112 L720 182 L900 134 L1080 180 L1260 126 L1440 168 V360 H0Z" fill="#224a35" />
          <path d="M0 246 L200 206 L400 236 L600 192 L820 240 L1020 206 L1220 236 L1440 210 V360 H0Z" fill="#5f3f23" />
          <path d="M0 284 L240 258 L480 280 L720 252 L960 278 L1200 256 L1440 272 V360 H0Z" fill="#7d5430" />
          <path d="M0 318 L260 302 L540 314 L820 298 L1100 312 L1440 300 V360 H0Z" fill="#a8743f" />
          <g stroke="#e0bb85" strokeOpacity=".2" strokeWidth="1" fill="none">
            <path d="M0 220 L200 182 L400 214 L600 170 L820 218 L1020 184 L1220 214 L1440 190" />
            <path d="M0 170 L180 116 L350 158 L540 84 L720 152 L900 106 L1080 150 L1260 98 L1440 140" />
            <path d="M0 264 L240 236 L480 258 L720 232 L960 256 L1200 236 L1440 250" />
          </g>
        </svg>
      </div>

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
        <LoginForm />
        <p className="auth-foot">{t("login.foot")}</p>
      </section>
    </main>
  );
}
