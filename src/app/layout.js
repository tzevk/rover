import { cookies, headers } from "next/headers";
import { Noto_Sans_Devanagari, Noto_Serif_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import { LangProvider } from "@/components/I18n";
import { getI18n } from "@/lib/i18n/server";
import { SITE } from "@/lib/site";
import { THEME_COOKIE } from "@/lib/ui-prefs";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body" });
// Devanagari fallbacks for Marathi; only downloaded when Devanagari text is on screen.
const bodyDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-body-deva", preload: false });
const displayDeva = Noto_Serif_Devanagari({ subsets: ["devanagari"], variable: "--font-display-deva", preload: false });

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
    description: t("meta.description"),
    applicationName: t("app.name"),
    robots: { index: false, follow: false }, // the private app; the public pages opt in
  };
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1611" },
  ],
  viewportFit: "cover",
};

// With no saved choice, follow the device before first paint.
const THEME_SCRIPT = `(function(){var r=document.documentElement;if(!r.dataset.theme)r.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`;

export default async function RootLayout({ children }) {
  const { lang } = await getI18n();
  const pageLang = (await headers()).get("x-page-lang"); // public pages set this from their URL
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "dark" || saved === "light" ? saved : undefined;
  return (
    <html lang={pageLang ?? lang} data-theme={theme} suppressHydrationWarning
      className={`${body.variable} ${bodyDeva.variable} ${displayDeva.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
