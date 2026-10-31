import Link from "next/link";
import { Home, SearchX } from "lucide-react";
import Logo from "@/components/Logo";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("error.notFound");

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="status-page">
      <div className="backdrop" aria-hidden="true" />
      <Logo size={44} />
      <div className="card card-pad status-card">
        <span className="empty-ico"><SearchX size={24} /></span>
        <h1>{t("error.notFound")}</h1>
        <p className="muted">{t("error.notFoundText")}</p>
        <Link href="/" className="btn btn-primary"><Home size={16} /> {t("error.goHome")}</Link>
      </div>
    </main>
  );
}
