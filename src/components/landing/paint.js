import * as THREE from "three";

// Everything in the shop is painted here when the page opens, so nothing is downloaded. Steel, wall
// and wood are drawn once on the graphics card; signs and paperwork are drawn on canvases, because
// they carry the visitor's own name.
const QUAD_VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

export function renderOnce(gl, fragmentShader, uniforms, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: gl.capabilities.getMaxAnisotropy(),
  });
  const material = new THREE.ShaderMaterial({ vertexShader: QUAD_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.render(scene, new THREE.Camera());
  gl.setRenderTarget(previous);
  material.dispose();
  quad.geometry.dispose();
  return target.texture;
}

const NOISE = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uPass;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
  void write(vec3 color, float height, float rough, float metal) {
    gl_FragColor = uPass < 0.5 ? vec4(pow(color, vec3(2.2)), 1.0) : vec4(height, rough, metal, 1.0);
  }
`;

// Painted steel, one slat at a time. Sun-bleached mint, worn through to metal on the ribs.
export const SHUTTER = { width: 320, height: 300, slat: 7.2 };
const SHUTTER_FRAGMENT = /* glsl */ `
  ${NOISE}
  void main() {
    vec2 p = vUv * vec2(${SHUTTER.width.toFixed(1)}, ${SHUTTER.height.toFixed(1)});
    float s = p.y / ${SHUTTER.slat.toFixed(1)}, row = floor(s), f = fract(s);
    float rib = smoothstep(0.02, 0.15, f) * (1.0 - smoothstep(0.85, 0.98, f));
    float height = mix(0.05, 0.58 + 0.42 * sin(f * 3.14159), rib);

    float wash = fbm(p * vec2(0.01, 0.016)) * 0.7 + fbm(vec2(p.x * 0.24, row * 1.7)) * 0.3;
    vec3 paint = mix(vec3(0.56, 0.77, 0.69), vec3(0.73, 0.87, 0.79), wash);
    paint = mix(paint, vec3(0.86, 0.92, 0.84), smoothstep(90.0, 280.0, p.y) * 0.34);
    float strokes = noise(vec2(p.x * 0.05, p.y * 1.4 + row)) * 0.05;
    paint *= 0.97 + strokes;

    float scuff = smoothstep(0.7, 0.76, fbm(p * vec2(0.09, 0.3) + 7.0)) * (0.3 + 0.7 * sin(f * 3.14159));
    float low = 1.0 - smoothstep(0.0, 66.0, p.y);
    float grime = smoothstep(0.66, 0.9, fbm(vec2(p.x * 0.07, row * 2.3)) + (1.0 - rib) * 0.16 + low * 0.14);
    vec3 rust = mix(vec3(0.47, 0.25, 0.14), vec3(0.67, 0.39, 0.2), noise(p * 0.5));
    float run = smoothstep(0.72, 0.96, noise(vec2(p.x * 0.42, row * 0.9))) * (1.0 - f) * (0.25 + low * 0.6);

    vec3 color = mix(paint, vec3(0.62, 0.62, 0.59), scuff * 0.72);
    color = mix(color, rust, grime * 0.28 + run * 0.2);
    color *= 0.86 + 0.14 * rib;
    write(color, height, mix(0.52, 0.8, grime + scuff * 0.4), mix(0.0, 0.7, scuff));
  }
`;

// Peach limewash with a painted teal dado and a fine cream line, the way shop fronts are done.
const WALL_FRAGMENT = /* glsl */ `
  ${NOISE}
  void main() {
    vec2 p = vUv * vec2(1200.0, 560.0);
    float wash = fbm(p * vec2(0.007, 0.012)) * 0.62 + fbm(p * 0.05) * 0.26 + noise(p * 0.7) * 0.12;
    vec3 lime = mix(vec3(0.93, 0.74, 0.59), vec3(0.98, 0.83, 0.68), wash);
    float rain = smoothstep(0.54, 0.76, fbm(vec2(p.x * 0.03, p.y * 0.004 + 2.0))) * smoothstep(420.0, 120.0, p.y) * 0.16;
    lime = mix(lime, vec3(0.74, 0.62, 0.5), rain);
    float dado = 1.0 - smoothstep(45.5, 46.5, p.y);
    vec3 band = mix(vec3(0.17, 0.44, 0.44), vec3(0.26, 0.55, 0.53), fbm(p * vec2(0.012, 0.03)));
    vec3 color = mix(lime, band, dado);
    float line = 1.0 - smoothstep(0.7, 1.2, abs(p.y - 51.0));
    color = mix(color, vec3(0.97, 0.9, 0.72), line * 0.9);
    write(color, wash * 0.6 + noise(p * 0.8) * 0.1, 0.92, 0.0);
  }
`;

// Oiled teak under a sheet of glass, paler where the owner's hands rest, with old tea rings.
const WOOD_FRAGMENT = /* glsl */ `
  ${NOISE}
  float ring(vec2 p, vec2 c, float r) { float d = abs(length(p - c) - r); return (1.0 - smoothstep(0.5, 2.2, d)) * (0.5 + 0.5 * noise(p * 0.2)); }
  void main() {
    vec2 p = vUv * vec2(960.0, 560.0);
    float row = floor(p.y / 112.0);
    vec2 q = vec2(p.x + hash(vec2(row, 3.0)) * 500.0, p.y + row * 61.0);
    float warp = fbm(vec2(q.x * 0.0032, q.y * 0.02)) * 26.0;
    float grain = 0.5 + 0.5 * sin((q.y + warp) * 1.1 + fbm(q * vec2(0.008, 0.16)) * 8.0);
    float fine = noise(vec2(q.x * 0.05, q.y * 4.6));
    float pores = smoothstep(0.64, 0.82, noise(vec2(q.x * 0.2, q.y * 7.0)));
    float broad = fbm(vec2(q.x * 0.004, q.y * 0.012));
    vec3 teak = mix(vec3(0.7, 0.47, 0.28), vec3(0.87, 0.65, 0.42), broad * 0.62 + grain * 0.2 + fine * 0.18);
    teak = mix(teak, vec3(0.56, 0.36, 0.2), pores * 0.28);
    teak *= 0.93 + hash(vec2(row, 8.0)) * 0.1;
    float seam = smoothstep(54.4, 55.8, abs(fract(p.y / 112.0) - 0.5) * 112.0);
    float worn = smoothstep(120.0, 0.0, p.y) * 0.3;
    teak = mix(teak, vec3(0.95, 0.78, 0.56), worn);
    float rings = ring(p, vec2(330.0, 200.0), 21.0) + ring(p, vec2(352.0, 214.0), 21.0) * 0.6 + ring(p, vec2(640.0, 360.0), 21.0);
    teak = mix(teak, vec3(0.46, 0.28, 0.15), clamp(rings, 0.0, 1.0) * 0.3);
    vec3 color = mix(teak, vec3(0.34, 0.2, 0.11), clamp(seam, 0.0, 1.0) * 0.7);
    write(color, grain * 0.3 - pores * 0.2 - seam * 0.5 + 0.5, 0.42, 0.0);
  }
`;

const STONE_FRAGMENT = /* glsl */ `
  ${NOISE}
  void main() {
    vec2 p = vUv * vec2(1200.0, 300.0);
    float grit = fbm(p * 0.09) * 0.6 + noise(p * 1.1) * 0.4;
    vec3 color = mix(vec3(0.71, 0.66, 0.59), vec3(0.87, 0.82, 0.73), grit);
    float joint = smoothstep(59.0, 59.8, abs(fract(p.x / 120.0) - 0.5) * 120.0);
    color = mix(color, vec3(0.5, 0.45, 0.39), joint * 0.6);
    write(color, grit, 0.95, 0.0);
  }
`;

export function bakeSurface(gl, name, size) {
  const shader = { shutter: SHUTTER_FRAGMENT, wall: WALL_FRAGMENT, wood: WOOD_FRAGMENT, stone: STONE_FRAGMENT }[name];
  return { color: renderOnce(gl, shader, { uPass: { value: 0 } }, size, size), detail: renderOnce(gl, shader, { uPass: { value: 1 } }, size, size) };
}

// A shallow-focus blur, used for everything beyond the counter.
const BLUR_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uImage; uniform vec2 uStep;
  void main() {
    vec4 sum = vec4(0.0); float total = 0.0;
    for (float i = -8.0; i <= 8.0; i += 1.0) { float w = exp(-i * i / 26.0); sum += texture2D(uImage, vUv + uStep * i) * w; total += w; }
    gl_FragColor = sum / total;
  }
`;

export function blurred(gl, canvas, radius) {
  const source = new THREE.CanvasTexture(canvas);
  source.colorSpace = THREE.NoColorSpace;
  const w = canvas.width, h = canvas.height;
  const once = renderOnce(gl, BLUR_FRAGMENT, { uImage: { value: source }, uStep: { value: new THREE.Vector2(radius / w, 0) } }, w, h);
  const twice = renderOnce(gl, BLUR_FRAGMENT, { uImage: { value: once }, uStep: { value: new THREE.Vector2(0, radius / h) } }, w, h);
  source.dispose();
  return twice;
}

export function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas, gl) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  return texture;
}

