"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildGround, clamp, fbm, haulCurve, heightAt, PILES, PLACES, rand, ramp, roadCurve, SHOTS, smooth, threadCurve, treeSpots } from "./world";

// A ruled register page that rises into a working quarry. One amber thread follows a single load
// through the whole operation, then the quarry folds flat again and the page is complete.
// Moments are numbered by `s`, an index into SHOTS, so everything here is a function of s.
const S = { production: 2, crushing: 3, stock: 4, order: 5, loading: 6, weighbridge: 7, dispatch: 8, payment: 9, reconcile: 10, page: 11 };
const RULE_GAP = 7.2;

const PAPER_GLSL = /* glsl */ `
  const vec3 PAPER = vec3(0.973, 0.953, 0.91);
  float rules(vec2 p, float strength) {
    float z = abs(fract(p.y / ${RULE_GAP.toFixed(1)}) - 0.5) * ${RULE_GAP.toFixed(1)};
    float w = fwidth(p.y) * 0.9 + 0.11;
    return (1.0 - smoothstep(w * 0.5, w, z)) * strength;
  }
`;

const GROUND_VERTEX = /* glsl */ `
  attribute vec2 aShade; attribute vec2 aInfo;
  varying vec3 vP; varying vec3 vN; varying vec2 vShade; varying vec2 vInfo; varying float vH;
  void main() {
    vP = position; vH = position.y; vN = normal; vShade = aShade; vInfo = aInfo;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform float uLift; uniform float uTime; uniform vec3 uSun;
  varying vec3 vP; varying vec3 vN; varying vec2 vShade; varying vec2 vInfo; varying float vH;
  ${PAPER_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  vec3 strata(float b) {
    vec3 c0 = vec3(0.945, 0.88, 0.77), c1 = vec3(0.87, 0.71, 0.5), c2 = vec3(0.93, 0.8, 0.62),
         c3 = vec3(0.79, 0.56, 0.42), c4 = vec3(0.9, 0.84, 0.74), c5 = vec3(0.71, 0.63, 0.55);
    float t = fract(b / 6.0) * 6.0, f = smoothstep(0.32, 0.68, fract(t));
    int i = int(floor(t));
    if (i == 0) return mix(c0, c1, f);
    if (i == 1) return mix(c1, c2, f);
    if (i == 2) return mix(c2, c3, f);
    if (i == 3) return mix(c3, c4, f);
    if (i == 4) return mix(c4, c5, f);
    return mix(c5, c0, f);
  }
  void main() {
    vec3 N = normalize(vN);
    float up = smoothstep(0.62, 0.96, N.y);
    float grain = fbm(vP.xz * 0.5), fine = noise(vP.xz * 3.1);
    float band = vH * 0.62 + (fbm(vP.xz * 0.035) - 0.5) * 5.0 + noise(vec2(vP.x * 0.24, vH * 3.2)) * 0.5;
    vec3 rock = strata(band) * (0.94 + grain * 0.12);
    rock = mix(rock, vec3(0.975, 0.95, 0.89) * (0.96 + fine * 0.05), up * 0.86);      // dusty bench tops
    rock = mix(rock, vec3(0.86, 0.87, 0.7), smoothstep(0.46, 0.66, grain) * up * smoothstep(1.0, 4.0, vH) * 0.34); // scrub on the rim
    rock = mix(rock, vec3(0.88, 0.83, 0.75) * (0.96 + fine * 0.05), vInfo.x * 0.42); // the roads
    float tyre = smoothstep(0.1, 0.0, abs(fract(vP.x * 0.44 + vP.z * 0.31) - 0.5) - 0.42) * vInfo.x;
    rock *= 1.0 - tyre * 0.05;

    // Rain and groundwater collect on the pit floor, the one cool colour in the scene.
    float pond = smoothstep(-30.0, -32.6, vH + (fbm(vP.xz * 0.05) - 0.5) * 4.0) * up;
    float glint = pow(noise(vP.xz * 0.9 + uTime * 0.25), 6.0) * 0.5;
    rock = mix(rock, vec3(0.32, 0.72, 0.72) + glint, pond);

    float sun = max(dot(N, uSun), 0.0) * mix(0.3, 1.0, vShade.x);
    vec3 shadow = vec3(0.79, 0.79, 0.87), light = vec3(1.06, 1.03, 0.98);
    vec3 lit = rock * mix(shadow, light, smoothstep(0.0, 0.8, sun));
    lit *= mix(0.8, 1.0, vShade.y);

    // Contour lines: the drawing the rock came from.
    float c = abs(fract(vH / 3.6) - 0.5) * 3.6, cw = fwidth(vH) + 0.05;
    lit = mix(lit, lit * 0.76, (1.0 - smoothstep(cw * 0.5, cw * 1.5, c)) * 0.22);

    // The rock bleeds out into the paper like a wash of ink.
    float wash = smoothstep(0.34, 0.62, vInfo.y + (fbm(vP.xz * 0.045) - 0.5) * 0.46 + (fine - 0.5) * 0.05);
    vec3 page = PAPER * mix(mix(0.8, 1.0, vShade.x), 1.0, 1.0 - clamp(uLift, 0.0, 1.0) * 0.9);
    page *= mix(mix(0.9, 1.0, vShade.y), 1.0, 1.0 - clamp(uLift, 0.0, 1.0));
    vec3 color = mix(page, lit, wash * smoothstep(0.02, 0.5, uLift));

    // The register's ruled lines ride over everything, so the terraces read as the same page.
    float ruled = rules(vP.xz, mix(0.3, 0.13, wash * clamp(uLift, 0.0, 1.0)));
    color = mix(color, vec3(0.42, 0.56, 0.68), ruled);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const SHEET_FRAGMENT = /* glsl */ `
  uniform vec3 uCentre;
  varying vec3 vP;
  ${PAPER_GLSL}
  void main() {
    float d = distance(vP.xz, uCentre.xz);
    vec3 color = mix(PAPER, vec3(0.42, 0.56, 0.68), rules(vP.xz, 0.3));
    float margin = 1.0 - smoothstep(0.25, 0.6, abs(vP.x + 196.0));
    color = mix(color, vec3(0.83, 0.42, 0.33), margin * 0.42);
    gl_FragColor = vec4(color, 1.0 - smoothstep(560.0, 980.0, d));
  }
