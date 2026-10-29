"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Moon, Sun } from "lucide-react";
import { useI18n } from "./I18n";
import { LANG_COOKIE, setPrefCookie, THEME_COOKIE } from "@/lib/ui-prefs";

// Language and light/dark switches. Both are cookies, so the server renders the right
// language and theme on the next request without a flash.
export default function PrefsToggle({ className = "" }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = lang === "mr" ? "en" : "mr";

  function switchLang() {
    setPrefCookie(LANG_COOKIE, next);
    startTransition(() => router.refresh());
  }

  // Both icons are rendered; CSS shows the one for the theme you'd switch to.
  function switchTheme() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    setPrefCookie(THEME_COOKIE, theme);
  }

  return (
    <div className={`prefs ${className}`}>
      <button type="button" className="pref-btn" onClick={switchLang} disabled={pending}
        lang={next} aria-label={t("prefs.language")} title={t("prefs.language")}>
        <Languages size={15} />
        <span>{next === "mr" ? "मराठी" : "English"}</span>
      </button>
      <button type="button" className="pref-btn pref-icon" onClick={switchTheme}
        aria-label={t("prefs.theme")} title={t("prefs.theme")}>
        <Moon size={16} className="when-light" />
        <Sun size={16} className="when-dark" />
      </button>
    </div>
  );
}
