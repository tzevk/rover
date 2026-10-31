"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BLADE, clamp, COUNT, PIN, rand, ramp, READ, REST, SHOTS, smooth, STEP, TALL } from "./world";

// A material fan deck on a desk in morning light. Nine blades, one for each step of an order, each
// cut from a different trade's material and ending in ruled register paper: every kind of business,
// one record. Scrolling turns the fan round its brass pin; running the cursor across it parts the
// blades. Moments are numbered by `s`, an index into SHOTS, so everything here is a function of s.
// All the materials are made here, once, on the graphics card, so nothing is downloaded.
const S = { first: 2, last: 10, page: 11 };
const RULE_GAP = 7.2;
const ATLAS = { cols: 2, rows: 5, pad: 0.02 };
const COAT = [0.1, 0.5, 0, 0.9, 0.22, 0.6, 0.15, 0, 0];

const time = { value: 0 };

// Slow window light, shared by the page and the blades: panes of sun with leaves moving outside.
const LIGHT_GLSL = /* glsl */ `
  float lightHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float lightNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(lightHash(i), lightHash(i + vec2(1, 0)), u.x), mix(lightHash(i + vec2(0, 1)), lightHash(i + vec2(1, 1)), u.x), u.y);
  }
  float windowLight(vec2 p, float t) {
    vec2 q = vec2(p.x * 0.82 + p.y * 0.57, p.y * 0.82 - p.x * 0.57);
    float bars = smoothstep(0.03, 0.2, abs(fract(q.x / 168.0) - 0.5)) * smoothstep(0.02, 0.14, abs(fract(q.y / 236.0) - 0.5));
    float leaves = lightNoise(q * 0.014 + vec2(t * 0.05, t * 0.03)) * 0.6 + lightNoise(q * 0.031 - vec2(t * 0.04, 0.0)) * 0.4;
    return mix(0.945, 1.04, bars * smoothstep(0.3, 0.62, leaves));
  }
`;

const SHEET_VERTEX = "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

const SHEET_FRAGMENT = /* glsl */ `
  uniform float uTime; uniform float uCalm; uniform sampler2D uGrain;
  varying vec3 vP;
  ${LIGHT_GLSL}
  void main() {
    float z = abs(fract(vP.y / ${RULE_GAP.toFixed(1)}) - 0.5) * ${RULE_GAP.toFixed(1)};
    float w = fwidth(vP.y) * 0.9 + 0.1;
    float ruled = (1.0 - smoothstep(w * 0.5, w, z)) * 0.13 * (1.0 - smoothstep(0.16, 0.34, fwidth(vP.y) / ${RULE_GAP.toFixed(1)}));
    float margin = (1.0 - smoothstep(0.2, 0.55, abs(vP.x + 318.0))) * 0.42;
    float fibre = texture2D(uGrain, vP.xy * 0.012).r;
    vec3 paper = vec3(0.973, 0.953, 0.91) * (0.978 + fibre * 0.044);
    vec3 color = mix(paper, vec3(0.42, 0.56, 0.68), ruled);
    color = mix(color, vec3(0.83, 0.42, 0.33), margin);
    color *= mix(windowLight(vP.xy, uTime), 1.0, uCalm);
    float d = length(vP.xy);
    gl_FragColor = vec4(mix(color, vec3(0.973, 0.953, 0.91), smoothstep(380.0, 900.0, d)), 1.0);
  }
`;

