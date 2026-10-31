"use client";

import { useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { useI18n } from "./I18n";
import { parseWeight, stableReader } from "@/lib/weight.mjs";

const TIMEOUT_MS = 8000;
const SPEED_KEY = "rk-scale-baud";
// The connection outlives each reading, so the operator only picks the port once.
const scale = { port: null };

async function readStableWeight() {
  const port = scale.port ?? (await navigator.serial.requestPort());
  if (!scale.port) {
    await port.open({ baudRate: Number(localStorage.getItem(SPEED_KEY)) || 9600 });
    scale.port = port;
  }
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  const stable = stableReader();
  const timer = setTimeout(() => reader.cancel().catch(() => {}), TIMEOUT_MS);
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/[\r\n\x02\x03]+/);
      buffer = lines.pop();
      for (const line of lines) {
        const kg = stable(parseWeight(line));
        if (kg) return kg;
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// Only appears in browsers that can talk to a serial port (Chrome and Edge on a computer).
export default function WeighButton({ onWeight }) {
  const { t } = useI18n();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setSupported("serial" in navigator), []);
  if (!supported) return null;

  async function read() {
    setBusy(true);
    setError("");
    try {
      const kg = await readStableWeight();
      if (kg) onWeight(kg);
      else setError(t("scale.noReading"));
    } catch (err) {
      if (err?.name !== "NotFoundError") { // NotFoundError: the operator closed the port picker
        scale.port = null;
        setError(t("scale.failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm scale-read" onClick={read} disabled={busy}>
        {busy ? <Loader2 size={14} className="spin" /> : <Scale size={14} />} {t(busy ? "scale.reading" : "scale.read")}
      </button>
      {error && <small className="due">{error}</small>}
    </>
  );
}

// How fast this computer's indicator talks. Saved per computer, because it's a property of the site.
export function ScaleSpeed() {
  const { t } = useI18n();
  const [speed, setSpeed] = useState("");
  useEffect(() => { if ("serial" in navigator) setSpeed(localStorage.getItem(SPEED_KEY) || "9600"); }, []);
  if (!speed) return null;
  return (
    <label className="field scale-speed">
      <span>{t("scale.speed")}</span>
      <select className="select" value={speed} onChange={(e) => {
        setSpeed(e.target.value);
        localStorage.setItem(SPEED_KEY, e.target.value);
        scale.port?.close().catch(() => {});
        scale.port = null;
      }}>
        {["1200", "2400", "4800", "9600", "19200"].map((s) => <option key={s}>{s}</option>)}
      </select>
    </label>
  );
}
