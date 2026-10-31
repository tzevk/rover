import { TZ } from "./format";

// Translation key for "Good morning" / "Good afternoon" / "Good evening" in the business's time zone.
export function greetingKey(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(date));
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.evening";
}

// Marathi keeps international digits ("-u-nu-latn") to match every other number in the app.
export function longDate(date = new Date(), lang = "en") {
  const locale = lang === "mr" ? "mr-IN-u-nu-latn" : "en-IN";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(date);
}

export const firstName = (name = "") => name.trim().split(/\s+/)[0] || name;
