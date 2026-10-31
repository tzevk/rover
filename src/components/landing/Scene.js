"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BELT, clamp, lerp, PLACE, ramp, SHOTS } from "./world";

// One steel bracket's journey down a clean, working line: pressed, boxed, racked, loaded, delivered,
// billed and paid. Everything is built and painted here in the browser, and everything on the line
// that isn't the product keeps moving on its own, so the place feels alive even when you stop.
const PAGE = "#f8f3e8";

const canvasOf = (w, h, draw) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
};
const speck = (x, n, w, h, dark, light, size = 2) => {
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() < 0.5 ? dark : light;
    x.fillRect(Math.random() * w, Math.random() * h, Math.random() * size + 0.5, Math.random() * size + 0.5);
  }
};
function texture(canvas, gl, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// Polished concrete, with soft cloudy patches and fine aggregate.
const concrete = () => canvasOf(1024, 1024, (x, w, h) => {
  x.fillStyle = "#efe9dd";
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const px = Math.random() * w, py = Math.random() * h, r = 60 + Math.random() * 170, g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, Math.random() < 0.5 ? "rgba(255, 252, 244, 0.2)" : "rgba(190, 178, 158, 0.12)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  speck(x, 26000, w, h, "rgba(120, 108, 90, 0.12)", "rgba(255, 255, 255, 0.16)");
});

// Corrugated kraft board, with the flutes showing as faint stripes.
const kraft = () => canvasOf(512, 512, (x, w, h) => {
  x.fillStyle = "#c79c6b";
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < h; i += 7) { x.fillStyle = `rgba(110, 72, 34, ${0.05 + Math.random() * 0.05})`; x.fillRect(0, i, w, 3); }
  speck(x, 9000, w, h, "rgba(90, 58, 26, 0.16)", "rgba(240, 214, 176, 0.16)");
});

// The finished box: kraft, packing tape over the top, and a printed shipping label on the front.
const cartonFace = (label) => canvasOf(768, 512, (x, w, h) => {
  x.drawImage(kraft(), 0, 0, w, h);
  if (!label) return;
  x.fillStyle = "#fffdf7";
  x.fillRect(70, 86, 440, 340);
  x.fillStyle = "#1f1d17";
  x.font = "700 40px sans-serif";
  x.fillText("MS BRACKET", 96, 150);
  x.font = "26px sans-serif";
  x.fillText("Order #1042   200 pieces", 96, 194);
  x.fillText("Patil Motors, Pune", 96, 232);
  for (let i = 0, px = 96; px < 480; i++) { const b = 2 + Math.floor(Math.random() * 7); x.fillRect(px, 262, b, 100); px += b + 2 + Math.floor(Math.random() * 6); }
  x.font = "20px monospace";
  x.fillText("RK 26-27 001042", 150, 396);
  x.fillStyle = "#e8940c";
  x.fillRect(560, 86, 130, 130);
  x.fillStyle = "#fffdf7";
  x.font = "700 62px sans-serif";
  x.fillText("RK", 582, 172);
});

const beltCanvas = () => canvasOf(256, 256, (x, w, h) => {
  x.fillStyle = "#2c2d2e";
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 32) { x.fillStyle = "#3a3b3c"; x.fillRect(i, 0, 10, h); }
  speck(x, 5000, w, h, "rgba(0, 0, 0, 0.3)", "rgba(255, 255, 255, 0.05)", 1.5);
});

const brushed = () => canvasOf(512, 512, (x, w, h) => {
  x.fillStyle = "#8a8a8a";
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"}, 0.1)`; x.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 260, 1); }
});

