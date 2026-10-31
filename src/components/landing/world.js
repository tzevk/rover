// Where one product goes, in metres. No drawing in here.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));

export const DESK = { x: 0, top: 0.79 };
export const RACK = { x: 3.2, z: -0.6 };
export const STREET = { x: 30 };
export const TILL = { x: -5 };

// The camera at each stop: 0 the desk, then one for each step, ending back at the desk.
export const SHOTS = [
  { eye: [-4.62, 1.24, 1.62], aim: [-5.2, 1.0, 0.12] },     // the tablet on the desk
  { eye: [-0.14, 1.36, 1.02], aim: [-0.22, 1.0, 0.1], peek: [-0.72, 1.02, 0.02] },     // production: the bracket under the drill
  { eye: [3.5, 1.55, 3.3], aim: [3.2, 1.05, -0.5] },        // stock: on the shelves
  { eye: [3.42, 1.32, 1.5], aim: [3.46, 1.08, -0.4] },     // order: held
  { eye: [2.5, 1.05, 3.5], aim: [3.5, 0.82, 0.9] },         // dispatch: on the hand truck
  { eye: [29.8, 1.7, 7.6], aim: [30.9, 1.62, -1] },         // delivery: at the customer's door
  { eye: [31.25, 1.25, 1.05], aim: [31.08, 0.36, -0.31] },  // invoice
  { eye: [31.32, 1.24, 1.3], aim: [31.32, 0.62, -0.3] },      // payment
  { eye: [-4.42, 1.4, 2.3], aim: [-4.68, 1.02, 0.05] },     // daily cash: back at the desk
];

// The one tablet, and where it waits. `from` is the stop it's seen at; the camera flies into it and
// comes out at the next stop. It's the same screen every time: that's the point.
const DESK_Y = DESK.top + 0.19;
export const HOME = [TILL.x + 0.08, DESK_Y, 0.2];
export const PORTALS = [
  { from: 0, at: HOME, stand: DESK.top },
  { from: 1, at: [DESK.x + 0.02, DESK_Y, 0.3], stand: DESK.top },
  { from: 3, at: [RACK.x + 0.52, 1.14, 0.3], stand: 0 },
  { from: 4, at: [3.02, 1.12, 1.5], stand: 0 },
  { from: 7, at: [31.62, 0.92, -0.2], stand: 0 },
];
export const OUTSIDE = (s) => s > 4.5 && s < 7.5;

export const SCREEN = { width: 0.42, height: 0.29 };
