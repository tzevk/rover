"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "./I18n";

// What people see when a page can't load. Never shows the error itself: that's in the server log.
export default function ErrorCard({ reset }) {
  const { t } = useI18n();
  const router = useRouter();
  // refresh() re-runs the server work that failed; reset() alone would only re-render the error.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <div className="card card-pad status-card">
      <span className="empty-ico"><AlertTriangle size={24} /></span>
      <h1>{t("error.pageTitle")}</h1>
      <p className="muted">{t("error.pageText")}</p>
      <button className="btn btn-primary" onClick={retry}><RotateCw size={16} /> {t("common.tryAgain")}</button>
    </div>
  );
}