const paperSheet = () => canvasOf(620, 860, (x, w) => {
  x.fillStyle = "#fffdf7";
  x.fillRect(0, 0, w, 860);
  x.fillStyle = "#1f1d17";
  x.font = "600 44px Georgia, serif";
  x.fillText("Tax Invoice", 44, 86);
  x.font = "26px sans-serif";
  x.fillText("RK/26-27/00042", 44, 130);
  x.fillStyle = "#e8940c";
  x.fillRect(44, 156, w - 88, 6);
  x.fillStyle = "#1f1d17";
  [["MS bracket, 200 pieces", "₹9,000"], ["GST 18%", "₹1,620"], ["Total", "₹10,620"]].forEach(([a, b], i) => {
    const y = 226 + i * 66;
    x.font = i === 2 ? "700 30px sans-serif" : "28px sans-serif";
    x.textAlign = "left";
    x.fillText(a, 44, y);
    x.textAlign = "right";
    x.fillText(b, w - 44, y);
    x.fillStyle = "rgba(31, 29, 23, 0.16)";
    x.fillRect(44, y + 20, w - 88, 2);
    x.fillStyle = "#1f1d17";
  });
});

const stampCanvas = () => canvasOf(420, 170, (x, w, h) => {
  x.strokeStyle = x.fillStyle = "#2c7a43";
  x.lineWidth = 9;
  x.strokeRect(8, 8, w - 16, h - 16);
  x.font = "700 92px sans-serif";
  x.textAlign = "center";
  x.fillText("PAID", w / 2, 122);
});

const signCanvas = () => canvasOf(1024, 200, (x, w, h) => {
  x.fillStyle = "#2f6f6b";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#fffdf7";
  x.font = "600 104px Georgia, serif";
  x.textAlign = "center";
  x.fillText("Patil Motors", w / 2, 138);
});

const plateCanvas = () => canvasOf(420, 100, (x, w, h) => {
  x.fillStyle = "#fffdf7";
  x.fillRect(0, 0, w, h);
  x.fillStyle = "#1f1d17";
  x.font = "700 62px monospace";
  x.textAlign = "center";
  x.fillText("MH 12 AB 1234", w / 2, 72, w - 24);
});

function plateShape(w, d) {
  const s = new THREE.Shape(), r = 3;
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  [[-w * 0.27, 0], [w * 0.27, 0]].forEach(([x, y]) => { const hole = new THREE.Path(); hole.absarc(x, y, 3.1, 0, 7, true); s.holes.push(hole); });
  return s;
}

// The product: an L-shaped mild steel bracket with two mounting holes on each face.
function makeBracket(steel) {
  const g = new THREE.Group(), options = { depth: 2.2, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2, curveSegments: 14 };
  const plate = new THREE.ExtrudeGeometry(plateShape(38, 20), options);
  plate.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(plate, steel), wall = new THREE.Mesh(plate, steel);
  wall.rotation.z = Math.PI / 2;
  wall.position.set(-17.6, 17.4, 0);
  base.castShadow = wall.castShadow = true;
  base.receiveShadow = wall.receiveShadow = true;
  g.add(base, wall);
  return g;
}

function block(w, h, d, material, r = 1.6, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.01)), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const face = (w, h, material, x, y, z, ry = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
};

