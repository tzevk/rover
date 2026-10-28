export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Rover Quarry";
export const TZ = "Asia/Kolkata";

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const inr = (n) => inrFmt.format(Number(n) || 0);
export const qty = (n) => qtyFmt.format(Number(n) || 0);

// "YYYY-MM-DD" for today in the quarry's time zone.
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// DB values arrive as strings ("2026-10-28" / "2026-10-28 14:05:00") thanks to dateStrings.
export function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function fmtTime(s) {
  if (!s || s.length < 16) return "";
  let [h, min] = s.slice(11, 16).split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

export const fmtDateTime = (s) => (s ? `${fmtDate(s)}, ${fmtTime(s)}` : "—");

export const EXPENSE_CATEGORIES = {
  fuel: "Fuel",
  maintenance: "Maintenance",
  transport: "Transport",
  food_tea: "Food / Tea",
  other: "Other",
};

export const ATTENDANCE = {
  present: { label: "Present", weight: 1 },
  half_day: { label: "Half-day", weight: 0.5 },
  absent: { label: "Absent", weight: 0 },
};