// The fonts next/font has hashed, read off the page and loaded before anything is drawn with them.
export async function loadFonts(lang) {
  const css = getComputedStyle(document.querySelector(".lp"));
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const fonts = {
    sign: read("--f-sign", "Georgia, serif"), hand: read("--f-hand", "cursive"),
    text: lang === "mr" ? read("--f-marathi", "serif") : read("--f-text", "sans-serif"),
    serif: lang === "mr" ? read("--f-marathi", "serif") : read("--f-display", "serif"), mono: read("--f-mono", "monospace"),
  };
  const sample = lang === "mr" ? "दुकान" : "Shop";
  await Promise.all([fonts.sign, fonts.hand, fonts.text].map((f) => document.fonts.load(`400 40px ${f}`, sample).catch(() => null)));
  return fonts;
}

function wrap(ctx, text, maxLines) {
  const words = text.trim().split(/\s+/);
  if (maxLines < 2 || words.length < 2) return [text.trim()];
  const lines = [];
  const per = Math.ceil(words.length / maxLines);
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
  return lines;
}

// A sign painter's lettering on the shutter: oxide red with a cream keyline and a dark block shade.
// `width` is how much of the shutter the visitor can see, so a phone gets bigger, stacked letters.
export function paintSign(canvas, fonts, { name, tag, chalk, width, at = 200 }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, unit = W / SHUTTER.width;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const empty = !name;
  const text = empty ? chalk : name;
  const room = Math.min(SHUTTER.width * 0.9, width * 0.9) * unit;
  const lines = wrap(ctx, text, width < 230 ? 2 : 1);
  let size = (width < 230 ? Math.min(46, 78 / lines.length) : 62) * unit;
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.font = `400 ${size}px ${fonts.sign}`;
  size *= Math.min(1, room / widest());
  ctx.font = `400 ${size}px ${fonts.sign}`;
  const lead = size * 1.12;
  const middle = H * (1 - at / SHUTTER.height);
  const top = middle - ((lines.length - 1) * lead) / 2 + size * 0.34;
  const depth = Math.max(3, size * 0.05);

  lines.forEach((line, i) => {
    const x = W / 2, y = top + i * lead;
    if (empty) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 255, 250, 0.72)";
      ctx.lineWidth = Math.max(2, size * 0.022);
      ctx.strokeText(line, x, y);
      ctx.strokeStyle = "rgba(255, 255, 250, 0.26)";
      ctx.strokeText(line, x + 2, y + 1.5);
      return;
    }
    ctx.fillStyle = "#123f40";
    for (let d = depth; d > 0; d -= 1) ctx.fillText(line, x + d, y + d);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fbf1d7";
    ctx.lineWidth = Math.max(4, size * 0.05);
    ctx.strokeText(line, x, y);
    const fill = ctx.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.1);
    fill.addColorStop(0, "#d9472b");
    fill.addColorStop(1, "#a12b17");
    ctx.fillStyle = fill;
    ctx.fillText(line, x, y);
  });

  if (!empty && tag) {
    const y = top + (lines.length - 1) * lead + size * 0.62;
    ctx.font = `400 ${Math.min(size * 0.3, 15 * unit)}px ${fonts.sign}`;
    ctx.fillStyle = "#123f40";
    ctx.fillText(tag, W / 2, y);
    const half = ctx.measureText(tag).width / 2 + 14 * unit;
    ctx.strokeStyle = "#c9710a";
    ctx.lineWidth = Math.max(2, unit * 0.9);
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(W / 2 + side * half, y - 4 * unit);
      ctx.lineTo(W / 2 + side * (half + 24 * unit), y - 4 * unit);
      ctx.stroke();
    });
  }
  // Paint wears off in specks, not cleanly.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 900; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, y = (Math.sin(i * 78.233) * 12543.1234 % 1 + 1) % 1;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + ((i * 7) % 5) / 8})`;
    ctx.fillRect(x * W, y * H, 1 + (i % 7) * 0.7, 1 + (i % 3));
  }
  ctx.globalCompositeOperation = "source-over";
}

