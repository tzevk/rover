"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { login } from "@/app/actions/auth";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
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
      setUserError("Enter your username to continue.");
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
          <h2>Welcome back</h2>
          <p className="auth-sub">Sign in to manage today&apos;s orders and dispatch.</p>

          <label className="auth-label" htmlFor="username">Username</label>
          <div className={`auth-input${userError ? " has-error" : ""}`}>
            <User size={18} />
            <input
              ref={userRef}
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. ramesh"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <p className="auth-error" role="alert">{userError}</p>

          <button type="submit" className="auth-btn">
            Continue <ArrowRight size={18} />
          </button>
        </div>

        <div className="auth-step" inert={step !== "pass"}>
          <button type="button" className="auth-back" onClick={() => setStep("user")}>
            <ArrowLeft size={16} /> Back
          </button>

          <div className="auth-who">
            <span className="auth-avatar">{initial}</span>
            <div>
              <span className="auth-who-label">Signing in as</span>
              <strong>{username.trim() || "—"}</strong>
            </div>
          </div>

          <label className="auth-label" htmlFor="password">Password</label>
          <div className={`auth-input${state?.error ? " has-error" : ""}`}>
            <Lock size={18} />
            <input
              ref={passRef}
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="auth-error" role="alert">{state?.error}</p>

          <button type="submit" className="auth-btn" disabled={pending}>
            {pending ? <><Loader2 size={18} className="spin" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
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