function buildLine(gl, mobile) {
  const world = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#f5f2ea", roughness: 0.42, metalness: 0.02 });
  const graphite = new THREE.MeshStandardMaterial({ color: "#34383c", roughness: 0.5, metalness: 0.35 });
  const amber = new THREE.MeshStandardMaterial({ color: "#e8940c", roughness: 0.38 });
  const teal = new THREE.MeshStandardMaterial({ color: "#2f6f6b", roughness: 0.46 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#1d2629", roughness: 0.06, metalness: 0.5, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#cfd2d2", roughness: 0.2, metalness: 1 });
  const streaks = texture(brushed(), gl, [1, 1]);
  streaks.colorSpace = THREE.NoColorSpace;
  const steel = new THREE.MeshStandardMaterial({ color: "#c9cdd0", metalness: 1, roughness: 0.62, roughnessMap: streaks, envMapIntensity: 1.25 });
  const board = new THREE.MeshStandardMaterial({ map: texture(kraft(), gl), roughness: 0.84 });
  const labelled = new THREE.MeshStandardMaterial({ map: texture(cartonFace(true), gl), roughness: 0.78 });
  const plain = new THREE.MeshStandardMaterial({ map: texture(cartonFace(false), gl), roughness: 0.84 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5200, 3200), new THREE.MeshStandardMaterial({ map: texture(concrete(), gl, [7, 4.5]), roughness: 0.34, envMapIntensity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(600, 0, 0);
  floor.receiveShadow = true;
  world.add(floor);

  // The amber line painted on the floor fills in behind the product.
  const fill = { value: 0 };
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: { uFill: fill }, transparent: true,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uFill; varying vec2 vUv; void main() { float done = step(vUv.x, uFill); gl_FragColor = vec4(mix(vec3(0.8, 0.76, 0.68), vec3(0.91, 0.58, 0.05), done), mix(0.5, 1.0, done)); }",
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2.6), lineMaterial);
  line.rotation.x = -Math.PI / 2;
  line.position.set(600, 0.4, 62);
  world.add(line);

  // Conveyor from the press, past the packing station, to the rack.
  const beltTexture = texture(beltCanvas(), gl, [20, 1]);
  const beltTop = new THREE.Mesh(new THREE.PlaneGeometry(570, 46), new THREE.MeshStandardMaterial({ map: beltTexture, roughness: 0.66 }));
  beltTop.rotation.x = -Math.PI / 2;
  beltTop.position.set(180, BELT, 0);
  beltTop.receiveShadow = true;
  world.add(beltTop);
  world.add(block(574, 7, 4, graphite, 1, 180, BELT - 2.5, 25), block(574, 7, 4, graphite, 1, 180, BELT - 2.5, -25));
  const rollers = [];
  for (let i = 0; i < 2; i++) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 50, 24), chrome);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(-105 + i * 570, BELT - 5, 0);
    rollers.push(roll);
    world.add(roll);
  }
  for (let x = -90; x <= 450; x += 90) world.add(block(5, BELT - 6, 42, graphite, 1, x, (BELT - 6) / 2, 0));

  // The press: frame, moving head, and a light that shows it's running.
  const press = new THREE.Group();
  press.add(block(90, 26, 76, white, 3, 0, 13, 0), block(13, 134, 13, graphite, 3, -33, 67, -28), block(13, 134, 13, graphite, 3, 33, 67, -28), block(13, 134, 13, graphite, 3, -33, 67, 28), block(13, 134, 13, graphite, 3, 33, 67, 28));
  press.add(block(92, 30, 78, white, 4, 0, 146, 0), block(60, 4, 4, amber, 1.6, 0, 146, 40));
  const head = new THREE.Group();
  head.add(block(62, 16, 52, chrome, 2, 0, 0, 0), block(13, 40, 13, chrome, 3, 0, 26, 0));
  head.position.y = 100;
  press.add(head);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshStandardMaterial({ color: "#3fbf72", emissive: "#3fbf72", emissiveIntensity: 2 }));
  lamp.position.set(36, 146, 40);
  press.add(lamp);
  world.add(press);

  // Brackets on the belt ahead of ours, and more cartons passing.
  const crowd = Array.from({ length: mobile ? 3 : 5 }, () => { const b = makeBracket(steel); b.position.y = BELT + 0.6; world.add(b); return b; });
  const product = makeBracket(steel);
  product.position.y = BELT + 0.6;
  world.add(product);

  // The packing arch over the belt.
  world.add(block(9, 86, 9, white, 2, PLACE.packer - 44, 43, 40), block(9, 86, 9, white, 2, PLACE.packer + 44, 43, 40), block(9, 86, 9, white, 2, PLACE.packer - 44, 43, -40), block(9, 86, 9, white, 2, PLACE.packer + 44, 43, -40));
  world.add(block(100, 12, 92, white, 2, PLACE.packer, 92, 0), block(70, 3, 3, amber, 1.2, PLACE.packer, 92, 47));

  // The carton: walls and base, with flaps that fold shut, and the sealed box that replaces them.
  const SIZE = { w: 56, h: 40, d: 44 };
  const carton = new THREE.Group();
  const open = new THREE.Group();
  [[0, 0.6, 0, SIZE.w, 1.2, SIZE.d], [0, SIZE.h / 2, SIZE.d / 2, SIZE.w, SIZE.h, 1.2], [0, SIZE.h / 2, -SIZE.d / 2, SIZE.w, SIZE.h, 1.2], [SIZE.w / 2, SIZE.h / 2, 0, 1.2, SIZE.h, SIZE.d], [-SIZE.w / 2, SIZE.h / 2, 0, 1.2, SIZE.h, SIZE.d]].forEach(([x, y, z, w, h, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), board);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    open.add(m);
  });
  const flaps = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([sx, sz]) => {
    const hinge = new THREE.Group();
    hinge.position.set((sx * SIZE.w) / 2, SIZE.h, (sz * SIZE.d) / 2);
    const long = sx === 0, w = long ? SIZE.w : SIZE.d;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, long ? SIZE.d / 2 : SIZE.w / 2), board);
    flap.position.z = (long ? SIZE.d : SIZE.w) / 4;
    flap.castShadow = true;
    const swing = new THREE.Group();
    swing.add(flap);
    hinge.add(swing);
    hinge.rotation.y = sx === 0 ? (sz > 0 ? 0 : Math.PI) : (sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    open.add(hinge);
    return swing;
  });
  const sealed = new THREE.Group();
  const shut = block(SIZE.w, SIZE.h, SIZE.d, plain, 0.7, 0, SIZE.h / 2, 0);
  const front = face(SIZE.w - 1, SIZE.h - 1, labelled, 0, SIZE.h / 2, SIZE.d / 2 + 0.08);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(SIZE.w + 0.6, 0.15, 9), new THREE.MeshPhysicalMaterial({ color: "#e0bf8a", roughness: 0.22, clearcoat: 0.8, transparent: true, opacity: 0.82 }));
  tape.position.y = SIZE.h + 0.1;
  sealed.add(shut, front, tape);
  carton.add(open, sealed);
  world.add(carton);

  // Pallet rack, stocked, with one empty place for ours.
  const rack = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: "#d9791a", roughness: 0.44, metalness: 0.2 });
  [0, 96, 192, 288].forEach((x) => [-1, 1].forEach((side) => rack.add(block(5, 176, 5, teal, 1.2, x, 88, side * 34))));
  [34, 92, 150].forEach((y) => [-1, 1].forEach((side) => rack.add(block(292, 6, 4, orange, 1.2, 144, y, side * 34))));
  [34, 92, 150].forEach((y) => rack.add(block(292, 1.6, 72, new THREE.MeshStandardMaterial({ color: "#d8d3c6", roughness: 0.6 }), 0.5, 144, y + 3.6, 0)));
  const stacked = new THREE.InstancedMesh(new RoundedBoxGeometry(56, 40, 44, 2, 0.7), new THREE.MeshStandardMaterial({ map: texture(cartonFace(true), gl), roughness: 0.8 }), 11);
  stacked.castShadow = true;
  let slot = 0;
  const m4 = new THREE.Matrix4();
  [34, 92, 150].forEach((y, row) => [0, 1, 2, 3].forEach((c) => {
    if (row === 1 && c === 1) return;
    m4.makeTranslation(33 + c * 72, y + 24.4, 0);
    stacked.setMatrixAt(slot++, m4);
  }));
  rack.add(stacked);
  rack.position.set(PLACE.rack, 0, -60);
  world.add(rack);
  const HOME = { x: PLACE.rack + 33 + 72, y: 92 + 4.4, z: -60 };

  // The tag that goes on when the box is held for an order.
  const tag = block(26, 12, 1.2, amber, 0.5);
  world.add(tag);

  // A low carrier that runs goods across the floor.
  const carrier = new THREE.Group();
  carrier.add(block(74, 11, 56, white, 3.4, 0, 8.5, 0), block(62, 1.6, 44, graphite, 0.6, 0, 14.6, 0), block(40, 1.6, 1.4, amber, 0.5, 0, 8.5, 28.4));
  world.add(carrier);

  // The truck: cab, box body, wheels, and a roller door at the back.
  const truck = new THREE.Group();
  const white2 = new THREE.MeshPhysicalMaterial({ color: "#f7f5ef", roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  truck.add(block(190, 84, 82, white2, 3, 0, 70, 0), block(190, 8, 83, amber, 1, 0, 42, 0));
  truck.add(block(72, 72, 78, teal, 10, 136, 58, 0), block(46, 30, 79, glass, 7, 142, 74, 0), block(3, 26, 70, glass, 2, 172, 72, 0));
  truck.add(block(250, 7, 62, graphite, 1, 34, 24, 0));
  const wheels = [[-56, 42], [-56, -42], [134, 42], [134, -42]].map(([x, z]) => {
    const w = new THREE.Group(), tyre = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 13, 32), new THREE.MeshStandardMaterial({ color: "#1f2022", roughness: 0.82 }));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 13.6, 8), chrome);
    tyre.rotation.x = hub.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    w.add(tyre, hub);
    w.position.set(x, 18, z);
    truck.add(w);
    return w;
  });
  const plate = face(30, 7, new THREE.MeshStandardMaterial({ map: texture(plateCanvas(), gl), roughness: 0.4 }), -97, 34, 0, -Math.PI / 2);
  truck.add(plate);
  const door = block(2, 80, 78, new THREE.MeshStandardMaterial({ color: "#dedbd2", roughness: 0.5 }), 0.8, -96, 70, 0);
  truck.add(door);
  world.add(truck);
  // Lane markings for the road out.
  for (let x = 860; x < 1500; x += 90) { const dash = new THREE.Mesh(new THREE.PlaneGeometry(46, 2.4), new THREE.MeshStandardMaterial({ color: "#d9d3c5", roughness: 0.6 })); dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.3, 112); world.add(dash); }

  // The customer's premises.
  const shop = new THREE.Group();
  shop.add(block(300, 150, 120, white, 3, 0, 75, -40), block(308, 8, 128, teal, 2, 0, 154, -40));
  shop.add(face(150, 29, new THREE.MeshStandardMaterial({ map: texture(signCanvas(), gl), roughness: 0.5 }), 0, 128, 20.6));
  shop.add(block(92, 96, 3, glass, 1, -8, 48, 19.8));
  shop.position.set(PLACE.customer, 0, -130);
  world.add(shop);
  const DOOR = { x: PLACE.customer - 8, z: -66 };

  const sheetMaterial = new THREE.MeshStandardMaterial({ map: texture(paperSheet(), gl), roughness: 0.82, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(30, 41.6), sheetMaterial);
  sheet.rotation.x = -Math.PI / 2;
  sheet.castShadow = true;
  world.add(sheet);
  const paid = new THREE.Mesh(new THREE.PlaneGeometry(20, 8.1), new THREE.MeshBasicMaterial({ map: texture(stampCanvas(), gl), transparent: true, opacity: 0, depthWrite: false }));
  paid.rotation.set(-Math.PI / 2, 0, 0.16);
  world.add(paid);

  function update(s, time) {
    // The line runs whatever the visitor is doing.
    beltTexture.offset.x = -time * 0.34;
    rollers.forEach((r) => { r.rotation.y = -time * 3; });
    const stroke = Math.pow(Math.max(0, Math.sin(time * 1.9)), 6);
    head.position.y = 100 - stroke * 44;
    lamp.material.emissiveIntensity = 1.4 + Math.sin(time * 3) * 0.8;
    crowd.forEach((b, i) => {
      const k = ((time * 0.055 + i / crowd.length) % 1);
      b.position.x = lerp(70, 225, k);
      b.position.z = -6 + i * 3;
      b.visible = s > 0.2 || k > 0.1;
    });

    // Our bracket, out of the press and along the belt, into the open box.
    const out = ramp(s, 0, 1), along = ramp(s, 1.02, 1.42), drop = ramp(s, 1.42, 1.54);
    product.position.set(lerp(lerp(0, 84, out), PLACE.packer, along), lerp(BELT + 0.6 + (s < 0.05 ? 7 : 0), BELT + 6, drop), 2);
    product.rotation.y = lerp(0.5, 0, out) + Math.sin(time * 0.7) * 0.05 * (1 - along);
    product.visible = s < 1.7;

    // The box waits under the arch, folds shut, is labelled and goes to the rack.
    const fold = ramp(s, 1.56, 1.72), seal = s > 1.72, toRack = ramp(s, 1.76, 1.9), up = ramp(s, 1.9, 2), onto = ramp(s, 1.94, 2);
    const down = ramp(s, 3.06, 3.3), ride = ramp(s, 3.3, 3.8), inTruck = ramp(s, 3.8, 3.96);
    open.visible = !seal;
    sealed.visible = seal;
    flaps.forEach((f, i) => { f.rotation.x = lerp(-2.4 - i * 0.12, 0, fold); });
    const truckStart = PLACE.truck, roll = ramp(s, 4.04, 4.94), truckX = lerp(truckStart, PLACE.customer - 150, roll);
    const rearX = truckX - 96;
    const carX = lerp(HOME.x, rearX - 40, ride);
    let x = lerp(lerp(PLACE.packer, PLACE.rack + 10, toRack), HOME.x, onto);
    let y = lerp(lerp(BELT + 0.5, HOME.y, up), 15.6, down);
    let z = lerp(lerp(0, HOME.z, onto), 30, down);
    if (s > 3.3) { x = lerp(carX, rearX + 40, inTruck); y = lerp(15.6, 36, inTruck); z = lerp(30, 0, ride); }
    const unload = ramp(s, 4.9, 5);
    if (s > 4.86) { x = lerp(rearX - 30, DOOR.x, unload); y = lerp(30, 0.2, unload); z = lerp(0, DOOR.z, unload); }
    carton.position.set(x, y, z);
    carton.rotation.y = lerp(0, 0.34, unload);
    carton.visible = !(s > 3.96 && s < 4.86);

    tag.visible = s > 2.4 && s < 4;
    tag.position.set(carton.position.x + 12, carton.position.y + 26, carton.position.z + 22.9);
    tag.scale.setScalar(ramp(s, 2.4, 2.75));

    carrier.position.set(lerp(HOME.x, rearX - 40, ride), 0, lerp(30, 0, ride));
    carrier.position.x = s < 3.05 ? lerp(PLACE.rack - 240, HOME.x, ramp(s, 2.7, 3.05)) : carrier.position.x;
    carrier.position.z = s < 3.05 ? 30 : carrier.position.z;
    if (s > 3.9) carrier.position.x = lerp(rearX - 40, PLACE.rack - 240, ramp(s, 3.9, 4.4));

    truck.position.set(truckX, 0, 20);
    wheels.forEach((w) => { w.rotation.z = -(truckX - truckStart) / 18; });
    door.position.y = 70 + (1 - ramp(s, 3.92, 4)) * 76;
    door.scale.y = lerp(0.12, 1, ramp(s, 3.92, 4));

    const lay = ramp(s, 5.3, 5.9);
    sheet.visible = lay > 0;
    sheet.position.set(DOOR.x + 2, lerp(120, 40.6, lay), DOOR.z + lerp(90, 0, lay));
    sheet.rotation.z = lerp(0.6, 0.34, lay);
    paid.material.opacity = ramp(s, 6.3, 6.5);
    const hit = 1 + (1 - ramp(s, 6.3, 6.5)) * 0.9;
    paid.scale.set(hit, hit, 1);
    paid.position.set(DOOR.x + 2.5, 40.9, DOOR.z + 9);

    fill.value = clamp((Math.max(product.position.x, s > 1.7 ? x : 0) - (600 - 700)) / 1400);
    if (s > 7.2) fill.value = lerp(fill.value, 1, ramp(s, 7.2, 8));
  }
  return { world, update };
}

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

