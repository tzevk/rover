import { cookies } from "next/headers";
import { Fraunces, Noto_Sans_Devanagari, Noto_Serif_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import { LangProvider } from "@/components/I18n";
import { APP_NAME } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { THEME_COOKIE } from "@/lib/ui-prefs";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });
// Devanagari fallbacks for Marathi; only downloaded when Devanagari text is on screen.
const bodyDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-body-deva", preload: false });
const displayDeva = Noto_Serif_Devanagari({ subsets: ["devanagari"], variable: "--font-display-deva", preload: false });

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("meta.description"),
  };
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17321f" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1611" },
  ],
  viewportFit: "cover",
};

// With no saved choice, follow the device before first paint.
const THEME_SCRIPT = `(function(){var r=document.documentElement;if(!r.dataset.theme)r.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`;

export default async function RootLayout({ children }) {
  const { lang } = await getI18n();
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "dark" || saved === "light" ? saved : undefined;
  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning
      className={`${body.variable} ${display.variable} ${bodyDeva.variable} ${displayDeva.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
