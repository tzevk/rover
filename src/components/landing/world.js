// Where one product goes, in metres. No drawing in here.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));

export const DESK = { x: 0, top: 0.79 };
export const RACK = { x: 3.2, z: -0.6 };
export const STREET = { x: 30 };
export const TILL = { x: -5 };

// The camera at each stop: 0 the opening, then one for each step. Each shot is a slow move, and the
// film cuts where the product changes place.
export const SHOTS = [
  { eye: [-0.3, 1.5, 3.5], aim: [-1.05, 0.86, 0] },     // the workshop, beside the headline
  { eye: [-0.1, 1.22, 0.95], aim: [-0.46, 1, 0] },      // production: the bracket under the drill
  { eye: [3.5, 1.55, 3.3], aim: [3.2, 1.05, -0.5] },    // stock: on the shelves
  { eye: [3.2, 1.28, 1], aim: [3.2, 1.05, -0.55] },     // order: held
  { eye: [2.5, 1.05, 3.2], aim: [3.7, 0.72, 0.8] },     // dispatch: on the hand truck
  { eye: [29.3, 1.45, 4.8], aim: [30, 1.12, -1] },      // delivery: at the customer's door
  { eye: [30.25, 1.28, 0.75], aim: [30.55, 0.34, -0.5] },   // invoice
  { eye: [30.42, 1.12, 0.46], aim: [30.55, 0.36, -0.5] },   // payment
  { eye: [-4.5, 1.32, 1.7], aim: [-5, 0.96, 0] },       // daily cash: the till
];

// Scroll positions where the film cuts rather than moves.
export const CUTS = [1.5, 3.5, 4.5, 7.5];
