import Link from "next/link";
import { Home, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
      <EmptyState icon={SearchX} title={t("error.notFound")}>
        <p>{t("error.notFoundText")}</p>
        <Link href="/" className="btn btn-primary"><Home size={16} /> {t("error.goHome")}</Link>
      </EmptyState>
    </div>
  );
}
