import { TZ } from "./format";

// "Good morning" / "Good afternoon" / "Good evening" in the quarry's time zone.
export function greeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(date));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function longDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(date);
}

export const firstName = (name = "") => name.trim().split(/\s+/)[0] || name;
