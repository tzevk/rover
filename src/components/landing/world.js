// The line one product travels, laid out along x. No drawing in here.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));

export const BELT = 46;                        // height of the conveyor's surface
export const PLACE = { press: 0, packer: 250, rack: 450, truck: 720, customer: 1180 };

// The camera at each stop: 0 the opening, then one for each step.
export const SHOTS = [
  { eye: [-250, 118, 300], aim: [-118, 44, 0] },       // the press, with the headline beside it
  { eye: [18, 92, 150], aim: [84, 42, 2] },            // production: the bracket itself
  { eye: [300, 128, 300], aim: [462, 84, -36] },       // stock: on the rack
  { eye: [392, 128, 158], aim: [470, 112, -44] },      // order: held
  { eye: [530, 120, 290], aim: [664, 52, 0] },         // dispatch: on to the truck
  { eye: [1020, 112, 320], aim: [1168, 46, -60] },     // delivery: at the customer's door
  { eye: [1088, 104, 104], aim: [1158, 34, -62] },     // invoice
  { eye: [1100, 118, 88], aim: [1158, 32, -62] },      // payment
  { eye: [430, 700, 780], aim: [560, 0, -20] },        // daily cash: the whole line
];
