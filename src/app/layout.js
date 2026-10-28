import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { APP_NAME } from "@/lib/format";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });

export const metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Orders, deliveries, ledgers, expenses and attendance for the quarry.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17321f" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1611" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
