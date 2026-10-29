"use client";

import { createContext, useContext, useMemo } from "react";
import { i18n } from "@/lib/i18n";

const LangContext = createContext("en");

// Set once in the root layout from the language cookie.
export function LangProvider({ lang, children }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useI18n() {
  const lang = useContext(LangContext);
  return useMemo(() => i18n(lang), [lang]);
}
