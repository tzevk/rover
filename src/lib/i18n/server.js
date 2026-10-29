import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "@/lib/ui-prefs";
import { DEFAULT_LANG, i18n, isLang } from "./index";

// The chosen language lives in a cookie so every server-rendered page and action can read it.
export const getLang = cache(async () => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
});

export const getI18n = cache(async () => i18n(await getLang()));

// export const generateMetadata = pageTitle("nav.home");
export const pageTitle = (key) => async () => ({ title: (await getI18n()).t(key) });