// The blades' faces, painted once into a sheet of cells, one per blade. The first pass writes
// colour; the second writes height, roughness and metal for the same pixels.
const PAINT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uText; uniform float uPass;
  varying vec2 vUv;
  const vec2 SIZE = vec2(${BLADE.length.toFixed(1)}, ${BLADE.width.toFixed(1)});

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  // Distance to the nearest and next-nearest cell, and which cell it is.
  vec3 cells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = hash2(i + g);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = hash(i + g); } else if (d < d2) { d2 = d; }
    }
    return vec3(d1, d2, id);
  }

  void paint(float stage, vec2 p, out vec3 color, out float height, out float rough, out float metal) {
    metal = 0.0;
    if (stage < 0.5) {            // brushed steel: engineering and repair workshops
      float brush = noise(vec2(p.x * 0.06, p.y * 11.0)) * 0.6 + noise(vec2(p.x * 0.2, p.y * 34.0)) * 0.4;
      float wear = fbm(p * 0.03);
      color = mix(vec3(0.66, 0.68, 0.71), vec3(0.83, 0.85, 0.87), brush);
      color *= 0.96 + wear * 0.08;
      height = brush * 0.24 + 0.3;
      rough = 0.28 + brush * 0.16 + smoothstep(0.5, 0.75, wear) * 0.1;
      metal = 1.0;
    } else if (stage < 1.5) {     // oak: joinery and furniture
      float warp = fbm(vec2(p.x * 0.006, p.y * 0.05)) * 9.0;
      float rings = 0.5 + 0.5 * sin((p.y + warp * 2.6 + sin(p.x * 0.012) * 3.0) * 0.62);
      rings = pow(rings, 2.2);
      float pores = smoothstep(0.64, 0.82, noise(vec2(p.x * 0.34, p.y * 9.0)));
      color = mix(vec3(0.8, 0.64, 0.45), vec3(0.65, 0.47, 0.3), rings * 0.55);
      color = mix(color, vec3(0.44, 0.28, 0.16), pores * 0.34);
      color *= 0.96 + noise(vec2(p.x * 0.02, p.y * 0.7)) * 0.1;
      height = 0.42 - rings * 0.08 - pores * 0.2;
      rough = 0.5;
    } else if (stage < 2.5) {     // woven denim: tailoring and garments
      vec2 u = p * 2.3;
      float diagonal = fract((u.x + u.y) * 0.5);
      float over = smoothstep(0.1, 0.42, diagonal) * smoothstep(0.92, 0.6, diagonal);
      float fuzz = fbm(p * 2.2);
      float fade = smoothstep(0.34, 0.72, fbm(p * vec2(0.03, 0.09)));
      color = mix(vec3(0.74, 0.77, 0.84), mix(vec3(0.13, 0.22, 0.42), vec3(0.27, 0.39, 0.58), fade), over);
      color *= 0.9 + fuzz * 0.2;
      height = over * 0.52 + fuzz * 0.14;
      rough = 0.96;
    } else if (stage < 3.5) {     // polished marble: building materials
      vec2 q = p * 0.024;
      q += vec2(fbm(q * 2.2 + 1.7), fbm(q * 2.2 + 8.3)) * 1.7;
      float vein = pow(abs(sin((q.x * 3.2 + q.y * 5.0 + fbm(q * 3.0) * 4.0) * 3.14)), 0.3);
      color = mix(vec3(0.7, 0.45, 0.37), vec3(0.97, 0.93, 0.87), vein);
      color = mix(color, vec3(0.9, 0.76, 0.66), smoothstep(0.4, 0.75, fbm(q * 1.4 + 4.0)) * 0.36);
      height = 0.5;
      rough = 0.12;
    } else if (stage < 4.5) {     // tan leather: shoes, bags and upholstery
      vec3 v = cells(p * 0.72 + (vec2(noise(p * 0.3), noise(p * 0.3 + 5.0)) - 0.5) * 0.9);
      float crease = smoothstep(0.0, 0.17, v.y - v.x);
      color = mix(vec3(0.33, 0.18, 0.1), mix(vec3(0.53, 0.29, 0.15), vec3(0.62, 0.37, 0.2), v.z), crease);
      color *= 0.92 + fbm(p * 0.05) * 0.18;
      height = crease * 0.34 + 0.2;
      rough = mix(0.72, 0.46, crease);
    } else if (stage < 5.5) {     // terrazzo: tiles and shop floors
      vec3 v = cells(p * 0.3 + (vec2(noise(p * 0.3), noise(p * 0.3 + 5.0)) - 0.5) * 0.7);
      vec3 fine = cells(p * 0.8 + 4.0);
      float edge = smoothstep(0.42, 0.36, v.x + (noise(p * 2.2) - 0.5) * 0.16) * step(0.3, fract(v.z * 7.3));
      float dust = smoothstep(0.24, 0.2, fine.x) * step(0.55, fine.z);
      vec3 chip = v.z < 0.3 ? vec3(0.34, 0.42, 0.42) : v.z < 0.55 ? vec3(0.84, 0.55, 0.36) : v.z < 0.8 ? vec3(0.8, 0.72, 0.58) : vec3(0.72, 0.42, 0.38);
      vec3 ground_ = vec3(0.96, 0.94, 0.89) * (0.975 + noise(p * 2.4) * 0.04);
      ground_ = mix(ground_, vec3(0.62, 0.58, 0.52), dust * 0.6);
      color = mix(ground_, chip * (0.94 + noise(p * 1.6) * 0.12), edge);
      height = 0.5 + noise(p * 1.1) * 0.03;
      rough = 0.24;
    } else if (stage < 6.5) {     // brushed copper: electrical and plumbing trades
      float brush = noise(vec2(p.x * 0.05, p.y * 9.0)) * 0.7 + noise(vec2(p.x * 0.16, p.y * 26.0)) * 0.3;
      float rim = 1.0 - smoothstep(0.0, 16.0, min(min(p.y, SIZE.y - p.y), min(p.x, SIZE.x - p.x)));
      color = mix(vec3(0.8, 0.45, 0.28), vec3(0.95, 0.63, 0.43), brush);
      color = mix(color, vec3(0.6, 0.31, 0.2), rim * 0.4 * fbm(p * 0.08));
      height = brush * 0.2 + 0.3;
      rough = 0.3 + brush * 0.14;
      metal = 1.0;
    } else if (stage < 7.5) {     // kraft board: traders, packing and dispatch
      float flute = 0.5 + 0.5 * sin(p.x * 1.6);
      float fibre = fbm(p * vec2(0.9, 2.6));
      color = mix(vec3(0.68, 0.51, 0.34), vec3(0.8, 0.64, 0.45), fibre);
      float fleck = smoothstep(0.7, 0.76, noise(p * vec2(1.6, 5.0)));
      color = mix(color, vec3(0.46, 0.32, 0.19), fleck * 0.5);
      height = flute * 0.42 + fibre * 0.16;
      rough = 0.96;
    } else {                      // the register: fibre, rules and a margin
      float fibre = fbm(p * vec2(1.1, 3.4)) * 0.5 + fbm(p * vec2(3.4, 1.1)) * 0.5;
      color = vec3(0.973, 0.953, 0.91) * (0.965 + fibre * 0.07);
      float r = abs(fract(p.y / ${RULE_GAP.toFixed(1)}) - 0.5) * ${RULE_GAP.toFixed(1)};
      color = mix(color, vec3(0.42, 0.56, 0.68), (1.0 - smoothstep(0.1, 0.2, r)) * 0.42);
      color = mix(color, vec3(0.83, 0.42, 0.33), (1.0 - smoothstep(0.14, 0.26, abs(p.x - 34.0))) * 0.55);
      height = fibre * 0.26 + 0.3;
      rough = 0.92;
    }
  }

  void main() {
    vec2 g = vUv * vec2(${ATLAS.cols.toFixed(1)}, ${ATLAS.rows.toFixed(1)});
    float stage = floor(g.y) * ${ATLAS.cols.toFixed(1)} + floor(g.x);
    vec2 cell = (fract(g) - ${ATLAS.pad}) / ${(1 - ATLAS.pad * 2).toFixed(2)};
    vec3 color; float height, rough, metal;
    paint(stage, cell * SIZE, color, height, rough, metal);

    // Lettering: gold leaf on the two dark blades, ink on the rest, where gold would be lost.
    float text = texture2D(uText, vUv).a;
    if (abs(stage - 2.0) < 0.5 || abs(stage - 4.0) < 0.5) {
      color = mix(color, vec3(0.93, 0.76, 0.4), text);
      height = mix(height, max(0.0, height - 0.34), text);
      rough = mix(rough, 0.26, text);
      metal = max(metal, text);
    } else {
      color = mix(color, vec3(0.13, 0.13, 0.17), text * 0.92);
      height = mix(height, max(0.0, height - 0.1), text);
      rough = mix(rough, 0.6, text);
      metal = mix(metal, 0.0, text);
    }
    gl_FragColor = uPass < 0.5 ? vec4(pow(color, vec3(2.2)), 1.0) : vec4(height, rough, metal, 1.0);
  }
