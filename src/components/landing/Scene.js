"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { clamp, DESK, lerp, OUTSIDE, PORTALS, RACK, ramp, SCREEN, SHOTS, smooth, STREET, TILL } from "./world";

// One bracket's journey, filmed. The places are photographed panoramas and the objects are 3D scans
// (Poly Haven, CC0), lit by the same photographs, so they sit in the world the way real things do.
const FILES = "/shop";
const model = (name) => `${FILES}/${name}/${name}.gltf`;

const canvasOf = (w, h, draw) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
};
function painted(canvas, gl) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  return t;
}

const shippingLabel = () => canvasOf(720, 480, (x, w, h) => {
  x.fillStyle = "#f7f4ec";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#1c1b18";
  x.font = "700 52px Arial, sans-serif";
  x.fillText("MS BRACKET", 34, 76);
  x.font = "30px Arial, sans-serif";
  x.fillText("200 pieces   Order #1042", 34, 124);
  x.fillText("The Motor Shop", 34, 164);
  for (let px = 34; px < 590;) { const b = 2 + Math.floor(Math.random() * 9); x.fillRect(px, 200, b, 190); px += b + 2 + Math.floor(Math.random() * 8); }
  x.font = "26px monospace";
  x.fillText("RK 26-27 001042", 150, 438);
  x.fillStyle = "#c9770a";
  x.fillRect(600, 34, 88, 88);
  x.fillStyle = "#f7f4ec";
  x.font = "700 46px Arial, sans-serif";
  x.fillText("RK", 612, 96);
});

const heldSticker = () => canvasOf(360, 150, (x, w, h) => {
  x.fillStyle = "#e8940c";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#1c1b18";
  x.font = "700 64px Arial, sans-serif";
  x.textAlign = "center";
  x.fillText("HELD", w / 2, 78);
  x.font = "30px Arial, sans-serif";
  x.fillText("Order #1042", w / 2, 124);
});

const invoicePage = () => canvasOf(690, 980, (x, w) => {
  x.fillStyle = "#fbf9f3";
  x.fillRect(0, 0, w, 980);
  x.fillStyle = "#1c1b18";
  x.font = "600 54px Georgia, serif";
  x.fillText("Tax Invoice", 52, 110);
  x.font = "28px Arial, sans-serif";
  x.fillText("RK/26-27/00042", 52, 158);
  x.fillText("The Motor Shop", 52, 198);
  x.fillStyle = "#c9770a";
  x.fillRect(52, 224, w - 104, 5);
  [["MS bracket, 200 pieces", "₹9,000"], ["GST 18%", "₹1,620"], ["Total", "₹10,620"]].forEach(([a, b], i) => {
    const y = 300 + i * 74;
    x.fillStyle = "#1c1b18";
    x.font = i === 2 ? "700 34px Arial, sans-serif" : "30px Arial, sans-serif";
    x.textAlign = "left";
    x.fillText(a, 52, y);
    x.textAlign = "right";
    x.fillText(b, w - 52, y);
    x.fillStyle = "rgba(28, 27, 24, 0.16)";
    x.fillRect(52, y + 22, w - 104, 2);
  });
});

const paidStamp = () => canvasOf(460, 190, (x, w, h) => {
  x.strokeStyle = x.fillStyle = "#1f7a45";
  x.lineWidth = 10;
  x.strokeRect(10, 10, w - 20, h - 20);
  x.font = "700 108px Arial, sans-serif";
  x.textAlign = "center";
  x.fillText("PAID", w / 2, 136);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 900; i++) x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 2);
});