// What you see behind the shutter from the street: a warm room, slightly out of focus.
export function paintInterior(width, height) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, "#f7dfae");
  wall.addColorStop(1, "#e9b878");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  const colours = ["#e8940c", "#d9472b", "#3f8f8a", "#f5e6c2", "#7fb7a8", "#c9710a", "#f2c14e"];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = H * (0.12 + shelf * 0.17);
    ctx.fillStyle = "#8a5a2e";
    ctx.fillRect(W * 0.04, y + H * 0.13, W * 0.92, H * 0.012);
    for (let x = W * 0.05; x < W * 0.94;) {
      const w = W * (0.035 + ((x * 13) % 7) / 170), h = H * (0.08 + ((x * 7) % 5) / 100);
      ctx.fillStyle = colours[Math.floor(x * 3.1) % colours.length];
      ctx.fillRect(x, y + H * 0.13 - h, w, h);
      x += w + W * 0.006;
    }
  }
  ctx.fillStyle = "#b5763c";
  ctx.fillRect(W * 0.12, H * 0.72, W * 0.76, H * 0.28);
  ctx.fillStyle = "#d9985a";
  ctx.fillRect(W * 0.1, H * 0.7, W * 0.8, H * 0.035);
  ctx.fillStyle = "#fffdf2";
  ctx.fillRect(W * 0.34, H * 0.03, W * 0.32, H * 0.018);
  return canvas;
}

