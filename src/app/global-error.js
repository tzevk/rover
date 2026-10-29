"use client";

import { useEffect, useState } from "react";
import { i18n } from "@/lib/i18n";
import { LANG_COOKIE, THEME_COOKIE } from "@/lib/ui-prefs";

const COLORS = {
  light: { bg: "#f2eee5", ink: "#1a2920", muted: "#6d7266", btn: "#1d3f2c" },
  dark: { bg: "#0c1611", ink: "#ebe6d8", muted: "#8f978b", btn: "#3b7a55" },
};

const cookie = (name) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];

// Last-resort screen if even the main layout fails to render. It replaces the root layout,
// so it reads the language and theme cookies itself.
export default function GlobalError({ reset }) {
  const [prefs, setPrefs] = useState({ lang: "en", theme: "light" });
  useEffect(() => {
    const saved = cookie(THEME_COOKIE);
    const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setPrefs({ lang: cookie(LANG_COOKIE), theme: dark ? "dark" : "light" });
  }, []);
  const { lang, t } = i18n(prefs.lang);
  const c = COLORS[prefs.theme];

  return (
    <html lang={lang}>
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: c.bg, color: c.ink }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1>{t("error.globalTitle")}</h1>
          <p style={{ color: c.muted }}>{t("error.globalText")}</p>
          <button onClick={() => reset()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: c.btn, color: "#fff", cursor: "pointer" }}>
            {t("common.tryAgain")}
          </button>
        </div>
      </body>
    </html>
  );
}
