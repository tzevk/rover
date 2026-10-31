// The ground the story happens on, with no drawing in it: shapes, routes and baked light, so the
// scene needs no model or texture downloads. Everything sits on a ruled page at y = 0.
import * as THREE from "three";

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ramp = (v, a, b) => smooth(clamp((v - a) / (b - a)));
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export const rand = hash;

function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = smooth(f), v = smooth(g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
export const fbm = (x, y) => { let a = 0.5, s = 0; for (let i = 0; i < 4; i++) { s += a * noise(x, y); x = x * 2.03 + 11; y = y * 2.03 + 7; a *= 0.5; } return s; };

const PIT = { x: -42, z: -14, rx: 62, rz: 48 };
const BENCHES = 7, DEPTH = 34, PAD = 5;
const SIZE = 180; // half the width of the carved area; beyond it is plain page

// The haul road, spiralling up the far wall of the pit so it faces the camera.
export const HAUL = Array.from({ length: 26 }, (_, i) => {
  const u = i / 25, a = THREE.MathUtils.degToRad(165 + u * 178), r = 0.3 + u * 0.78;
  return [PIT.x + PIT.rx * r * Math.cos(a), PIT.z + PIT.rz * r * Math.sin(a), -DEPTH * (1 - u) * 0.98 + PAD * u];
});

// Plant to customer. Heights come from the ground.
export const ROAD = [[60, 34], [52, 42], [44, 52], [28, 56], [6, 58], [-14, 66], [-34, 84], [-52, 104], [-74, 120]];

function nearest(x, z, line) {
  let best = Infinity, at = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; at = i + t; }
  }
  return { d: best, at };
}

// How far a point has left the page: 1 in the quarry, 0 on clean paper, soft at the edge.
function reach(x, z) {
  const R = Math.hypot(x * 0.86 - 6, z * 1.02 - 14);
  return 1 - clamp((R - 112) / 46);
}

export function heightAt(x, z) {
  const px = (x - PIT.x) / PIT.rx, pz = (z - PIT.z) / PIT.rz;
  const radial = Math.hypot(px, pz);
  const land = PAD * smooth(reach(x, z)) + 9 * smooth(clamp(1 - Math.hypot(x + 96, z + 74) / 62)) * smooth(reach(x, z));
  let pit = 0;
  if (radial < 1.3) {
    const t = clamp(radial + (fbm(x * 0.02 + 4, z * 0.02) - 0.5) * 0.3);
    const f = t * BENCHES, k = Math.floor(f);
    const bench = k >= BENCHES ? 1 : (k + smooth(clamp((f - k) / 0.46))) / BENCHES;
    pit = (bench - 1) * DEPTH;
    pit += (fbm(x * 0.11, z * 0.11) - 0.5) * 1.1 * clamp(1 - t * 0.5);
  }
  let h = land + pit;
  if (radial < 1.3) {
    const { d, at } = nearest(x, z, HAUL), n = Math.min(HAUL.length - 2, Math.floor(at));
    const road = HAUL[n][2] + (HAUL[n + 1][2] - HAUL[n][2]) * (at - n);
    h += (road - h) * (1 - ramp(d, 3.4, 7));
  }
  const { d } = nearest(x, z, ROAD);
  return h + (land - h) * (1 - ramp(d, 4, 9));
}

export const groundAt = (x, z) => new THREE.Vector3(x, heightAt(x, z), z);

// Where everything stands.
export const PLACES = {
  face: [-82, -34], excavator: [-76, -30], hopper: [20, -40], screen: [62, -36],
  pileA: [84, -8], pileB: [96, 18], pileC: [62, 2], loader: [74, 26],
  weighbridge: [32, 56], gate: [-12, 64], customer: [-84, 126],
};

export const PILES = [
  { at: PLACES.pileA, r: 17, h: 13, color: "#d9c8a9" },
  { at: PLACES.pileB, r: 13, h: 10, color: "#c9b18d" },
  { at: PLACES.pileC, r: 11, h: 8, color: "#e4d7bf" },
];

