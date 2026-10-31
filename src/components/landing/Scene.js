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
import { clamp, CUTS, DESK, lerp, RACK, ramp, SHOTS, STREET, TILL } from "./world";

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
  const steel = new THREE.MeshStandardMaterial({ color: "#b9bdc0", metalness: 1, roughness: 0.56, roughnessMap: rough, envMapIntensity: 1.3 });
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
  const f = useRef({ s: 0, v: 0, x: 0, y: 0, turn: 0, room: 0, outside: null });
  const look = useMemo(() => new THREE.Vector3(), []);
  const eye = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.eye)), false, "centripetal"), []);
  const aim = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.aim)), false, "centripetal"), []);

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
      s.register = place(register, TILL.x - 0.1, DESK.top, 0.02, 0.24);
      s.drawer = part(register, "_drawer");
      s.drawerZ = s.drawer?.position.z ?? 0;
      world.add(s.register);
      world.add(place(chest, TILL.x + 1.5, 0, -0.1, -0.4));

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
      s.door = place(boxed(), STREET.x - 0.75, 0.002, -0.35, 0.28);
      street.add(s.door);
      const atDoor = truck.clone();
      place(atDoor, STREET.x - 1.45, 0, -0.6, 0.5);
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
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.ShadowMaterial({ opacity: 0.42 }));
      catcher.rotation.x = -Math.PI / 2;
      catcher.position.set(STREET.x, 0.003, 2);
      catcher.receiveShadow = true;
      world.add(catcher);
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

  useFrame(({ clock }, delta) => {
    const l = live.current, m = f.current, s0 = set.current, dt = Math.min(delta, 1 / 24), t = clock.elapsedTime;
    steady(delta);
    if (!s0.ready) return;
    const stiffness = 30;
    m.v += ((l.s - m.s) * stiffness - m.v * 2 * Math.sqrt(stiffness)) * dt;
    m.s += m.v * dt;
    const s = clamp(m.s, 0, 8);

    // Inside or out, the photograph, its light and the sun swap at the cuts.
    const outside = s > 4.5 && s < 7.5;
    if (outside !== m.outside && (!outside || s0.yard)) {
      m.outside = outside;
      s0.hall.sky.visible = !outside;
      if (s0.yard) s0.yard.sky.visible = outside;
      scene.environment = outside ? s0.yard.env : s0.hall.env;
      scene.environmentIntensity = outside ? 0.95 : 1.1;
      const light = sun.current;
      light.intensity = outside ? 1.5 : 0.9;
      light.color.set(outside ? "#fff4e6" : "#fff1dc");
    }

    // The drill runs all the time; the bit comes down and lifts.
    const d = s0.drill;
    if (d) {
      if (d.bit) { d.bit.rotation.y = t * 26; d.bit.position.y = s0.height.bit - Math.pow(Math.max(0, Math.sin(t * 0.9)), 8) * 0.03; }
      if (d.a) d.a.rotation.y = t * 8;
      if (d.b) d.b.rotation.y = t * 11;
      if (d.handle) d.handle.rotation.z = Math.pow(Math.max(0, Math.sin(t * 0.9)), 8) * 0.34;
    }
    if (s0.fan) s0.fan.rotation.y = t * 2.2;
    if (s0.lamp) s0.lamp.rotation.z = Math.sin(t * 0.8) * 0.018;
    if (s0.bench) s0.bench.visible = s < 1.5;
    if (s0.ours) s0.ours.visible = s < 3.5;
    if (s0.sticker) { s0.sticker.material.opacity = ramp(s, 2.3, 2.55); s0.sticker.scale.setScalar(1 + (1 - ramp(s, 2.3, 2.55)) * 0.5); }
    if (s0.truck) {
      const go = ramp(s, 3.5, 4.4);
      s0.truck.visible = s > 3.5 && s < 4.5;
      place(s0.truck, RACK.x + lerp(0.7, 2, go), 0, lerp(0.6, 1.5, go), -0.9);
      s0.truck.rotation.x = -0.34 * ramp(s, 3.5, 3.7);
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

    const u = s / (SHOTS.length - 1);
    eye.getPoint(u, camera.position);
    aim.getPoint(u, look);
    const k = 1 - Math.exp(-dt * 3);
    m.x += (l.x - m.x) * k;
    m.y += (l.y - m.y) * k;
    m.turn += (l.turn - m.turn) * (1 - Math.exp(-dt * 7));
    const aspect = size.width / size.height;
    const away = aspect < 1.2 ? 1 + (1.2 - aspect) * 1.1 : 1;
    camera.position.sub(look).multiplyScalar(away).applyAxisAngle(THREE.Object3D.DEFAULT_UP, m.turn * 1.6 + m.x * 0.035).add(look);
    camera.position.y += m.y * 0.05 + Math.sin(t * 0.5) * 0.004;
    camera.lookAt(look);
    const room = s < 0.5 || aspect < 1.2 ? 0 : 0.085;
    if (Math.abs(room - m.room) > 0.0004) {
      m.room += (room - m.room) * (1 - Math.exp(-dt * 5));
      camera.setViewOffset(size.width, size.height, size.width * m.room, 0, size.width, size.height);
    }

    const light = sun.current;
    light.position.set(look.x - 2.4, 6.4, look.z + 3.4);
    light.target.position.copy(look);

    let dip = 0;
    CUTS.forEach((c) => { dip = Math.max(dip, 1 - clamp(Math.abs(s - c) / 0.17)); });
    l.pin.current?.style.setProperty("--dip", dip.toFixed(3));

    if (composer) composer.render(dt); else gl.render(scene, camera);
  }, 1);

  return <directionalLight ref={sun} intensity={0.9} color="#fff1dc" castShadow shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={0.5} shadow-camera-far={18} shadow-radius={6} shadow-bias={-0.0004} shadow-normalBias={0.02} />;
}

export default function Scene({ live, mobile, active }) {
  const maxDpr = mobile ? 1.4 : 1.6;
  return (
    <Canvas frameloop={active ? "always" : "never"} dpr={maxDpr} shadows="percentage" gl={{ antialias: !mobile ? false : true, powerPreference: "high-performance" }} camera={{ fov: mobile ? 36 : 30, near: 0.05, far: 300, position: [-0.3, 1.5, 3.5] }}>
      <color attach="background" args={["#d9d2c3"]} />
      <Film live={live} mobile={mobile} maxDpr={maxDpr} />
    </Canvas>
  );
}