`;

const GRAIN_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  float hash(vec2 p, float period) { p = mod(p, period); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p, float period) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i, period), hash(i + vec2(1, 0), period), u.x), mix(hash(i + vec2(0, 1), period), hash(i + vec2(1, 1), period), u.x), u.y);
  }
  float layers(vec2 p, float period) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p, period); p *= 2.0; period *= 2.0; a *= 0.5; } return s; }
  void main() {
    float fibre = layers(vUv * vec2(16.0, 64.0), 16.0) * 0.5 + layers(vUv * vec2(64.0, 16.0), 16.0) * 0.5;
    gl_FragColor = vec4(fibre, fibre, fibre, 1.0);
  }
`;

const QUAD_VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

function renderOnce(gl, fragmentShader, uniforms, width, height) {
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

// Each blade's number and name, laid out to match the painted sheet.
function letterSheet(names, width) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = width;
  const ctx = canvas.getContext("2d");
  const cellW = width / ATLAS.cols, cellH = width / ATLAS.rows, scale = cellW / BLADE.length;
  const family = (selector, fallback) => { const el = document.querySelector(selector); return el ? getComputedStyle(el).fontFamily : fallback; };
  const serif = family(".lp h1", "Georgia, serif"), mono = family(".lp .mono", "monospace");
  ctx.fillStyle = "#000";
  ctx.textAlign = "right";
  names.forEach((name, i) => {
    const col = i % ATLAS.cols, row = Math.floor(i / ATLAS.cols);
    const right = col * cellW + cellW * (1 - ATLAS.pad) - 9 * scale;
    const base = width - row * cellH - ATLAS.pad * cellH - 9 * (cellH / BLADE.width);
    let size = 15 * scale;
    ctx.font = `400 ${size}px ${serif}`;
    while (ctx.measureText(name).width > 124 * scale && size > 6 * scale) { size -= scale * 0.5; ctx.font = `400 ${size}px ${serif}`; }
    ctx.fillText(name, right, base);
    ctx.font = `400 ${5.6 * scale}px ${mono}`;
    ctx.fillText(String(i + 1).padStart(2, "0"), right, base - size * 1.3);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  return texture;
}

function bladeGeometry(index) {
  const { start, length, width, corner, hole, thickness } = BLADE;
  const x0 = start, x1 = start + length, y0 = -width / 2, y1 = width / 2, r = corner;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const pinHole = new THREE.Path();
  pinHole.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(pinHole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness - 1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 14 });
  g.rotateX(-Math.PI / 2);
  // Maps the face onto this blade's cell of the painted sheet. The cut edges take the nearest
  // pixels of the face, so each material reads as solid all the way through.
  const p = g.attributes.position, uv = g.attributes.uv;
  const col = index % ATLAS.cols, row = Math.floor(index / ATLAS.cols);
  for (let i = 0; i < p.count; i++) {
    const u = clamp((p.getX(i) - x0) / length), v = clamp((-p.getZ(i) - y0) / width);
    uv.setXY(i, (col + ATLAS.pad + u * (1 - ATLAS.pad * 2)) / ATLAS.cols, (row + ATLAS.pad + v * (1 - ATLAS.pad * 2)) / ATLAS.rows);
  }
  return g;
}

// Each blade's own material, sharing the painted sheets. The window light falls on them too.
function bladeMaterial(index) {
  const material = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 1, bumpScale: 2.4, clearcoat: COAT[index], clearcoatRoughness: 0.22, envMapIntensity: 0.95 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `varying vec3 vWorldSpot;\n${shader.vertexShader}`.replace("#include <project_vertex>", `#include <project_vertex>
      vWorldSpot = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `uniform float uTime; varying vec3 vWorldSpot; ${LIGHT_GLSL}\n${shader.fragmentShader}`.replace("#include <dithering_fragment>", `#include <dithering_fragment>
      gl_FragColor.rgb *= windowLight(vec2(vWorldSpot.x, -vWorldSpot.z), uTime);`);
  };
  material.customProgramCacheKey = () => "blade";
  return material;
}

const dialTurn = (reading, engaged) => REST + (READ - REST + (4 - reading) * STEP) * engaged;

// The nine blades. Turning, sliding out and parting under the cursor all happen here.
function Fan({ names, mobile, world }) {
  const gl = useThree((state) => state.gl);
  const dial = useRef(), stack = useRef(), rivet = useRef();
  const pivots = useRef([]), blades = useRef([]);
  const geometries = useMemo(() => Array.from({ length: COUNT }, (_, i) => bladeGeometry(i)), []);
  const materials = useMemo(() => Array.from({ length: COUNT }, (_, i) => bladeMaterial(i)), []);
  const part = useRef(new Float32Array(COUNT));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts?.ready;
      if (cancelled) return;
      const size = Math.min(mobile ? 2048 : 3072, gl.capabilities.maxTextureSize);
      const uText = { value: letterSheet(names, Math.min(size, 2048)) };
      const color = renderOnce(gl, PAINT_FRAGMENT, { uText, uPass: { value: 0 } }, size, size);
      const surface = renderOnce(gl, PAINT_FRAGMENT, { uText, uPass: { value: 1 } }, size, size);
      materials.forEach((m) => {
        m.map = color;
        m.roughnessMap = surface;
        m.metalnessMap = surface;
        m.bumpMap = surface;
        m.needsUpdate = true;
      });
      uText.value.dispose();
      world.current.ready = true;
    })();
    return () => { cancelled = true; };
  }, [gl, materials, mobile, names, world]);

  useFrame((_, delta) => {
    const w = world.current, s = w.s, dt = Math.min(delta, 0.05);
    const reading = clamp(s - S.first, 0, COUNT - 1);
    const engaged = ramp(s, 1, 2) * (1 - ramp(s, S.last + 0.05, S.last + 0.7));
    dial.current.rotation.y = dialTurn(reading, engaged) - (1 - w.open) * 0.24;
    stack.current.scale.y = Math.max(0.01, w.lift);
    rivet.current.scale.setScalar(Math.max(0.01, smooth(clamp(w.lift * 1.4))));

    for (let i = 0; i < COUNT; i++) {
      const hovered = i === w.hover ? 1 : 0;
      const gap = w.hover < 0 ? 0 : Math.sign(i - w.hover) * Math.exp(-Math.abs(i - w.hover) * 0.9);
      const reach = (gap * 0.075 + hovered * 0.012) * (1 - engaged * 0.7);
      part.current[i] += (reach - part.current[i]) * (1 - Math.exp(-dt * 9));
      const out = engaged * (1 - ramp(Math.abs(reading - i), 0.12, 0.72));
      const pivot = pivots.current[i], blade = blades.current[i];
      pivot.rotation.y = (i - 4) * STEP * w.open + part.current[i];
      pivot.position.y = i * (BLADE.thickness + BLADE.gap) + out * 40 + hovered * 2.4 * (1 - engaged);
      blade.position.x = out * 24;
      blade.rotation.x = out * 0.34;
      blade.rotation.z = out * 0.05;
    }
  });

  return (
    <group position={[PIN.x, 0.4, PIN.z]}>
      <group ref={dial}>
        <group ref={stack}>
          {geometries.map((g, i) => (
            <group key={i} ref={(el) => { pivots.current[i] = el; }}>
              <mesh ref={(el) => { blades.current[i] = el; }} geometry={g} material={materials[i]} castShadow receiveShadow />
            </group>
          ))}
        </group>
      </group>
      <group ref={rivet}>
        <mesh position={[0, 16, 0]} castShadow>
          <cylinderGeometry args={[BLADE.hole - 0.3, BLADE.hole - 0.3, 34, 32]} />
          <meshPhysicalMaterial color="#c9973f" metalness={1} roughness={0.28} clearcoat={0.6} />
        </mesh>
        <mesh position={[0, 34, 0]} castShadow>
          <cylinderGeometry args={[7, 7.6, 2.2, 40]} />
          <meshPhysicalMaterial color="#d3a24a" metalness={1} roughness={0.22} clearcoat={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// Bright dust hanging in the window light.
function Motes({ count, world }) {
  const points = useRef(), material = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) p.set([(rand(i, 1) - 0.5) * 420, rand(i, 2) * 170 + 6, (rand(i, 3) - 0.5) * 360], i * 3);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  const speck = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, "rgba(255,246,226,1)");
    g.addColorStop(1, "rgba(255,246,226,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }, []);
  useFrame(({ clock }) => {
    points.current.rotation.y = clock.elapsedTime * 0.008;
    points.current.position.y = Math.sin(clock.elapsedTime * 0.13) * 5;
    material.current.opacity = 0.55 * Math.min(1, world.current.open);
  });
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial ref={material} map={speck} size={2.4} transparent depthWrite={false} sizeAttenuation />
    </points>
  );
}

const easeOutBack = (t) => { const c = 1.15; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// Holds the frame rate on slower machines by trading a little sharpness, once and quietly.
function useSteadyFrames(maxDpr) {
  const setDpr = useThree((state) => state.setDpr);
  const span = useRef({ time: 0, frames: 0, dpr: maxDpr, quick: 0 });
  return (delta) => {
    const w = span.current;
    w.time += delta;
    w.frames++;
    if (w.time < 1) return;
    const ms = (w.time / w.frames) * 1000;
    w.time = w.frames = 0;
    if (ms > 24 && w.dpr > 0.8) {
      w.dpr = Math.max(0.8, w.dpr - 0.2);
      w.quick = 0;
      setDpr(w.dpr);
    } else if (ms < 12 && w.dpr < maxDpr && ++w.quick > 4) {
      w.dpr = Math.min(maxDpr, w.dpr + 0.1);
      w.quick = 0;
      setDpr(w.dpr);
    }
  };
}

// The camera, the opening, the hover and the record leader all move together here.
function Director({ story, world, leader, cursor, tag, maxDpr }) {
  const { camera, size, scene, gl } = useThree();
  const steady = useSteadyFrames(maxDpr);
  const eye = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.eye)), false, "centripetal"), []);
  const aim = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.aim)), false, "centripetal"), []);
  const look = useMemo(() => new THREE.Vector3(), []), mark = useMemo(() => new THREE.Vector3(), []), next = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []), desk = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -16), []);
  const hit = useMemo(() => new THREE.Vector3(), []), held = useMemo(() => new THREE.Vector2(), []);
  const lean = useRef({ x: 0, y: 0 }), started = useRef(null), shift = useRef(0);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.04).texture;
    scene.environment = map;
    scene.environmentIntensity = 0.62;
    pmrem.dispose();
    return () => { scene.environment = null; map.dispose(); };
  }, [gl, scene]);

  useFrame(({ clock }, delta) => {
    const w = world.current, dt = Math.min(delta, 0.05);
    time.value = clock.elapsedTime;
    steady(delta);

    // A critically damped spring: it eases in as well as out, so scrolling never jerks the camera.
    const stiffness = 30;
    w.v += ((story.current - w.s) * stiffness - w.v * 2 * Math.sqrt(stiffness)) * dt;
    w.s += w.v * dt;
    const s = w.s;

    if (w.ready) started.current ??= clock.elapsedTime;
    const rise = started.current === null ? 0 : clamp((clock.elapsedTime - started.current - 0.15) / 2.7);
    const close = ramp(s, S.last + 0.15, S.page - 0.28);
    const flatten = ramp(s, S.page - 0.34, S.page - 0.06);
    w.lift = smooth(clamp(rise * 2)) * (1 - flatten);
    w.open = (rise <= 0 ? 0 : easeOutBack(smooth(clamp(rise * 1.2 - 0.2)))) * (1 - close);
    w.gone = flatten;

    const n = SHOTS.length - 1, u = clamp(s / n);
    eye.getPoint(u, camera.position);
    aim.getPoint(u, look);
    const portrait = size.height > size.width ? 1 + (size.height / size.width - 1) * 0.72 : 1;
    const opening = portrait > 1 ? 1 - ramp(s, 0.4, 2) : 0;
    if (opening > 0) {
      camera.position.lerp(next.set(...TALL.eye), opening);
      look.lerp(next.set(...TALL.aim), opening);
    }
    // Short phones have less room above the headline, so the fan stands further off.
    const room = clamp((size.height - 540) / 300, 0.5, 1);
    if (portrait > 1) camera.position.sub(look).multiplyScalar(portrait * (1 + (1 / room - 1) * opening)).add(look);
    // The opening: straight down onto the blank page, then back as the fan opens.
    const blank = 1 - smooth(rise);
    if (blank > 0) {
      next.set(0, 430, 1);
      camera.position.lerp(next, blank);
      look.lerp(next.set(0, 0, 0), blank);
    }
    const c = cursor.current, ease = 1 - Math.exp(-dt * 3), drift = 1 - close;
    lean.current.x += (c.x - lean.current.x) * ease;
    lean.current.y += (c.y - lean.current.y) * ease;
    camera.position.x += lean.current.x * 7 * drift;
    camera.position.y += lean.current.y * 4 * drift;
    camera.lookAt(look);
    camera.updateMatrixWorld();
    if (portrait > 1) {
      const offset = size.height * (0.16 * ramp(s, 1, 2) * (1 - close) + (0.18 * room - 0.5 + TALL.copy / size.height) * opening * smooth(rise));
      if (Math.abs(offset - shift.current) > 0.5) {
        shift.current = offset;
        camera.setViewOffset(size.width, size.height, 0, offset, size.width, size.height);
      }
    }

    // Which blade is under the cursor. Until someone moves one, the fan riffles by itself.
    let over = -1, pointing = false;
    const reading = clamp(s - S.first, 0, COUNT - 1);
    const engaged = ramp(s, 1, 2) * (1 - ramp(s, S.last + 0.05, S.last + 0.7));
    if (c.on && rise >= 1 && close < 0.2) {
      held.set(c.x, c.y);
      ray.setFromCamera(held, camera);
      if (ray.ray.intersectPlane(desk, hit)) {
        const dx = hit.x - PIN.x, dz = hit.z - PIN.z, r = Math.hypot(dx, dz);
        const at = (Math.atan2(-dz, dx) - dialTurn(reading, engaged)) / STEP + 4;
        const index = Math.round(at);
        if (r > 16 && r < BLADE.length && index >= 0 && index < COUNT && Math.abs(at - index) < 0.75) { over = index; pointing = true; }
      }
    } else if (!c.seen && rise >= 1 && s < 1.1) {
      over = Math.round(4 + Math.sin(clock.elapsedTime * 0.55) * 4);
    }
    w.hover = over;
    c.blade = pointing ? over : -1;
    if (tag.current) {
      if (pointing) {
        mark.copy(hit).project(camera);
        tag.current.show(over, ((mark.x + 1) / 2) * size.width, ((1 - mark.y) / 2) * size.height);
      } else {
        tag.current.show(-1, 0, 0);
      }
    }

    // Point the record card at the blade it belongs to.
    const shot = SHOTS[Math.round(clamp(s, 0, n))];
    const near = 1 - clamp(Math.abs(s - Math.round(s)) * 2.6);
    if (shot.mark && near > 0.02 && close < 0.3) {
      mark.set(PIN.x + Math.cos(READ) * 118, 46, PIN.z - Math.sin(READ) * 118).project(camera);
      leader.current?.move(((mark.x + 1) / 2) * size.width, ((1 - mark.y) / 2) * size.height, near);
    } else {
      leader.current?.move(0, 0, 0);
    }
  }, -1);
  return null;
}

function Sheet({ world }) {
  const gl = useThree((state) => state.gl);
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: SHEET_VERTEX, fragmentShader: SHEET_FRAGMENT, uniforms: { uTime: time, uCalm: { value: 0 }, uGrain: { value: null } } }), []);
  useEffect(() => { material.uniforms.uGrain.value = renderOnce(gl, GRAIN_FRAGMENT, {}, 512, 512); }, [gl, material]);
  useFrame(() => { material.uniforms.uCalm.value = world.current.gone; });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={-1}>
      <planeGeometry args={[2400, 2400]} />
    </mesh>
  );
}

// The fan's shadow on the page, fading away as it folds flat.
function Catcher({ world }) {
  const material = useRef();
  useFrame(() => { material.current.opacity = 0.26 * Math.min(1, world.current.lift * 1.4); });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} receiveShadow>
      <planeGeometry args={[1400, 1400]} />
      <shadowMaterial ref={material} color="#5a5474" />
    </mesh>
  );
}

function Visible({ world, children }) {
  const group = useRef();
  useFrame(() => { group.current.visible = world.current.gone < 0.98 && world.current.ready; });
  return <group ref={group}>{children}</group>;
}

export default function Scene({ story, active, mobile, leader, cursor, tag, names }) {
  const maxDpr = mobile ? 1.35 : 1.6;
  const world = useRef({ s: 0, v: 0, lift: 0, open: 0, gone: 0, hover: -1, ready: false });
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={maxDpr}
      flat
      shadows="soft"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: mobile ? 34 : 26, near: 10, far: 2600, position: [0, 430, 1] }}
    >
      <ambientLight intensity={0.5} color="#fff6e8" />
      <directionalLight
        color="#fff0d8" position={[-260, 330, 170]} intensity={2.9} castShadow
        shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-300} shadow-camera-right={300}
        shadow-camera-top={300} shadow-camera-bottom={-300} shadow-camera-near={50} shadow-camera-far={900}
        shadow-radius={7} shadow-bias={-0.0004} shadow-normalBias={0.5}
      />
      <Sheet world={world} />
      <Catcher world={world} />
      <Visible world={world}>
        <Fan names={names} mobile={mobile} world={world} />
      </Visible>
      <Motes count={mobile ? 40 : 110} world={world} />
      <Director story={story} world={world} leader={leader} cursor={cursor} tag={tag} maxDpr={maxDpr} />
    </Canvas>
  );
}