`;

function Ground({ cells, world }) {
  const geometry = useMemo(() => buildGround(cells), [cells]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    uniforms: { uLift: { value: 0 }, uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.62, 0.56, 0.55).normalize() } },
  }), []);
  useFrame(({ clock }) => {
    material.uniforms.uLift.value = world.current.lift;
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

// The rest of the page, running out past the quarry until it dissolves into the sky.
function Sheet() {
  // A frame around the carved area: the pit goes below the page, so the sheet can't cover it.
  const geometry = useMemo(() => {
    const outer = new THREE.Shape([[-1200, -1200], [1200, -1200], [1200, 1200], [-1200, 1200]].map(([x, y]) => new THREE.Vector2(x, y)));
    const edge = 178;
    outer.holes.push(new THREE.Path([[-edge, -edge], [-edge, edge], [edge, edge], [edge, -edge]].map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(outer);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: SHEET_FRAGMENT,
    uniforms: { uCentre: { value: new THREE.Vector3(0, 0, 40) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  return <mesh geometry={geometry} material={material} renderOrder={-1} frustumCulled={false} />;
}

const Box = ({ p, s, c, r, m = 0.1, rough = 0.62 }) => (
  <mesh position={p} rotation={r}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} metalness={m} roughness={rough} />
  </mesh>
);

const WHITE = "#f4f1ea", STEEL = "#b9bdbf", SHADE = "#6d7276", AMBER = "#f0a11e", INK = "#38372f";

// Stone travelling a belt, the steady pulse of the place.
function Belt({ from, to, count, width = 2.2 }) {
  const stones = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const a = useMemo(() => new THREE.Vector3(...from), [from]);
  const b = useMemo(() => new THREE.Vector3(...to), [to]);
  const mid = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b]);
  const length = a.distanceTo(b);
  const turn = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize()), [a, b]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    for (let i = 0; i < count; i++) {
      v.lerpVectors(a, b, (i / count + clock.elapsedTime * 0.07) % 1);
      dummy.position.set(v.x, v.y + 0.75, v.z);
      dummy.rotation.set(i, i * 2, i * 3);
      dummy.scale.setScalar(0.42 + rand(i, 5) * 0.5);
      dummy.updateMatrix();
      stones.current.setMatrixAt(i, dummy.matrix);
    }
    stones.current.instanceMatrix.needsUpdate = true;
  });
  const legs = [0.18, 0.5, 0.82].map((t) => a.clone().lerp(b, t));
  return (
    <group>
      <group position={mid} quaternion={turn}>
        <Box p={[0, 0, 0]} s={[length, 0.5, width]} c={STEEL} m={0.45} />
        <Box p={[0, 0.3, 0]} s={[length, 0.12, width * 0.72]} c={INK} rough={0.9} />
        {[-1, 1].map((side) => <Box key={side} p={[0, 0.62, (side * width) / 2]} s={[length, 0.18, 0.14]} c={AMBER} m={0.3} />)}
      </group>
      {legs.map((p, i) => {
        const g = heightAt(p.x, p.z), h = Math.max(0.2, p.y - g);
        return <Box key={i} p={[p.x, g + h / 2, p.z]} s={[0.5, h, width * 0.8]} c={STEEL} m={0.45} />;
      })}
      <instancedMesh ref={stones} args={[null, null, count]}>
        <dodecahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial color="#d8c4a0" roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}

// The crusher and screening tower, drawn clean and pale so they read as a model on the page.
function Plant() {
  const [hx, hz] = PLACES.hopper, [sx, sz] = PLACES.screen;
  const hy = heightAt(hx, hz), sy = heightAt(sx, sz);
  return (
    <group>
      <group position={[hx, hy, hz]}>
        <Box p={[0, 3, 0]} s={[9, 6, 8]} c={WHITE} />
        <mesh position={[0, 7.6, 0]} rotation={[Math.PI, Math.PI / 4, 0]}>
          <cylinderGeometry args={[3, 7.2, 4.2, 4]} />
          <meshStandardMaterial color={AMBER} metalness={0.25} roughness={0.5} />
        </mesh>
        <Box p={[0, 3, 4.1]} s={[9.2, 1.1, 0.2]} c={AMBER} />
        {[[-4.4, -3.8], [4.4, -3.8], [-4.4, 3.8], [4.4, 3.8]].map(([x, z], i) => <Box key={i} p={[x, 3, z]} s={[0.5, 6, 0.5]} c={SHADE} m={0.5} />)}
      </group>
      <group position={[sx, sy, sz]}>
        {[0, 1, 2].map((deck) => <Box key={deck} p={[0, 5 + deck * 4.6, 0]} s={[14, 0.7, 10]} c={deck === 2 ? AMBER : WHITE} r={[0, 0, -0.14]} />)}
        <Box p={[0, 9, -4.6]} s={[12, 13, 0.3]} c={STEEL} m={0.4} />
        {[[-6.4, -4.4], [6.4, -4.4], [-6.4, 4.4], [6.4, 4.4]].map(([x, z], i) => <Box key={i} p={[x, 7.8, z]} s={[0.6, 15.6, 0.6]} c={SHADE} m={0.5} />)}
      </group>
    </group>
  );
}

function pileGeometry(r, h, seed) {
  const grid = new THREE.PlaneGeometry(r * 2.3, r * 2.3, 64, 64);
  grid.rotateX(-Math.PI / 2);
  const p = grid.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const edge = r * (0.9 + (fbm(Math.cos(a) * 1.4 + seed * 7, Math.sin(a) * 1.4) - 0.5) * 0.42);
    const t = clamp(1 - Math.hypot(x, z) / edge);
    p.setY(i, h * Math.pow(t, 0.92) * (1 - 0.12 * t * t) + (fbm(x * 1.2 + seed, z * 1.2) - 0.5) * 0.5 * Math.min(1, t * 5) - 0.3);
  }
  grid.computeVertexNormals();
  return grid;
}

// The heaps grow as production comes in; the main one takes the thread's material.
function Piles({ world }) {
  const refs = useRef([]);
  const items = useMemo(() => PILES.map((p, i) => ({ ...p, g: pileGeometry(p.r, p.h, i), base: heightAt(...p.at) })), []);
  useFrame(() => {
    const s = world.current.s;
    refs.current.forEach((m, i) => { if (m) m.scale.y = i === 0 ? 0.7 + 0.3 * ramp(s, S.crushing, S.stock + 0.5) - 0.12 * ramp(s, S.loading, S.loading + 0.8) : 1; });
  });
  return items.map((p, i) => (
    <mesh key={i} ref={(el) => { refs.current[i] = el; }} geometry={p.g} position={[p.at[0], p.base, p.at[1]]}>
      <meshStandardMaterial color={p.color} roughness={1} flatShading={false} />
    </mesh>
  ));
}

function Truck({ color = AMBER, loaded, wheel = INK }) {
  return (
    <group>
      <Box p={[0, 1.1, 0]} s={[3, 0.7, 11]} c={INK} rough={0.8} />
      <group position={[0, 1.2, 3.8]}>
        <Box p={[0, 1.6, 0]} s={[3.5, 3, 3.1]} c={WHITE} />
        <Box p={[0, 2.25, 1.57]} s={[3, 1.3, 0.1]} c="#5f8ea3" m={0.7} rough={0.2} />
      </group>
      <group position={[0, 1.6, -1.7]}>
        <Box p={[0, 1.5, 0]} s={[3.8, 2.8, 7.2]} c={color} m={0.3} rough={0.45} />
        <group ref={loaded} scale={0.001} position={[0, 2.9, 0]}>
          <mesh scale={[1.7, 0.85, 3.2]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#d9c8a9" roughness={1} flatShading />
          </mesh>
        </group>
      </group>
      {[[-1.75, 3.6], [1.75, 3.6], [-1.75, -2], [1.75, -2], [-1.75, -3.9], [1.75, -3.9]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.95, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.95, 0.95, 0.8, 14]} />
          <meshStandardMaterial color={wheel} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Blob({ w, l }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(70,66,92,0.5)");
    g.addColorStop(1, "rgba(70,66,92,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1, 0.12, -1]}>
      <planeGeometry args={[w, l]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

// The truck the story follows: empty at the yard, under the loader, over the weighbridge, out of
// the gate and on to the customer. Tied to the scroll, so it runs backwards as well.
function HeroTruck({ world, road }) {
  const body = useRef(), load = useRef();
  const v = useMemo(() => new THREE.Vector3(), []), ahead = useMemo(() => new THREE.Vector3(), []);
  const atWeigh = 0.29, atGate = 0.47;
  useFrame(() => {
    const s = world.current.s;
    const u = 0.02 + 0.0 * s
      + (atWeigh - 0.02) * ramp(s, S.loading + 0.55, S.weighbridge - 0.2)
      + (atGate - atWeigh) * ramp(s, S.weighbridge + 0.45, S.dispatch)
      + (0.985 - atGate) * ramp(s, S.dispatch + 0.05, S.payment - 0.12);
    road.getPointAt(u, v);
    road.getPointAt(Math.min(1, u + 0.004), ahead);
    body.current.position.copy(v);
    body.current.lookAt(ahead.x, v.y, ahead.z);
    const onDeck = 1 - ramp(Math.abs(u - atWeigh), 0.02, 0.05);
    body.current.position.y += 0.2 + onDeck * 0.34;
    const full = ramp(s, S.loading + 0.05, S.loading + 0.4);
    load.current.scale.setScalar(Math.max(0.001, full));
    world.current.truck.copy(body.current.position);
    world.current.onDeck = onDeck * full;
  });
  return (
    <group ref={body}>
      <Blob w={11} l={17} />
      <Truck loaded={load} />
    </group>
  );
}

// Two dumpers working the haul road, unhurried, so the pit is never still.
function PitTrucks({ haul }) {
  const refs = useRef([]);
  const v = useMemo(() => new THREE.Vector3(), []), ahead = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const phase = (clock.elapsedTime * 0.024 + i * 0.55) % 2;
      const u = 0.03 + 0.92 * (phase < 1 ? phase : 2 - phase);
      haul.getPointAt(u, v);
      haul.getPointAt(clamp(u + (phase < 1 ? 0.01 : -0.01), 0, 1), ahead);
      g.position.copy(v);
      g.position.y += 0.1;
      g.lookAt(ahead.x, ahead.y + 0.1, ahead.z);
    });
  });
  return [0, 1].map((i) => <group key={i} ref={(el) => { refs.current[i] = el; }} scale={0.72}><Truck color={i ? WHITE : AMBER} /></group>);
}

function Excavator({ world }) {
  const arm = useRef();
  const [x, z] = PLACES.excavator, y = heightAt(x, z);
  useFrame(({ clock }) => { arm.current.rotation.z = -0.5 + Math.sin(clock.elapsedTime * 0.8) * 0.2 + ramp(world.current.s, 1.8, 2.4) * 0.1; });
  return (
    <group position={[x, y + 0.2, z]} rotation={[0, 0.6, 0]} scale={1.2}>
      <Box p={[0, 0.8, 0]} s={[5, 1.6, 6]} c={INK} rough={0.9} />
      <Box p={[0, 2.8, 0]} s={[4.4, 2.6, 5]} c={AMBER} m={0.3} rough={0.45} />
      <group ref={arm} position={[-1.8, 3.6, 0]}>
        <Box p={[-3.6, 1.6, 0]} s={[8, 0.9, 0.9]} c={AMBER} r={[0, 0, -0.42]} m={0.3} />
        <Box p={[-8, 0, 0]} s={[3, 1.6, 1.8]} c={SHADE} m={0.5} />
      </group>
    </group>
  );
}

// The weighbridge deck, its little office, and the boom at the gate.
function Gatehouse({ world }) {
  const [wx, wz] = PLACES.weighbridge, [gx, gz] = PLACES.gate;
  const wy = heightAt(wx, wz), gy = heightAt(gx, gz);
  const deck = useRef(), boom = useRef(), sign = useRef();
  useFrame(() => {
    const { onDeck, truck } = world.current;
    deck.current.position.y = wy + 0.3 - onDeck * 0.22;
    const near = 1 - ramp(truck.distanceTo(new THREE.Vector3(gx, gy, gz)), 14, 30);
    boom.current.rotation.z = -near * 1.25;
    sign.current.color.setRGB(0.15 + onDeck * 0.8, 0.5 + onDeck * 0.2, 0.2 - onDeck * 0.1);
  });
  return (
    <group>
      <Box p={[wx, wy + 0.1, wz]} s={[23, 0.3, 7.2]} c={STEEL} m={0.4} />
      <group ref={deck} position={[wx, wy + 0.3, wz]}>
        <Box p={[0, 0, 0]} s={[21, 0.32, 5.6]} c={SHADE} m={0.55} rough={0.5} />
        {[-1, 1].map((side) => <Box key={side} p={[0, 0.12, side * 2.9]} s={[21, 0.18, 0.2]} c={AMBER} />)}
      </group>
      <group position={[wx + 1, wy, wz - 12]}>
        <Box p={[0, 2.2, 0]} s={[9, 4.4, 6]} c={WHITE} />
        <Box p={[0, 4.6, 0]} s={[10, 0.4, 7]} c={AMBER} />
        <Box p={[-1, 2.6, 3.05]} s={[5, 1.6, 0.1]} c="#5f8ea3" m={0.7} rough={0.2} />
        <mesh position={[3.1, 3, 3.07]}>
          <boxGeometry args={[1.5, 0.8, 0.1]} />
          <meshBasicMaterial ref={sign} />
        </mesh>
      </group>
      <group position={[gx, gy, gz]} rotation={[0, 0.34, 0]}>
        <Box p={[-7, 2, 0]} s={[1.4, 4, 1.4]} c={WHITE} />
        <Box p={[7, 2, 0]} s={[1.4, 4, 1.4]} c={WHITE} />
        <group ref={boom} position={[-7, 3.3, 0]}>
          <Box p={[7, 0, 0]} s={[14, 0.34, 0.34]} c={AMBER} />
        </group>
      </group>
    </group>
  );
}

// The thing all this stone is for: a building going up on the customer's site.
function Customer({ world }) {
  const [x, z] = PLACES.customer, y = heightAt(x, z);
  const site = useRef();
  useFrame(() => { site.current.scale.y = Math.max(0.001, ramp(world.current.s, S.dispatch - 0.3, S.payment - 0.4)); });
  const floors = [0, 1, 2, 3];
  return (
    <group ref={site} position={[x, y, z]}>
      {floors.map((f) => (
        <group key={f}>
          <Box p={[0, 0.3 + f * 4, 0]} s={[20, 0.6, 15]} c={WHITE} />
          {[[-9, -6], [9, -6], [-9, 6], [9, 6], [0, -6], [0, 6]].map(([cx, cz], i) => <Box key={i} p={[cx, 2.3 + f * 4, cz]} s={[0.7, 3.5, 0.7]} c={STEEL} />)}
        </group>
      ))}
      <Box p={[17, 15, -5]} s={[1, 30, 1]} c={AMBER} m={0.3} />
      <Box p={[6, 29, -5]} s={[34, 0.8, 0.8]} c={AMBER} m={0.3} />
    </group>
  );
}

function Trees({ count }) {
  const spots = useMemo(() => treeSpots(count), [count]);
  const crowns = useRef(), stems = useRef();
  useEffect(() => {
    const dummy = new THREE.Object3D(), tint = new THREE.Color();
    spots.forEach((t, i) => {
      dummy.position.set(t.x, t.y + t.s * 1.35, t.z);
      dummy.rotation.set(t.r * 3, t.r * 6, 0);
      dummy.scale.set(t.s * (0.85 + t.r * 0.3), t.s * 1.3, t.s * (0.85 + t.r * 0.3));
      dummy.updateMatrix();
      crowns.current.setMatrixAt(i, dummy.matrix);
      crowns.current.setColorAt(i, tint.set(t.r > 0.66 ? "#a9bb7c" : t.r > 0.33 ? "#8fac72" : "#c3c78c"));
      dummy.position.set(t.x, t.y + t.s * 0.4, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.34, t.s * 0.9, 0.34);
      dummy.updateMatrix();
      stems.current.setMatrixAt(i, dummy.matrix);
    });
    crowns.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceColor.needsUpdate = true;
    stems.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={crowns} args={[null, null, spots.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={stems} args={[null, null, spots.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 5]} />
        <meshStandardMaterial color="#8a6f55" roughness={1} />
      </instancedMesh>
    </group>
  );
}

// The load's path: drawn as far as the story has reached, with a bright bead at its head.
function Thread({ world, curve, detail }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, detail, 0.44, 6, false), [curve, detail]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uHead: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: "varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uHead; uniform float uTime; uniform float uFade; varying vec2 vU;
      void main() {
        if (vU.x > uHead) discard;
        float pulse = smoothstep(0.03, 0.0, uHead - vU.x);
        float travel = pow(0.5 + 0.5 * sin(vU.x * 160.0 - uTime * 3.0), 10.0) * 0.14;
        vec3 color = mix(vec3(0.91, 0.5, 0.05), vec3(1.0, 0.8, 0.36), pulse + travel);
        gl_FragColor = vec4(color, uFade);
      }`,
  }), []);
  const bead = useRef(), halo = useRef();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const { head, fold } = world.current;
    material.uniforms.uHead.value = head;
    material.uniforms.uFade.value = 1 - ramp(fold, 0.55, 1);
    material.uniforms.uTime.value = clock.elapsedTime;
    curve.getPointAt(clamp(head, 0, 1), v);
    bead.current.position.copy(v);
    bead.current.visible = head > 0.001 && fold < 0.5;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.14;
    halo.current.scale.setScalar(pulse);
    world.current.bead.copy(v);
  });
  return (
    <group>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
      <group ref={bead}>
        <mesh><sphereGeometry args={[1.25, 18, 14]} /><meshBasicMaterial color="#fff2cf" toneMapped={false} /></mesh>
        <mesh ref={halo}><sphereGeometry args={[2.1, 18, 14]} /><meshBasicMaterial color="#f7a51d" transparent opacity={0.3} depthWrite={false} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

// A puff of rock dust at the blast, driven by the scroll so it can be replayed by scrolling back.
function Blast({ world, count }) {
  const points = useRef(), material = useRef();
  const [x, z] = PLACES.face, base = heightAt(x, z);
  const puff = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d"), g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(), seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rand(i, 1) * Math.PI * 2, e = rand(i, 2) * 1.3, sp = 0.4 + rand(i, 3) * 0.6;
      seed.set([Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(seed, 3));
    return g;
  }, [count]);
  useFrame(() => {
    const t = clamp((world.current.s - S.production + 0.42) / 0.8);
    points.current.scale.setScalar(2 + smooth(t) * 30);
    points.current.position.set(x - 6, base + 2 + smooth(t) * 7, z - 6);
    material.current.opacity = Math.sin(t * Math.PI) * 0.72 * world.current.lift;
    points.current.visible = t > 0 && t < 1;
  });
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial ref={material} map={puff} color="#f4ead8" size={9} transparent depthWrite={false} sizeAttenuation />
    </points>
  );
}

