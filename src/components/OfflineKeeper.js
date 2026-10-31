"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useI18n } from "./I18n";
import { OFFLINE_EVENT, queued, refreshSnapshot, syncQueue } from "@/lib/offline";

// Runs behind every signed-in page: keeps the offline copy current, sends anything waiting as soon
// as there's a connection, and says so plainly when there isn't one.
export default function OfflineKeeper() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);

  const count = useCallback(() => queued().then((q) => setWaiting(q.length)).catch(() => {}), []);

  const catchUp = useCallback(async () => {
    try {
      await syncQueue();
      await refreshSnapshot();
    } catch {
      // Still offline, or the server is busy. Everything stays queued for the next try.
    }
    count();
  }, [count]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => (reg.active ?? reg.installing ?? reg.waiting)?.postMessage("refresh-gate")).catch(() => {});
    }
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) catchUp();
    };
    update();
    count();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(OFFLINE_EVENT, count);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(OFFLINE_EVENT, count);
    };
  }, [catchUp, count]);

  if (online && !waiting) return null;
  return (
    <div className={`offline-bar${online ? " waiting" : ""}`} role="status">
      {online ? <RefreshCw size={15} /> : <CloudOff size={15} />}
      <span>{online ? t("gate.sending", { n: waiting }) : t("gate.offlineBar")}</span>
      {/* A plain link: without a connection the app's own navigation can't load a page. */}
      <a href="/gate">{t("gate.open")}</a>
    </div>
  );
}
