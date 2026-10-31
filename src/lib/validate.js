export const round2 = (n) => Math.round(n * 100) / 100;

// Parses a user-entered number, rounded to the 2 decimals the database stores.
// Anything absurd (negative zero, > 1 billion, not a number) comes back as NaN.
export function num(v) {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? round2(n) : NaN;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function text(v, max = 255) {
  return String(v ?? "").replace(CONTROL_CHARS, "").trim().slice(0, max);
}

// A real calendar date: 2026-02-31 fails even though it has the right shape.
export function isDate(s) {
  const v = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

// <input type="datetime-local"> → "YYYY-MM-DD HH:MM:00"
export function dateTimeLocal(v) {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? `${s.slice(0, 10)} ${s.slice(11, 16)}:00` : null;
}