function Line({ live, mobile, maxDpr }) {
  const { gl, scene, camera, size } = useThree();
  const steady = useSteadyFrames(maxDpr);
  const line = useMemo(() => buildLine(gl, mobile), [gl, mobile]);
  const sun = useRef(null);
  const eye = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.eye)), false, "centripetal"), []);
  const aim = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.aim)), false, "centripetal"), []);
  const f = useRef({ s: 0, v: 0, x: 0, y: 0, turn: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.03).texture;
    scene.environment = map;
    scene.environmentIntensity = 0.62;
    scene.fog = new THREE.Fog(PAGE, 620, 1500);
    pmrem.dispose();
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1;
    scene.add(sun.current.target);
    live.current.onReady?.();
    return () => { scene.environment = null; scene.fog = null; map.dispose(); };
  }, [gl, live, scene]);

  useFrame(({ clock }, delta) => {
    const l = live.current, m = f.current, dt = Math.min(delta, 1 / 24);
    steady(delta);
    const stiffness = 34;
    m.v += ((l.s - m.s) * stiffness - m.v * 2 * Math.sqrt(stiffness)) * dt;
    m.s += m.v * dt;
    const s = clamp(m.s, 0, 8);
    line.update(s, clock.elapsedTime);

    const u = s / (SHOTS.length - 1);
    eye.getPoint(u, camera.position);
    aim.getPoint(u, look);
    const k = 1 - Math.exp(-dt * 3);
    m.x += (l.x - m.x) * k;
    m.y += (l.y - m.y) * k;
    m.turn += (l.turn - m.turn) * (1 - Math.exp(-dt * 7));

    // Narrow screens stand further back so the subject still fits.
    const aspect = size.width / size.height;
    const away = aspect < 1.2 ? 1 + (1.2 - aspect) * 0.95 : 1;
    camera.position.sub(look).multiplyScalar(away).applyAxisAngle(THREE.Object3D.DEFAULT_UP, m.turn * 2.4 + m.x * 0.05).add(look);
    camera.position.y += m.y * 12;
    camera.lookAt(look);

    // The sun's shadow box follows the camera along the line.
    const light = sun.current, wide = s > 7 ? 900 : 380, c = light.shadow.camera;
    if (c.right !== wide) { c.left = -wide; c.right = wide; c.top = wide; c.bottom = -wide; c.updateProjectionMatrix(); }
    light.position.set(look.x - 300, 620, look.z + 340);
    light.target.position.set(look.x, 0, look.z);
  }, -1);

  return (
    <>
      <primitive object={line.world} />
      <hemisphereLight args={["#fffaf0", "#e7dcc6", 1.15]} />
      <directionalLight ref={sun} color="#fff2dc" intensity={2.5} castShadow shadow-mapSize={mobile ? [1536, 1536] : [3072, 3072]} shadow-camera-near={80} shadow-camera-far={1500} shadow-radius={5} shadow-bias={-0.0003} shadow-normalBias={0.5} />
    </>
  );
}

export default function Scene({ live, mobile, active }) {
  const maxDpr = mobile ? 1.4 : 1.75;
  return (
    <Canvas frameloop={active ? "always" : "never"} dpr={maxDpr} shadows="percentage" gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ fov: mobile ? 34 : 28, near: 8, far: 3200, position: [-250, 118, 300] }}>
      <color attach="background" args={[PAGE]} />
      <Line live={live} mobile={mobile} maxDpr={maxDpr} />
    </Canvas>
  );
}