const easeOutBack = (t) => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// The camera, the fold and the live record leader all move together here.
function Director({ story, world, relief, things, leader, heads }) {
  const { camera, pointer, size } = useThree();
  const eye = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.eye)), false, "centripetal"), []);
  const aim = useMemo(() => new THREE.CatmullRomCurve3(SHOTS.map((k) => new THREE.Vector3(...k.aim)), false, "centripetal"), []);
  const look = useMemo(() => new THREE.Vector3(), []), mark = useMemo(() => new THREE.Vector3(), []), next = useMemo(() => new THREE.Vector3(), []);
  const started = useRef(null), shift = useRef(0);
  useFrame(({ clock }, dt) => {
    const w = world.current;
    started.current ??= clock.elapsedTime;
    // Eased by time, not by frame, so a slow phone arrives in the same place as a fast laptop.
    w.s += (story.current - w.s) * (1 - Math.exp(-dt * 5));
    const s = w.s;

    const rise = clamp((clock.elapsedTime - started.current - 0.35) / 2.6);
    const fold = ramp(s, S.reconcile - 0.1, S.page - 0.12);
    w.lift = (rise <= 0 ? 0 : easeOutBack(smooth(rise))) * (1 - fold);
    relief.current.scale.y = Math.max(0.002, w.lift);
    things.current.visible = fold < 0.72;
    w.fold = fold;

    const n = SHOTS.length - 1, u = clamp(s / n);
    eye.getPoint(u, camera.position);
    aim.getPoint(u, look);
    // On a tall phone the same shot needs more distance to fit.
    const portrait = size.height > size.width ? 1 + (size.height / size.width - 1) * 0.55 : 1;
    if (portrait > 1) camera.position.sub(look).multiplyScalar(portrait).add(look);
    // The opening: straight down onto the blank page, then back to the site as it rises.
    const open = 1 - smooth(rise);
    if (open > 0) {
      next.set(-2, 372, 34);
      camera.position.lerp(next, open);
      look.lerp(next.setY(0), open);
    }
    const drift = 1 - fold;
    camera.position.x += pointer.x * 5 * drift;
    camera.position.y += pointer.y * 3 * drift;
    camera.lookAt(look);
    // A phone's card covers the bottom of the frame, so the action sits higher up the screen.
    if (portrait > 1) {
      const lift = size.height * 0.2 * ramp(s, 1, 2) * (1 - fold);
      if (Math.abs(lift - shift.current) > 0.5) {
        shift.current = lift;
        camera.setViewOffset(size.width, size.height, 0, lift, size.width, size.height);
      }
    }

    // Where the thread has reached at this point in the story.
    const f = Math.floor(clamp(s, 0, n - 0.0001)), t = s - f;
    w.head = heads[f] + (heads[f + 1] - heads[f]) * smooth(t);

    // Point the record card at the thing it's about.
    const shot = SHOTS[Math.round(clamp(s, 0, n))];
    const near = 1 - clamp(Math.abs(s - Math.round(s)) * 2.6);
    if (shot.mark && near > 0.02 && fold < 0.5) {
      mark.set(...shot.mark);
      mark.y *= Math.max(0, w.lift);
      mark.project(camera);
      leader.current?.move(((mark.x + 1) / 2) * size.width, ((1 - mark.y) / 2) * size.height, near);
    } else {
      leader.current?.move(0, 0, 0);
    }
  }, -1);
  return null;
}

