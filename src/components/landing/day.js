// One day in the shop: when things happen, where the sun is and what's in the cash box. No drawing
// in here. Everything on screen is worked out from `t`, minutes since 9:00 am, which is why the
// visitor can drag the sun back and watch the day undo itself.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));
export const rand = (x, y = 0) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// The sums the whole story rests on. The book is what the register says; the box is what's really there.
const opening = 13480, received = 5000, tea = 30, diesel = 3200;
export const MONEY = { opening, received, tea, diesel, book: opening + received - tea, box: opening + received - tea - diesel };

// `seconds` is how long the day takes to reach this moment from the one before.
export const BEATS = [
  { id: "staff", t: 5, gesture: "tick", view: "sheet", seconds: 3.4 },
  { id: "order", t: 40, gesture: "stamp", view: "order", seconds: 3 },
  { id: "made", t: 135, gesture: "sign", view: "made", seconds: 3.2 },
  { id: "delivery", t: 250, gesture: "tear", view: "challan", seconds: 3.4, quick: true },
  { id: "invoice", t: 251, gesture: "stamp", view: "invoice", seconds: 0.8, stay: true },
  { id: "payment", t: 390, gesture: "bundle", view: "box", seconds: 3.2 },
  { id: "tea", t: 430, gesture: "coins", view: "tray", seconds: 2.2 },
  { id: "count", t: 590, gesture: "hold", view: "count", seconds: 3.8 },
];
export const CLOSE = BEATS.at(-1).t;
export const FOUND = 252.2;   // where the rewind stops: the moment the diesel money left the box

// The diesel money leaves while the visitor is stamping the invoice.
export const TAKEN = [251.8, 252.5];

export function cashAt(t) {
  return opening + received * ramp(t, 389, 391) - tea * ramp(t, 429, 431) - diesel * ramp(t, TAKEN[0], TAKEN[1]);
}

// A slip slides in during the last part of the wait for its moment, and leaves early in the next.
export function enters(i) {
  const gap = BEATS[i].t - (i ? BEATS[i - 1].t : -30);
  return [BEATS[i].t - gap * 0.5, BEATS[i].t - gap * 0.03];
}
export function leaves(i) {
  const gap = (BEATS[i + 1]?.t ?? BEATS[i].t + 30) - BEATS[i].t;
  return [BEATS[i].t + gap * 0.02, BEATS[i].t + gap * 0.4];
}

// The sun, seen from the counter looking out through the door: low on the left in the morning, over
// the street at noon, low on the right and amber by closing.
const MORNING = [1, 0.84, 0.62], NOON = [1, 0.95, 0.86], EVENING = [1, 0.66, 0.36];
export function sunAt(t, out = {}) {
  const k = clamp(t / 600);
  const az = lerp(-0.62, 0.66, k), el = 0.36 + Math.sin(k * Math.PI) * 0.24;
  out.x = Math.sin(az) * Math.cos(el);
  out.y = Math.sin(el);
  out.z = -Math.cos(az) * Math.cos(el);
  const a = k < 0.5 ? MORNING : NOON, b = k < 0.5 ? NOON : EVENING, m = smooth(k < 0.5 ? k * 2 : k * 2 - 1);
  out.r = lerp(a[0], b[0], m); out.g = lerp(a[1], b[1], m); out.b = lerp(a[2], b[2], m);
  out.power = lerp(2.5, 3, Math.sin(k * Math.PI));
  out.evening = ramp(k, 0.55, 1);
  return out;
}

// Where things sit on the counter. x runs across it, z runs towards you, y is up.
export const DESK = {
  slip: [-14, 40],
  register: [196, 34],
  box: [-122, -104],
  phone: [-108, 34],
  pad: [146, -104],
  pile: [282, -96],
  tray: [8, -112],
  bundle: [8, -74],
  coins: [-52, -44],
};

// `home` is the owner looking up from the counter, out through the door at the street. Every other
// shot looks down at something from `reach` away: to the side of the caption on a wide screen, and
// above it on a phone. `up` and `tall` adjust the framing on a phone.
export const VIEWS = {
  home: { eye: [0, 116, 268], aim: [0, 84, -220] },
  sheet: { focus: DESK.slip, reach: 330 },
  order: { focus: [-46, 40], reach: 372, tall: [-34, 40] },
  made: { focus: DESK.slip, reach: 330 },
  challan: { focus: DESK.slip, reach: 330 },
  invoice: { focus: [-78, 6], reach: 450, tall: [-60, -16] },
  book: { focus: [196, 30], reach: 300, side: 0.1 },
  box: { focus: [-70, -70], reach: 370 },
  count: { focus: [-122, -92], reach: 330, side: -0.1 },
  tray: { focus: [-50, -76], reach: 370 },
  rewind: { focus: [-110, -40], reach: 520, side: 0.2, up: -0.08 },
  found: { focus: [-122, -104], reach: 310, side: 0.28, up: -0.17 },
};

const TILT = 0.92;   // how steeply the shots look down, in radians

export function viewPose(name, aspect, out) {
  const view = VIEWS[name] ?? VIEWS.home;
  const tall = aspect < 1 ? 1 + (1 / aspect - 1) * 0.42 : 1;
  if (view.eye) {
    out.aim[0] = view.aim[0]; out.aim[1] = view.aim[1]; out.aim[2] = view.aim[2];
    out.eye[0] = view.aim[0] + (view.eye[0] - view.aim[0]) * tall;
    out.eye[1] = view.aim[1] + (view.eye[1] - view.aim[1]) * tall;
    out.eye[2] = view.aim[2] + (view.eye[2] - view.aim[2]) * tall;
    return out;
  }
  const reach = view.reach * tall, focus = aspect < 1 && view.tall ? view.tall : view.focus;
  const x = focus[0] + (aspect >= 1 ? reach * (view.side ?? -0.15) : 0), z = focus[1] + (aspect < 1 ? reach * (view.up ?? 0.11) : 0);
  out.aim[0] = x; out.aim[1] = 0; out.aim[2] = z;
  out.eye[0] = x; out.eye[1] = Math.sin(TILT) * reach; out.eye[2] = z + Math.cos(TILT) * reach;
  return out;
}

// Six trades, each worked so the bill comes to the same ₹9,000 and every later sum still holds.
export const TRADE_DATA = {
  fabrication: { qty: 200, rate: 45, stock: 640, used: 60 },
  garage: { qty: 6, rate: 1500, stock: 19, used: 6 },
  bakery: { qty: 100, rate: 90, stock: 320, used: 25 },
  tailoring: { qty: 30, rate: 300, stock: 96, used: 60 },
  trading: { qty: 60, rate: 150, stock: 190, used: 60 },
  printing: { qty: 3000, rate: 3, stock: 9600, used: 2 },
};
export const TAX = { amount: 9000, gst: 1620, total: 10620 };

const DEVANAGARI = "०१२३४५६७८९";
export const digits = (value, lang) => (lang === "mr" ? String(value).replace(/\d/g, (d) => DEVANAGARI[d]) : String(value));
export const number = (n, lang) => digits(Math.round(n).toLocaleString("en-IN"), lang);
export const rupees = (n, lang) => `₹${number(n, lang)}`;

export function clockLabel(t, lang) {
  const whole = Math.round(t) + 9 * 60, h = Math.floor(whole / 60) % 24, m = whole % 60;
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
  if (lang !== "mr") return `${time} ${h < 12 ? "am" : "pm"}`;
  return `${h < 12 ? "सकाळी" : h < 16 ? "दुपारी" : "संध्याकाळी"} ${digits(time, lang)}`;
}