// From the counter, looking out. The street and the room are painted apart so the tempo can pull up
// between them, and the door is a clear hole in the room.
const SHELF_COLOURS = ["#e8940c", "#d9472b", "#3f8f8a", "#f5e6c2", "#7fb7a8", "#c9710a", "#f2c14e"];

export function paintRoom(width, height) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  ctx.fillStyle = "#dcb27c";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1dbb4";
  ctx.fillRect(0, 0, W, H * 0.06);
  [[0, 0.3], [0.7, 1]].forEach(([a, b]) => {
    for (let shelf = 0; shelf < 5; shelf++) {
      const y = H * (0.12 + shelf * 0.16);
      ctx.fillStyle = "#8c5f38";
      ctx.fillRect(W * a, y + H * 0.13, W * (b - a), H * 0.014);
      for (let x = W * a; x < W * b;) {
        const w = W * (0.02 + ((x * 13) % 7) / 260), h = H * (0.07 + ((x * 7) % 5) / 100);
        ctx.fillStyle = SHELF_COLOURS[Math.floor(x * 2.3) % SHELF_COLOURS.length];
        ctx.fillRect(x, y + H * 0.13 - h, w, h);
        x += w + W * 0.004;
      }
    }
  });
  ctx.fillStyle = "#7d5634";
  ctx.fillRect(W * 0.325, H * 0.1, W * 0.018, H);
  ctx.fillRect(W * 0.657, H * 0.1, W * 0.018, H);
  ctx.fillStyle = "#8fbcaa";
  ctx.fillRect(W * 0.325, H * 0.08, W * 0.35, H * 0.09);
  ctx.clearRect(W * 0.343, H * 0.17, W * 0.314, H);
  return canvas;
}

export function paintStreet(width, height) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
  sky.addColorStop(0, "#cfe7ee");
  sky.addColorStop(1, "#fff4dc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f3c6a6";
  ctx.fillRect(W * 0.2, H * 0.3, W * 0.24, H * 0.5);
  ctx.fillStyle = "#a9d4c6";
  ctx.fillRect(W * 0.44, H * 0.38, W * 0.17, H * 0.42);
  ctx.fillStyle = "#f6dfa0";
  ctx.fillRect(W * 0.61, H * 0.26, W * 0.2, H * 0.54);
  ctx.fillStyle = "#7a9a93";
  for (let i = 0; i < 8; i++) ctx.fillRect(W * (0.23 + i * 0.075), H * (0.4 + (i % 2) * 0.14), W * 0.034, H * 0.09);
  ctx.fillStyle = "#6e9e4e";
  [[0.3, 0.26, 0.09], [0.38, 0.22, 0.07], [0.72, 0.28, 0.1]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(W * x, H * y, W * r, W * r * 0.8, 0, 0, 7); ctx.fill(); });
  ctx.fillStyle = "#ece4d0";
  ctx.fillRect(0, H * 0.8, W, H * 0.2);
  return canvas;
}

export function paintTempo(width, height) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  ctx.fillStyle = "#f2c14e";
  ctx.beginPath();
  ctx.roundRect(W * 0.08, H * 0.32, W * 0.3, H * 0.52, W * 0.05);
  ctx.fill();
  ctx.fillStyle = "#3f8f8a";
  ctx.fillRect(W * 0.36, H * 0.22, W * 0.56, H * 0.6);
  ctx.fillStyle = "#cfe7ea";
  ctx.fillRect(W * 0.11, H * 0.38, W * 0.2, H * 0.2);
  ctx.fillStyle = "#2d2a26";
  [[0.2, 0.86], [0.7, 0.86]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(W * x, H * y, H * 0.11, 0, 7); ctx.fill(); });
  return canvas;
}