export default function Scene({ story, active, mobile, leader }) {
  const world = useRef({ s: 0, lift: 0, fold: 0, head: 0, onDeck: 0, truck: new THREE.Vector3(), bead: new THREE.Vector3() });
  const relief = useRef(), things = useRef();
  const curves = useMemo(() => ({ thread: threadCurve(), road: roadCurve(), haul: haulCurve() }), []);
  // Share of the thread drawn by each moment in SHOTS.
  const heads = useMemo(() => {
    const samples = curves.thread.getSpacedPoints(600);
    const nearestTo = (x, z) => {
      let best = 0, d = Infinity;
      samples.forEach((p, i) => { const e = Math.hypot(p.x - x, p.z - z); if (e < d) { d = e; best = i; } });
      return best / 600;
    };
    const crush = nearestTo(...PLACES.hopper), pile = nearestTo(...PLACES.pileA), load = nearestTo(...PLACES.loader), weigh = nearestTo(...PLACES.weighbridge), gate = nearestTo(...PLACES.gate);
    return [0, 0, 0.01, crush, pile, pile + 0.015, load, weigh, gate, 1, 1, 1];
  }, [curves]);

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={mobile ? [1, 1.4] : [1, 1.75]}
      flat
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: mobile ? 42 : 30, near: 4, far: 2600, position: [-2, 372, 34] }}
    >
      <hemisphereLight args={["#fffaf0", "#d9c9ae", 2.1]} />
      <directionalLight color="#fff0d6" position={[-310, 280, 275]} intensity={2.3} />
      <Sheet />
      <group ref={relief}>
        <Ground cells={mobile ? 220 : 460} world={world} />
        <group ref={things}>
          <Plant />
          <Belt from={[28, heightAt(28, -40) + 5, -40]} to={[56, heightAt(56, -36) + 13, -36]} count={mobile ? 12 : 22} />
          <Belt from={[68, heightAt(68, -32) + 11, -32]} to={[83, heightAt(83, -10) + 13.5, -10]} count={mobile ? 10 : 18} />
          <Belt from={[58, heightAt(58, -28) + 7, -28]} to={[62, heightAt(62, 0) + 9, 0]} count={mobile ? 10 : 18} />
          <Belt from={[72, heightAt(72, -30) + 7, -30]} to={[96, heightAt(96, 16) + 10.5, 16]} count={mobile ? 12 : 22} />
          <Piles world={world} />
          <Excavator world={world} />
          <PitTrucks haul={curves.haul} />
          <HeroTruck world={world} road={curves.road} />
          <Gatehouse world={world} />
          <Customer world={world} />
          <Trees count={mobile ? 120 : 320} />
        </group>
        <Thread world={world} curve={curves.thread} detail={mobile ? 420 : 760} />
      </group>
      <Blast world={world} count={mobile ? 120 : 300} />
      <Director story={story} world={world} relief={relief} things={things} leader={leader} heads={heads} />
    </Canvas>
  );
}
