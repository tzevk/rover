export const TZ = "Asia/Kolkata";

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const inr = (n) => inrFmt.format(Number(n) || 0);
export const qty = (n) => qtyFmt.format(Number(n) || 0);

// "YYYY-MM-DD" for today in the business's time zone.
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Spelled out (not Intl) so server and browser always agree. Marathi forms are CLDR's;
// म.पू. / म.उ. are the standard abbreviations of मध्यान्हपूर्व / मध्यान्होत्तर.
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  mr: ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"],
};
const AMPM = { en: ["am", "pm"], mr: ["म.पू.", "म.उ."] };

// DB values arrive as strings ("2026-10-28" / "2026-10-28 14:05:00") thanks to dateStrings.
export function fmtDate(s, lang = "en") {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${Number(d)} ${(MONTHS[lang] ?? MONTHS.en)[Number(m) - 1]} ${y}`;
}

export function fmtTime(s, lang = "en") {
  if (!s || s.length < 16) return "";
  let [h, min] = s.slice(11, 16).split(":").map(Number);
  const ampm = (AMPM[lang] ?? AMPM.en)[h >= 12 ? 1 : 0];
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

export const fmtDateTime = (s, lang = "en") => (s ? `${fmtDate(s, lang)}, ${fmtTime(s, lang)}` : "—");

export const UNITS = ["tonne", "brass", "cft", "cum"];

export const PAY_MODES = ["cash", "upi", "bank", "cheque"];

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