// Things that throw a shadow on the ground: [x, z, half width, half depth, height].
const CASTERS = [
  [20, -40, 6, 6, 10], [34, -38, 5, 4, 6], [62, -36, 8, 6, 16], [33, 44, 5, 3, 4],
];

// Light is baked once, so a phone gets the same soft shadows as a desktop and no shadow pass.
const SUN = new THREE.Vector3(-0.62, 0.56, 0.55).normalize();

export function buildGround(cells) {
  const n = cells + 1, step = (SIZE * 2) / cells;
  const heights = new Float32Array(n * n), casters = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = heightAt(-SIZE + i * step, -SIZE + j * step);
  casters.set(heights);
  const stamp = (x, z, hx, hz, h, round) => {
    const i0 = Math.floor((x - hx + SIZE) / step), i1 = Math.ceil((x + hx + SIZE) / step);
    const j0 = Math.floor((z - hz + SIZE) / step), j1 = Math.ceil((z + hz + SIZE) / step);
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const px = -SIZE + i * step - x, pz = -SIZE + j * step - z;
      const top = round ? h * clamp(1 - Math.hypot(px / hx, pz / hz)) : h;
      if (top > 0) casters[j * n + i] = Math.max(casters[j * n + i], heights[j * n + i] + top);
    }
  };
  CASTERS.forEach(([x, z, hx, hz, h]) => stamp(x, z, hx, hz, h, false));
  PILES.forEach((p) => stamp(p.at[0], p.at[1], p.r, p.r, p.h, true));

  const at = (grid, i, j) => grid[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
  const positions = new Float32Array(n * n * 3), normals = new Float32Array(n * n * 3);
  const shade = new Float32Array(n * n * 2), info = new Float32Array(n * n * 2);
  const sx = -SUN.x / Math.hypot(SUN.x, SUN.z), sz = -SUN.z / Math.hypot(SUN.x, SUN.z);
  const climb = SUN.y / Math.hypot(SUN.x, SUN.z);
  const dirs = Array.from({ length: 8 }, (_, a) => [Math.cos((a * Math.PI) / 4), Math.sin((a * Math.PI) / 4)]);
  const v = new THREE.Vector3();

  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -SIZE + i * step, z = -SIZE + j * step, h = heights[k];
    positions.set([x, h, z], k * 3);
    v.set(at(heights, i - 1, j) - at(heights, i + 1, j), step * 2, at(heights, i, j - 1) - at(heights, i, j + 1)).normalize();
    normals.set([v.x, v.y, v.z], k * 3);

    // Walk towards the sun: anything rising above the line of sight shades this point, softly.
    let lit = 1;
    for (let d = 1.5; d < 60; d += d < 12 ? 1.5 : 3.5) {
      const over = at(casters, Math.round(i - (sx * d) / step), Math.round(j - (sz * d) / step)) - (h + 0.25 + d * climb);
      if (over > 0) lit = Math.min(lit, 1 - clamp(over / (0.5 + d * 0.16)));
      if (lit <= 0) break;
    }
    // How open the sky is here: deep corners go quietly darker.
    let open = 0;
    for (const [dx, dz] of dirs) for (const r of [4, 11]) {
      open += clamp((at(heights, Math.round(i + (dx * r) / step), Math.round(j + (dz * r) / step)) - h) / r, 0, 1.2);
    }
    shade.set([lit, 1 - clamp(open / 8)], k * 2);

    const road = Math.max(1 - ramp(nearest(x, z, ROAD).d, 2.6, 4.6), reach(x, z) > 0.2 && Math.hypot((x - PIT.x) / PIT.rx, (z - PIT.z) / PIT.rz) < 1.3 ? 1 - ramp(nearest(x, z, HAUL).d, 2.4, 4.4) : 0);
    info.set([road, reach(x, z)], k * 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("aShade", new THREE.BufferAttribute(shade, 2));
  geometry.setAttribute("aInfo", new THREE.BufferAttribute(info, 2));
  const index = new Uint32Array(cells * cells * 6);
  for (let j = 0, o = 0; j < cells; j++) for (let i = 0; i < cells; i++, o += 6) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    index.set([a, c, b, b, c, d], o);
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

// The one load, as a line through the whole operation.
export function threadCurve() {
  const up = (x, z, y) => new THREE.Vector3(x, heightAt(x, z) + y, z);
  const pts = [
    up(...PLACES.face, 0.9),
    ...HAUL.filter((_, i) => i % 2 === 0).map(([x, z]) => up(x, z, 0.9)),
    up(12, -42, 1.2), up(19, -40, 4), up(20, -40, 9.6), up(28, -40, 6.4), up(42, -38, 10.4), up(56, -36, 14.4), up(62, -36, 17.4),
    up(68, -32, 12.4), up(76, -21, 13.6), up(83, -10, 14.9), up(84, -6, 11.4), up(82, 6, 3.4), up(78, 18, 1.6), up(74, 26, 1.2),
    ...ROAD.slice(0, 6).map(([x, z]) => up(x, z, 0.9)),
    ...ROAD.slice(6).map(([x, z]) => up(x, z, 0.9)),
    up(-84, 126, 1), up(-84, 126, 17),
  ];
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

export function roadCurve() {
  return new THREE.CatmullRomCurve3([[74, 26], ...ROAD.slice(1), [-82, 120]].map(([x, z]) => groundAt(x, z)), false, "centripetal");
}

export const haulCurve = () => new THREE.CatmullRomCurve3(HAUL.map(([x, z]) => groundAt(x, z)), false, "centripetal");

// Scattered where the ground is proud of the page, clear of the pit, the yard and the road.
export function treeSpots(count) {
  const spots = [];
  for (let i = 0; spots.length < count && i < count * 14; i++) {
    const x = (rand(i, 3) - 0.5) * 300, z = (rand(i, 8) - 0.5) * 290;
    const r = reach(x, z);
    if (r < 0.22) continue;
    if (Math.hypot((x - PIT.x) / PIT.rx, (z - PIT.z) / PIT.rz) < 1.16) continue;
    if (x > 2 && x < 122 && z > -66 && z < 46) continue;
    if (x < 44 && z > 22) continue; // the road, the gate and the clear page the headline sits on
    if (nearest(x, z, ROAD).d < 9) continue;
    if (fbm(x * 0.03 + 40, z * 0.03) < 0.42) continue;
    spots.push({ x, z, y: heightAt(x, z), s: 1.5 + rand(i, 5) * 1.5, r: rand(i, 6) });
  }
  return spots;
}

// One entry per moment in the story, in order. `s` values in the scene index into this list.
// eye and aim are the camera; `mark` is the point the record card points at.
export const SHOTS = [
  { eye: [196, 158, 262], aim: [-20, -8, 70] },                                        // the whole site
  { eye: [226, 120, 96], aim: [-6, -6, 26] },                                           // the problem
  { eye: [-8, 92, 112], aim: [-78, -20, -14], mark: [-82, -16, -34] },                  // production
  { eye: [112, 44, 66], aim: [30, 2, -44], mark: [20, 18, -40] },                       // crushing
  { eye: [150, 46, 84], aim: [58, 0, 0], mark: [84, 19, -8] },                          // inventory
  { eye: [150, 72, 118], aim: [52, 4, 16], mark: [62, 14, 2] },                         // order
  { eye: [128, 30, 84], aim: [46, 4, 24], mark: [74, 12, 26] },                         // loading
  { eye: [64, 30, 114], aim: [8, 2, 50], mark: [32, 11, 56] },                          // weighbridge
  { eye: [30, 34, 132], aim: [-36, 2, 66], mark: [-12, 9, 64] },                        // dispatch
  { eye: [-8, 56, 200], aim: [-124, 6, 118], mark: [-84, 22, 126] },                    // payments
  { eye: [10, 210, 160], aim: [-6, 0, 30] },                         // reconciliation
  { eye: [-2, 372, 34], aim: [-2, 0, 30] },                                             // the finished page
];
