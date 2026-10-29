// Translation for both server and client code. t("key", { name: "…" }) fills {name};
// passing { count } picks key_one / key_other. Missing Marathi falls back to English.
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import en from "./en";
import mr from "./mr";

export const LANGS = ["en", "mr"];
export const DEFAULT_LANG = "en";
const DICTS = { en, mr };

export const isLang = (v) => LANGS.includes(v);

export function translator(lang) {
  const dict = DICTS[lang] ?? en;
  return (key, vars) => {
    let k = key;
    if (vars?.count !== undefined) {
      const plural = `${key}_${vars.count === 1 ? "one" : "other"}`;
      if (plural in en) k = plural;
    }
    const s = dict[k] ?? en[k] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : s;
  };
}

// Everything a screen needs in one object: const { t, fmtDate } = i18n(lang).
export function i18n(lang) {
  const l = isLang(lang) ? lang : DEFAULT_LANG;
  return {
    lang: l,
    t: translator(l),
    fmtDate: (s) => fmtDate(s, l),
    fmtTime: (s) => fmtTime(s, l),
    fmtDateTime: (s) => fmtDateTime(s, l),
  };
}