export function paintPerson(width, height, colour) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(W * 0.26, H * 0.2, W * 0.48, H * 0.46, W * 0.2);
  ctx.fill();
  ctx.fillStyle = "#4a4640";
  ctx.fillRect(W * 0.32, H * 0.62, W * 0.14, H * 0.36);
  ctx.fillRect(W * 0.54, H * 0.62, W * 0.14, H * 0.36);
  ctx.fillStyle = "#8a5a3c";
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.11, W * 0.16, 0, 7);
  ctx.fill();
  return canvas;
}

// A striped cloth awning, and its scalloped hem as a separate strip.
export function paintAwning(width, height) {
  const top = makeCanvas(width, height), edge = makeCanvas(width, 64);
  const stripes = 12, step = width / stripes;
  const a = top.getContext("2d"), b = edge.getContext("2d");
  for (let i = 0; i < stripes; i++) {
    const colour = i % 2 ? "#f6ead0" : "#2e8179";
    a.fillStyle = colour;
    a.fillRect(i * step, 0, step + 1, height);
    b.fillStyle = colour;
    b.beginPath();
    b.moveTo(i * step, 0);
    b.lineTo(i * step, 34);
    b.arc(i * step + step / 2, 34, step / 2, Math.PI, 0, true);
    b.lineTo((i + 1) * step, 0);
    b.closePath();
    b.fill();
  }
  const fade = a.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, "rgba(255, 244, 220, 0.34)");
  fade.addColorStop(1, "rgba(120, 90, 50, 0.1)");
  a.fillStyle = fade;
  a.fillRect(0, 0, width, height);
  return { top, edge };
}

// The shadow-casting arm that reaches over the cash box.
export function paintArm(width, height) {
  const canvas = makeCanvas(width, height), ctx = canvas.getContext("2d"), W = width, H = height;
  ctx.strokeStyle = ctx.fillStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineWidth = W * 0.2;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, 0);
  ctx.lineTo(W * 0.5, H * 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.68, W * 0.16, H * 0.09, 0, 0, 7);
  ctx.fill();
  ctx.lineWidth = W * 0.052;
  [[-0.14, 0.86], [-0.05, 0.92], [0.04, 0.92], [0.13, 0.86], [0.24, 0.72]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(W * (0.5 + x * 0.6), H * 0.7);
    ctx.lineTo(W * (0.5 + x), H * y);
    ctx.stroke();
  });
  return canvas;
}

// Paper with a little fibre in it. Slips, sheets and the day book all start here.
export function paper(ctx, width, height, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 1400; i++) {
    const x = (Math.sin(i * 91.17) * 7919.13 % 1 + 1) % 1, y = (Math.sin(i * 37.31) * 3571.77 % 1 + 1) % 1;
    ctx.fillStyle = i % 2 ? "rgba(90, 70, 40, 0.035)" : "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(x * width, y * height, 1 + (i % 11), 1);
  }
}

export const INK = "#1d2a55";
export const STAMP_INK = "#5b3aa6";

// A rubber stamp's impression: violet, slightly crooked, heavier on one side. It's made on its own
// sheet so the worn specks don't cut through the paper it lands on.
export function stampMark(ctx, x, y, word, fonts, turn = -0.09) {
  const sheet = makeCanvas(720, 300), c = sheet.getContext("2d");
  c.translate(360, 150);
  c.strokeStyle = c.fillStyle = STAMP_INK;
  c.font = `400 62px ${fonts.sign}`;
  c.textAlign = "center";
  const half = Math.min(340, Math.max(150, c.measureText(word).width / 2 + 38));
  c.lineWidth = 7;
  c.strokeRect(-half, -58, half * 2, 112);
  c.lineWidth = 2.5;
  c.strokeRect(-half + 10, -48, half * 2 - 20, 92);
  c.fillText(word, 0, 20);
  c.globalCompositeOperation = "destination-out";
  c.globalAlpha = 0.5;
  for (let i = 0; i < 300; i++) {
    const a = (Math.sin(i * 13.7) * 991.1 % 1 + 1) % 1, b = (Math.sin(i * 5.3) * 613.7 % 1 + 1) % 1;
    c.fillRect(-half + a * half * 2, -60 + b * 118, 1 + (i % 5), 1 + (i % 3));
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.globalAlpha = 0.88;
  ctx.drawImage(sheet, -360, -150);
  ctx.restore();
}
