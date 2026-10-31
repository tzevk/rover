"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { login } from "@/app/actions/auth";
import { useI18n } from "@/components/I18n";
import { safeAction } from "@/lib/safe-action";

export default function LoginForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(safeAction(login, t("common.networkError")), null);
  const [step, setStep] = useState("user");
  const [username, setUsername] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [userError, setUserError] = useState("");
  const userRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => {
    // Wait for the slide animation before moving focus.
    const t = setTimeout(() => (step === "user" ? userRef : passRef).current?.focus(), 260);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (state?.error) passRef.current?.focus();
  }, [state]);

  function next(e) {
    e?.preventDefault();
    if (!username.trim()) {
      setUserError(t("login.enterUsername"));
      return;
    }
    setUserError("");
    setStep("pass");
  }

  function onSubmit(e) {
    if (step === "user") next(e);
  }

  const initial = username.trim().charAt(0).toUpperCase() || "?";

  return (
    <form className="auth-card" action={formAction} onSubmit={onSubmit} noValidate>
      <div className="auth-steps" data-step={step}>
        <div className="auth-step" inert={step !== "user"}>
          <h2>{t("login.welcome")}</h2>
          <p className="auth-sub">{t("login.sub")}</p>

          <label className="auth-label" htmlFor="username">{t("common.username")}</label>
          <div className={`auth-input${userError ? " has-error" : ""}`}>
            <User size={18} />
            <input
              ref={userRef}
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("login.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <p className="auth-error" role="alert">{userError}</p>

          <button type="submit" className="auth-btn">
            {t("login.continue")} <ArrowRight size={18} />
          </button>
        </div>

        <div className="auth-step" inert={step !== "pass"}>
          <button type="button" className="auth-back" onClick={() => setStep("user")}>
            <ArrowLeft size={16} /> {t("login.back")}
          </button>

          <div className="auth-who">
            <span className="auth-avatar">{initial}</span>
            <div>
              <span className="auth-who-label">{t("login.signingInAs")}</span>
              <strong>{username.trim() || "-"}</strong>
            </div>
          </div>

          <label className="auth-label" htmlFor="password">{t("common.password")}</label>
          <div className={`auth-input${state?.error ? " has-error" : ""}`}>
            <Lock size={18} />
            <input
              ref={passRef}
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("login.passwordPlaceholder")}
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShowPw((v) => !v)}
              aria-label={t(showPw ? "login.hidePassword" : "login.showPassword")}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="auth-error" role="alert">{state?.error}</p>

          <button type="submit" className="auth-btn" disabled={pending}>
            {pending ? <><Loader2 size={18} className="spin" /> {t("login.signingIn")}</> : <>{t("login.title")} <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>

      <div className="auth-dots" aria-hidden="true">
        <span className={step === "user" ? "on" : ""} />
        <span className={step === "pass" ? "on" : ""} />
      </div>
    </form>
  );
}