const shopSign = () => canvasOf(1400, 280, (x, w, h) => {
  x.fillStyle = "#23403d";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#efe6cf";
  x.font = "600 150px Georgia, serif";
  x.textAlign = "center";
  x.fillText("The Motor Shop", w / 2, 192);
  x.strokeStyle = "#c9a35a";
  x.lineWidth = 8;
  x.strokeRect(20, 20, w - 40, h - 40);
  x.globalCompositeOperation = "multiply";
  for (let i = 0; i < 2400; i++) { x.fillStyle = `rgba(90, 70, 50, ${Math.random() * 0.1})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 30, 1 + Math.random() * 2); }
});

const radialFade = () => canvasOf(512, 512, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.5);
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#000");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
});

// The tablet's screen. Behind the app is a live view of another part of the business, drawn with the
// real camera's own perspective, so it behaves like a window and not a picture. As the camera comes
// in, the row's window opens until the whole screen is that place.
const SCREEN_VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const SCREEN_FRAGMENT = /* glsl */ `
  uniform sampler2D tUI, tWindow; uniform vec2 uRes; uniform vec4 uRect; uniform float uOpen, uGlow;
  varying vec2 vUv;
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec3 ui = texture2D(tUI, vUv).rgb;
    vec3 view = texture2D(tWindow, gl_FragCoord.xy / uRes).rgb * uGlow;
    vec2 aspect = vec2(1.45, 1.0);
    vec2 c = mix(uRect.xy, vec2(0.5), uOpen), h = mix(uRect.zw, vec2(0.54), uOpen);
    float d = box((vUv - c) * aspect, h * aspect, mix(0.022, 0.0, uOpen));
    gl_FragColor = vec4(mix(view, ui, smoothstep(-0.0015, 0.0015, d)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// What the screen shows: the eight steps down the side, a window beside them.
const WINDOW = { x: 0.385, y: 0.13, w: 0.585, h: 0.82 };
function drawApp(canvas, journey, now, over, fonts) {
  const x = canvas.getContext("2d"), W = canvas.width, H = canvas.height, u = W / 1000;
  x.fillStyle = "#101114";
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#ffffff";
  x.font = `600 ${25 * u}px ${fonts.text}`;
  x.textBaseline = "alphabetic";
  x.textAlign = "left";
  x.fillText("R.K. Enterprises", 34 * u, 58 * u);
  x.textAlign = "right";
  x.fillStyle = "#9a9aa2";
  x.font = `400 ${21 * u}px ${fonts.text}`;
  x.fillText(`${journey.head}  ·  ${journey.product}`, W - 30 * u, 58 * u);
  x.textAlign = "left";
  const top = 92 * u, row = (H - top - 22 * u) / journey.steps.length;
  journey.steps.forEach((step, i) => {
    const y = top + i * row, here = i === over;
    if (here) { x.fillStyle = "rgba(232, 148, 12, 0.2)"; x.beginPath(); x.roundRect(20 * u, y + 3 * u, 330 * u, row - 6 * u, 10 * u); x.fill(); }
    x.fillStyle = i < now ? "#3fbf72" : here ? "#f5a623" : "#3a3b42";
    x.beginPath();
    x.arc(50 * u, y + row / 2, 9 * u, 0, 7);
    x.fill();
    x.fillStyle = i <= now || here ? "#ffffff" : "#a5a5ad";
    x.font = `600 ${25 * u}px ${fonts.text}`;
    x.fillText(step.name, 76 * u, y + row * 0.46);
    x.fillStyle = "#8d8d96";
    x.font = `400 ${17.5 * u}px ${fonts.text}`;
    x.fillText(step.row.slice(0, 30), 76 * u, y + row * 0.76);
  });
}

function bracketShape(w, d) {
  const s = new THREE.Shape(), r = 0.004;
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  [-0.27, 0.27].forEach((k) => { const hole = new THREE.Path(); hole.absarc(w * k, 0, 0.0052, 0, 7, true); s.holes.push(hole); });
  return s;
}

// The product: a mild steel L bracket, about 11 cm long.
function makeBracket() {
  const noise = canvasOf(512, 512, (x, w, h) => {
    x.fillStyle = "#858585";
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"}, 0.09)`; x.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 220, 1); }
  });
  const rough = new THREE.CanvasTexture(noise);
  const steel = new THREE.MeshStandardMaterial({ color: "#8d9195", metalness: 1, roughness: 0.46, roughnessMap: rough, envMapIntensity: 1.3 });
  const plate = new THREE.ExtrudeGeometry(bracketShape(0.11, 0.058), { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 16 });
  plate.rotateX(-Math.PI / 2);
  const g = new THREE.Group(), base = new THREE.Mesh(plate, steel), wall = new THREE.Mesh(plate, steel);
  wall.rotation.z = Math.PI / 2;
  wall.position.set(-0.052, 0.05, 0);
  base.castShadow = wall.castShadow = base.receiveShadow = wall.receiveShadow = true;
  g.add(base, wall);
  return g;
}

// A panorama wrapped round the scene with its lower half pressed flat, so the photographed floor is a
// real floor the camera can move over. Same idea as three.js's GroundedSkybox, keeping the photo's
// full resolution.
function groundedPhoto(photo, height, radius) {
  const geometry = new THREE.SphereGeometry(radius, 160, 120);
  const p = geometry.attributes.position, v = new THREE.Vector3(), low = (-height * 3) / 2;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y < 0) v.multiplyScalar(v.y < low ? -height / v.y : 1 - (v.y * v.y) / (3 * low * low));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  photo.wrapS = THREE.RepeatWrapping;
  photo.repeat.x = -1;
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: photo, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  return sky;
}

function prepare(object) {
  object.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return object;
}
function fitHeight(object, height) {
  const box = new THREE.Box3().setFromObject(object);
  object.scale.multiplyScalar(height / (box.max.y - box.min.y));
  return object;
}
const place = (object, x, y, z, turn = 0) => { object.position.set(x, y, z); object.rotation.y = turn; return object; };
const part = (root, ending) => { let found = null; root.traverse((o) => { if (o.name.endsWith(ending)) found = o; }); return found; };

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
    if (ms > 26 && w.dpr > 0.8) {
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

function Film({ live, mobile, maxDpr }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const steady = useSteadyFrames(maxDpr);
  const sun = useRef(null);
  const set = useRef({});
  const f = useRef({ s: 0, v: 0, x: 0, y: 0, turn: 0 });
  const [look, pos, normal, temp, temp2, dir, aimAt, destEye, zero] = useMemo(() => Array.from({ length: 9 }, () => new THREE.Vector3()), []);
  const [src, dst, through, inverse] = useMemo(() => Array.from({ length: 4 }, () => new THREE.Matrix4()), []);
  const portal = useMemo(() => new THREE.PerspectiveCamera(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []), pointer = useMemo(() => new THREE.Vector2(), []);
  const view = useMemo(() => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }), [mobile]);

  useEffect(() => {
    let gone = false;
    const world = new THREE.Group();
    scene.add(world);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.02;
    scene.add(sun.current.target);
    const pmrem = new THREE.PMREMGenerator(gl);
    const images = new THREE.TextureLoader(), hdr = new HDRLoader(), gltf = new GLTFLoader();
    const load = (name) => gltf.loadAsync(model(name)).then((g) => prepare(g.scene));
    const image = async (name, colour) => {
      const t = await images.loadAsync(`${FILES}/${name}.webp`);
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      return t;
    };
    const place3 = async (name, height, radius) => {
      const [light, photo] = await Promise.all([hdr.loadAsync(`${FILES}/${name}.hdr`), images.loadAsync(`${FILES}/${name}.webp`)]);
      light.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(light).texture;
      light.dispose();
      photo.colorSpace = THREE.SRGBColorSpace;
      photo.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      const sky = groundedPhoto(photo, height, radius);
      sky.position.y = height - 0.01;
      return { env, sky };
    };

    (async () => {
      // The workshop first: this is what the opening shot needs.
      const [hall, desk, drill, box] = await Promise.all([place3("factory", 2.4, 46), load("metal_office_desk"), load("drill_press_01"), load("cardboard_box_01")]);
      if (gone) return;
      world.add(hall.sky);
      scene.environment = hall.env;
      const s = set.current;
      s.hall = hall;
      world.add(place(desk, DESK.x, 0, 0));
      world.add(place(drill, DESK.x - 0.46, DESK.top, 0.02, 0.32));
      s.drill = { bit: part(drill, "_bit"), a: part(drill, "_gear_a"), b: part(drill, "_gear_b"), handle: part(drill, "_handle"), belt: part(drill, "_belt") };
      s.height = { bit: s.drill.bit?.position.y ?? 0 };

      const bracket = makeBracket();
      const plate = part(drill, "_plate");
      const top = new THREE.Box3().setFromObject(plate ?? drill);
      world.updateMatrixWorld(true);
      top.setFromObject(plate ?? drill);
      place(bracket, (top.min.x + top.max.x) / 2, top.max.y + 0.001, (top.min.z + top.max.z) / 2, 0.5);
      world.add(bracket);

      // The box, with its label, in each place it stops.
      const labelMaterial = new THREE.MeshStandardMaterial({ map: painted(shippingLabel(), gl), roughness: 0.56 });
      const size = new THREE.Box3().setFromObject(box);
      s.front = { z: size.max.z + 0.0015, x: (size.min.x + size.max.x) / 2, y: (size.min.y + size.max.y) / 2, top: size.max.y, width: size.max.x - size.min.x };
      const boxed = () => {
        const g = new THREE.Group();
        g.add(box.clone());
        const w = Math.min(0.27, s.front.width * 0.62);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.667), labelMaterial);
        label.position.set(s.front.x, s.front.y, s.front.z);
        g.add(label);
        return g;
      };
      s.boxed = boxed;
      s.bench = place(boxed(), DESK.x + 0.42, DESK.top, 0.06, -0.28);
      world.add(s.bench);
      // The tablet: glass, a thin aluminium body, and a stand.
      const metal = new THREE.MeshStandardMaterial({ color: "#3b3d41", metalness: 0.9, roughness: 0.42 });
      const tablet = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.width + 0.026, SCREEN.height + 0.026, 0.009), metal);
      body.position.z = -0.0055;
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.width + 0.02, SCREEN.height + 0.02, 0.002), new THREE.MeshPhysicalMaterial({ color: "#0b0c0e", roughness: 0.08, clearcoat: 1 }));
      bezel.position.z = -0.0012;
      body.castShadow = true;
      const ui = document.createElement("canvas");
      ui.width = 1400;
      ui.height = Math.round(1400 * (SCREEN.height / SCREEN.width));
      const uiTexture = new THREE.CanvasTexture(ui);
      uiTexture.colorSpace = THREE.SRGBColorSpace;
      uiTexture.anisotropy = 8;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), new THREE.ShaderMaterial({
        vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT,
        uniforms: { tUI: { value: uiTexture }, tWindow: { value: view.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uOpen: { value: 0 }, uGlow: { value: 1 }, uRect: { value: new THREE.Vector4(WINDOW.x + WINDOW.w / 2, 1 - WINDOW.y - WINDOW.h / 2, WINDOW.w / 2, WINDOW.h / 2) } },
      }));
      tablet.add(body, bezel, face);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 16), metal);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.01, 32), metal);
      pole.castShadow = foot.castShadow = true;
      world.add(tablet, pole, foot);
      s.tablet = { group: tablet, face, ui, uiTexture, pole, foot };
      const css = getComputedStyle(document.querySelector(".lp"));
      s.fonts = { text: (document.querySelector(".lp").lang === "mr" ? css.getPropertyValue("--f-marathi") : css.getPropertyValue("--f-text")).trim() || "sans-serif" };
      s.ready = true;
      live.current.onReady?.();

      // The floor patch under the sets: scanned concrete that fades into the photograph.
      const [diff, nor, rough] = await Promise.all([image("floor_diff", true), image("floor_nor"), image("floor_rough")]);
      if (gone) return;
      [diff, nor, rough].forEach((t) => t.repeat.set(8, 8));
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, roughnessMap: rough, roughness: 1, transparent: true, alphaMap: new THREE.CanvasTexture(radialFade()), envMapIntensity: 0.8 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(-0.6, 0.002, 0);
      floor.receiveShadow = true;
      world.add(floor);
      const forecourt = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), new THREE.MeshStandardMaterial({ color: "#b9b4aa", map: diff, normalMap: nor, roughnessMap: rough, roughness: 1, envMapIntensity: 0.8 }));
      forecourt.rotation.x = -Math.PI / 2;
      forecourt.position.set(STREET.x, 0.002, 10.8);
      forecourt.receiveShadow = true;
      world.add(forecourt);

      const [shelves, truck, register, clipboard, chest, cart, tyre, pump, shutter, yard, desk2, fan, lamp, brickD, brickN, brickR] = await Promise.all([
        load("steel_frame_shelves_01"), load("hand_truck"), load("CashRegister_01"), load("clipboard"), load("metal_tool_chest"), load("tool_cart"), load("old_tyre"), load("tire_pump"),
        load("rollershutter_door"), place3("yard", 1.8, 60), load("metal_office_desk"), load("ceiling_fan"), load("hanging_industrial_lamp"), image("brick_diff", true), image("brick_nor"), image("brick_rough"),
      ]);
      if (gone) return;

      // Shelving, stocked. Our box sits on the middle shelf, front and centre.
      fitHeight(shelves, 2.15);
      const shelf = new THREE.Group();
      for (let i = -1; i <= 1; i++) shelf.add(place(shelves.clone(), RACK.x + i * 1.28, 0, RACK.z));
      const levels = [0.2, 0.9, 1.6];
      levels.forEach((y, row) => { for (let c = 0; c < 6; c++) { if (row === 1 && c === 2) continue; shelf.add(place(boxed(), RACK.x - 1.65 + c * 0.66 + (row % 2) * 0.04, y, RACK.z - 0.02, (row + c) % 3 === 0 ? 0.05 : -0.04)); } });
      world.add(shelf);
      s.ours = place(boxed(), RACK.x, levels[1], RACK.z + 0.02, 0);
      world.add(s.ours);
      const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0625), new THREE.MeshStandardMaterial({ map: painted(heldSticker(), gl), roughness: 0.4, transparent: true, opacity: 0 }));
      sticker.position.set(s.front.x + 0.1, s.front.y + 0.11, s.front.z + 0.001);
      s.ours.add(sticker);
      s.sticker = sticker;

      // The hand truck takes the box out.
      s.truck = place(truck, RACK.x + 1, 0, 1, -0.9);
      world.add(s.truck);
      s.loaded = boxed();
      s.loaded.scale.setScalar(0.9);
      s.truck.add(s.loaded);
      s.loaded.position.set(0, 0.08, 0.12);
      s.loaded.rotation.y = 0;

      // A hanging lamp and a ceiling fan keep the room moving.
      fitHeight(lamp, 1.3);
      s.lamp = new THREE.Group();
      s.lamp.position.set(-0.2, 3.4, -0.1);
      s.lamp.add(lamp);
      world.add(s.lamp);
      s.fan = part(fan, "_blades");
      world.add(place(fan, RACK.x - 1.2, 3.1, 1.4));

      // The till, for the end of the day.
      world.add(place(desk2, TILL.x, 0, 0));
      s.register = place(register, TILL.x + 0.66, DESK.top, 0.02, 0.16);
      s.drawer = part(register, "_drawer");
      s.drawerZ = s.drawer?.position.z ?? 0;
      world.add(s.register);
      world.add(place(chest, TILL.x + 2.2, 0, -0.4, -0.4));

      // The Motor Shop: a brick front, a shutter, a sign, and the tools of the trade outside.
      const street = new THREE.Group();
      [brickD, brickN, brickR].forEach((t) => t.repeat.set(5, 2.2));
      const brick = new THREE.MeshStandardMaterial({ map: brickD, normalMap: brickN, roughnessMap: brickR, roughness: 1 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(11, 4.2, 0.4), brick);
      wall.position.set(STREET.x, 2.1, -1.8);
      wall.castShadow = wall.receiveShadow = true;
      street.add(wall);
      const door = place(shutter, STREET.x - 0.2, 0, -1.56);
      const tag = part(shutter, "_graffiti");
      if (tag) tag.visible = false;
      street.add(door);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.72, 0.06), [0, 0, 0, 0, 0, 0].map((_, i) => (i === 4 ? new THREE.MeshStandardMaterial({ map: painted(shopSign(), gl), roughness: 0.46, metalness: 0.1 }) : new THREE.MeshStandardMaterial({ color: "#23403d", roughness: 0.5 }))));
      sign.position.set(STREET.x - 0.2, 3.02, -1.56);
      sign.castShadow = true;
      street.add(sign);
      street.add(place(cart, STREET.x + 2.5, 0, -1.1, -0.2));
      street.add(place(pump, STREET.x - 2.2, 0, -1.3, 0.5));
      [0, 0.17, 0.34].forEach((y, i) => { const t = tyre.clone(); t.rotation.x = Math.PI / 2; t.position.set(STREET.x - 2.9, 0.085 + y, -1.15); t.rotation.z = i; street.add(t); });
      const lean = tyre.clone();
      lean.position.set(STREET.x + 1.72, 0.3, -1.44);
      lean.rotation.x = -0.1;
      street.add(lean);
      s.door = place(boxed(), STREET.x + 1.05, 0.002, -0.3, -0.24);
      street.add(s.door);
      const atDoor = truck.clone();
      place(atDoor, STREET.x + 0.42, 0, -0.62, 0.5);
      atDoor.children.at(-1).visible = false;   // the box has been lifted off it
      street.add(atDoor);
      place(clipboard, s.front.x, s.front.top + 0.002, 0.02, 0.2);
      fitHeight(clipboard, 0.03);
      s.door.add(clipboard);
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.292), new THREE.MeshStandardMaterial({ map: painted(invoicePage(), gl), roughness: 0.78 }));
      page.rotation.set(-Math.PI / 2, 0, 0.2);
      page.position.set(s.front.x, s.front.top + 0.032, 0.02);
      s.door.add(page);
      s.clip = [clipboard, page];
      const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.054), new THREE.MeshStandardMaterial({ map: painted(paidStamp(), gl), transparent: true, opacity: 0, roughness: 0.6 }));
      stamp.rotation.set(-Math.PI / 2, 0, 0.32);
      stamp.position.set(s.front.x + 0.01, s.front.top + 0.0335, 0.06);
      s.door.add(stamp);
      s.stamp = stamp;
      world.add(street);
      s.yard = yard;
      yard.sky.visible = false;
      world.add(yard.sky);
    })().catch(() => live.current.onFail?.());

    return () => { gone = true; scene.remove(world); scene.environment = null; pmrem.dispose(); };
  }, [gl, live, scene]);

  // Contact shadows do most of the work of making things feel placed. Phones go without.
  const composer = useMemo(() => {
    if (mobile) return null;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, 4, 4);
    ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1, scale: 1.3, samples: 12, distanceFallOff: 1 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
    c.addPass(ao);
    c.addPass(new OutputPass());
    return c;
  }, [camera, gl, mobile, scene]);

  useEffect(() => {
    if (!composer) return;
    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, viewport.dpr]);

  useEffect(() => { view.setSize(Math.round(size.width * viewport.dpr * 0.8), Math.round(size.height * viewport.dpr * 0.8)); }, [size, view, viewport.dpr]);

  // Sets every moving thing for a place in the journey. Called for the real camera, and again for
  // the view through the tablet, which may be somewhere else entirely.
  const stageAt = (s, t) => {
    const s0 = set.current, d = s0.drill;
    if (d) {
      const down = Math.pow(Math.max(0, Math.sin(t * 0.9)), 8);
      if (d.bit) { d.bit.rotation.y = t * 26; d.bit.position.y = s0.height.bit - down * 0.03; }
      if (d.a) d.a.rotation.y = t * 8;
      if (d.b) d.b.rotation.y = t * 11;
      if (d.handle) d.handle.rotation.z = down * 0.34;
    }
    if (s0.fan) s0.fan.rotation.y = t * 2.2;
    if (s0.lamp) s0.lamp.rotation.z = Math.sin(t * 0.8) * 0.018;
    if (s0.bench) s0.bench.visible = s < 1.6;
    if (s0.ours) s0.ours.visible = s > 1.4 && s < 3.6;
    if (s0.sticker) { s0.sticker.material.opacity = ramp(s, 2.3, 2.55); s0.sticker.scale.setScalar(1 + (1 - ramp(s, 2.3, 2.55)) * 0.5); }
    if (s0.truck) {
      const go = ramp(s, 4, 4.4);
      s0.truck.visible = s > 3.4 && s < 4.6;
      place(s0.truck, RACK.x + lerp(0.5, 1.2, go), 0, lerp(0.8, 1.2, go), -0.9);
      s0.truck.rotation.x = -0.34;
    }
    if (s0.clip) {
      const on = ramp(s, 5.15, 5.5);
      s0.clip.forEach((o) => { o.visible = on > 0.01; });
      s0.clip[1].material.transparent = true;
      s0.clip[1].material.opacity = on;
      s0.stamp.material.opacity = ramp(s, 6.2, 6.34);
      s0.stamp.scale.setScalar(1 + (1 - ramp(s, 6.2, 6.34)) * 0.6);
    }
    if (s0.drawer) s0.drawer.position.z = s0.drawerZ + ramp(s, 7.6, 7.95) * 0.17;
  };

  const lightFor = (outside) => {
    const s0 = set.current, light = sun.current;
    s0.hall.sky.visible = !outside;
    if (s0.yard) s0.yard.sky.visible = outside;
    scene.environment = outside && s0.yard ? s0.yard.env : s0.hall.env;
    scene.environmentIntensity = outside ? 0.95 : 1.1;
    light.intensity = outside ? 1.5 : 0.9;
  };

  useFrame(({ clock }, delta) => {
    const l = live.current, m = f.current, s0 = set.current, dt = Math.min(delta, 1 / 24), t = clock.elapsedTime;
    steady(delta);
    if (!s0.ready) return;
    const stiffness = 30;
    m.v += ((l.s - m.s) * stiffness - m.v * 2 * Math.sqrt(stiffness)) * dt;
    m.s += m.v * dt;
    const s = clamp(m.s, 0, 8);
    const k = 1 - Math.exp(-dt * 3);
    m.x += (l.x - m.x) * k;
    m.y += (l.y - m.y) * k;
    m.turn += (l.turn - m.turn) * (1 - Math.exp(-dt * 7));

    // Which screen are we heading for, and how far in are we?
    const seg = Math.min(7, Math.floor(s)), u = s - seg;
    const going = PORTALS.find((p) => p.from === seg);
    const waiting = going && u < 0.5 ? going : PORTALS.find((p) => p.from > seg) ?? PORTALS[0];
    const here = s >= 7.5 ? PORTALS[0] : waiting;
    const from = SHOTS[here.from === 0 && s >= 7.5 ? 8 : here.from];
    pos.set(...here.at);
    normal.set(from.eye[0] - pos.x, (from.eye[1] - pos.y) * 0.72, from.eye[2] - pos.z).normalize();

    // The camera. Between two stops in one place it just moves; into a tablet, it flies in, passes
    // through the glass, and carries on from the matching point in the next place.
    const a = SHOTS[seg], b = SHOTS[seg + 1], aspect = size.width / size.height;
    const away = aspect < 1.2 ? 1 + (1.2 - aspect) * 1.1 : 1;
    const shotEye = (shot, out) => out.set(...shot.eye).sub(temp.set(...shot.aim)).multiplyScalar(away).add(temp);
    if (going && u < 0.5) {
      const v = smooth(u / 0.5), pull = v * v;
      shotEye(a, camera.position).lerp(pos, pull);
      look.set(...a.aim).lerp(aimAt.copy(pos).sub(normal), Math.min(1, v * 1.5));
      if (pull > 0.985) camera.position.copy(pos).addScaledVector(normal, 0.004);
    } else if (going) {
      const v = smooth((u - 0.5) / 0.5);
      shotEye(b, camera.position);
      look.set(...b.aim);
      dir.copy(look).sub(camera.position).normalize();
      camera.position.addScaledVector(dir, -(1 - v) * (1 - v) * 0.9);
    } else {
      const v = smooth(u);
      shotEye(a, camera.position).lerp(shotEye(b, temp2), v);
      look.set(...a.aim).lerp(temp.set(...b.aim), v);
    }
    temp.copy(camera.position).sub(look).applyAxisAngle(THREE.Object3D.DEFAULT_UP, (m.turn * 1.6 + m.x * 0.05) * (going && u < 0.5 ? 1 - smooth(u / 0.5) : 1));
    camera.position.copy(look).add(temp);
    camera.position.y += m.y * 0.04 * (going && u < 0.5 ? 1 - smooth(u / 0.5) : 1) + Math.sin(t * 0.5) * 0.003;
    camera.lookAt(look);
    camera.updateMatrixWorld();

    // The tablet, where it's needed.
    const tab = s0.tablet;
    tab.group.position.copy(pos);
    tab.group.lookAt(temp.copy(pos).add(normal));
    tab.pole.visible = tab.foot.visible = true;
    const base = here.stand, tallness = pos.y - 0.1 - base;
    tab.pole.scale.y = tallness;
    tab.pole.position.set(pos.x, base + tallness / 2, pos.z - 0.03);
    tab.foot.position.set(pos.x, base + 0.008, pos.z - 0.03);

    // Hovering a row on the screen changes the place you see through it.
    let over = -1;
    if (s < 0.3 && l.onScreen) {
      ray.setFromCamera(pointer.set(l.x, l.y), camera);
      const hit = ray.intersectObject(tab.face)[0];
      if (hit?.uv && hit.uv.x < 0.36) over = clamp(Math.floor(((1 - hit.uv.y - 0.1) / 0.875) * 8), 0, 7);
    }
    if (over >= 0) { m.pick = over; l.setPointer?.(true); } else l.setPointer?.(false);
    l.hovered = over;
    const now = s < 0.5 ? m.pick ?? 0 : Math.min(7, Math.round(s) - 1);
    if (now !== m.drawn) {
      m.drawn = now;
      m.fade = 0;
      drawApp(tab.ui, l.journey, s < 0.5 ? -1 : now, now, s0.fonts);
      tab.uiTexture.needsUpdate = true;
    }
    m.fade = Math.min(1, (m.fade ?? 1) + dt * 3.2);

    const open = going && u < 0.5 ? ramp(u, 0.2, 0.46) : 0;
    const screen = tab.face.material.uniforms;
    screen.uOpen.value = open;
    screen.uGlow.value = smooth(m.fade);
    gl.getDrawingBufferSize(screen.uRes.value);

    // The view through the glass: the same camera, moved to the far side of the portal.
    {
      const stop = s < 0.5 ? (m.pick ?? 0) + 1 : here.from + 1;
      const shot = SHOTS[stop];
      shotEye(shot, destEye);
      // Seen from a distance the window looks at the most telling thing in that place. Up close it
      // swings to the exact view the camera will come out into, so the join can't be seen.
      temp.set(...(shot.peek ?? shot.aim)).lerp(temp2.set(...shot.aim), going && u < 0.5 ? ramp(u, 0.12, 0.44) : 0);
      dir.copy(temp).sub(destEye).normalize();
      destEye.addScaledVector(dir, -0.9);
      src.lookAt(normal, zero, THREE.Object3D.DEFAULT_UP).setPosition(pos);
      dst.lookAt(zero, dir, THREE.Object3D.DEFAULT_UP).setPosition(destEye);
      through.copy(dst).multiply(inverse.copy(src).invert());
      portal.projectionMatrix.copy(camera.projectionMatrix);
      portal.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      portal.matrixAutoUpdate = false;
      portal.matrixWorld.copy(through).multiply(camera.matrixWorld);
      portal.matrixWorldInverse.copy(portal.matrixWorld).invert();
      portal.matrixWorldAutoUpdate = false;
      tab.group.visible = tab.pole.visible = tab.foot.visible = false;
      stageAt(stop, t);
      lightFor(OUTSIDE(stop));
      gl.shadowMap.autoUpdate = false;
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(view);
      gl.clear();
      gl.render(scene, portal);
      gl.setRenderTarget(previous);
      gl.shadowMap.autoUpdate = true;
      tab.group.visible = tab.pole.visible = tab.foot.visible = true;
    }

    stageAt(s, t);
    lightFor(OUTSIDE(s));
    const light = sun.current;
    light.position.set(look.x - 2.4, 6.4, look.z + 3.4);
    light.target.position.copy(look);

    if (composer) composer.render(dt); else gl.render(scene, camera);
  }, 1);

  return <directionalLight ref={sun} intensity={0.9} color="#fff1dc" castShadow shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={0.5} shadow-camera-far={18} shadow-radius={6} shadow-bias={-0.0004} shadow-normalBias={0.02} />;
}

export default function Scene({ live, mobile, active }) {
  const maxDpr = mobile ? 1.4 : 1.6;
  return (
    <Canvas frameloop={active ? "always" : "never"} dpr={maxDpr} shadows="percentage" gl={{ antialias: !mobile ? false : true, powerPreference: "high-performance" }} camera={{ fov: mobile ? 40 : 32, near: 0.01, far: 300, position: [-4.78, 1.2, 1.3] }}>
      <color attach="background" args={["#d9d2c3"]} />
      <Film live={live} mobile={mobile} maxDpr={maxDpr} />
    </Canvas>
  );
}
