import { TZ } from "./format";

// The background follows the quarry's day: sunrise, daylight, sunset, then a starry night.
export const SKY_PHASES = ["dawn", "day", "dusk", "night"];

// [phase, starts at, ends at] in minutes after midnight (quarry time). Night wraps past midnight.
const SPANS = [
  ["dawn", 5 * 60, 9 * 60 + 30],
  ["day", 9 * 60 + 30, 16 * 60 + 30],
  ["dusk", 16 * 60 + 30, 19 * 60 + 30],
];
const NIGHT_START = 19 * 60 + 30;
const NIGHT_LENGTH = 24 * 60 - NIGHT_START + SPANS[0][1];

// { phase, progress } — progress runs 0 → 1 through the phase and moves the sun or moon across the sky.
export function skyAt(date = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ })
    .format(date).split(":").map(Number);
  const min = h * 60 + m;
  const span = SPANS.find(([, from, to]) => min >= from && min < to);
  const progress = span
    ? (min - span[1]) / (span[2] - span[1])
    : (min >= NIGHT_START ? min - NIGHT_START : min + 24 * 60 - NIGHT_START) / NIGHT_LENGTH;
  return { phase: span ? span[0] : "night", progress: Math.round(progress * 100) / 100 };
}
