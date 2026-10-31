// The fan: its measurements, how it moves, and the camera's shots. No drawing in here.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));
export const rand = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

export const COUNT = 9;

// One blade, in the units of the scene. The pin sits at x = 0, near one end.
export const BLADE = { start: -17, length: 190, width: 50, thickness: 3.2, gap: 0.5, corner: 10, hole: 4.4 };

// Where the fan sits on the page, how far apart its blades open, and the heading a blade turns to
// when it's being read. Angles are in radians, measured round the pin.
export const PIN = { x: 20, z: 110 };
export const STEP = 0.205;
export const REST = 0.78;     // the middle blade's heading while the fan is at rest
export const READ = 0.48;     // the heading of the blade being read

// Moments in the story, in order. `s` values in the scene index into this list.
export const SHOTS = [
  { eye: [20, 620, 640], aim: [-140, 0, 130] },      // the fan on the desk, up and right of the headline
  { eye: [190, 520, 500], aim: [-104, 4, 104] },     // the problem
  { eye: [262, 184, 318], aim: [118, 44, 62], mark: true },
  { eye: [216, 168, 340], aim: [120, 42, 64], mark: true },
  { eye: [300, 158, 300], aim: [118, 42, 62], mark: true },
  { eye: [252, 196, 322], aim: [116, 44, 60], mark: true },
  { eye: [208, 174, 336], aim: [122, 42, 64], mark: true },
  { eye: [292, 176, 310], aim: [116, 42, 62], mark: true },
  { eye: [236, 158, 338], aim: [118, 42, 64], mark: true },
  { eye: [266, 188, 322], aim: [116, 44, 60], mark: true },
  { eye: [208, 322, 346], aim: [70, 24, 66], mark: true },   // the last step, as the fan starts to close
  { eye: [0, 430, 1], aim: [0, 0, 0] },              // the finished page
];

// On a phone the headline fills the bottom half, so the fan opens above it. `copy` is the height of
// the headline block in pixels.
export const TALL = { eye: [120, 470, 300], aim: [120, 0, 10], copy: 496 };
