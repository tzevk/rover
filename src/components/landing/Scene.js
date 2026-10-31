"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// A procedural extraction site: a stepped pit cut into layered rock, stockpiles, a conveyor and
// haul vehicles. Everything is generated here, so there are no heavy model or texture downloads.

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = smooth(f), v = smooth(g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x, y) => { let a = 0.5, s = 0; for (let i = 0; i < 5; i++) { s += a * noise(x, y); x = x * 2.03 + 11; y = y * 2.03 + 7; a *= 0.5; } return s; };

const BENCHES = 8, PIT_RADIUS = 62, PIT_DEPTH = 34;
// Ground height at a point: rolling land, cut into flat benches stepping down to the pit floor.
export function heightAt(x, z) {
  const warp = (fbm(x * 0.018 + 4, z * 0.018) - 0.5) * 42;
  const r = Math.hypot(x, z * 1.25) + warp;
  const land = (fbm(x * 0.012, z * 0.012) - 0.5) * 26 + 4;
  const t = Math.min(1, Math.max(0, r / PIT_RADIUS));
  const step = Math.floor(t * BENCHES) / BENCHES;
  const riser = smooth(Math.min(1, ((t * BENCHES) % 1) / 0.3));
  const bench = step + riser / BENCHES;
  const rough = (fbm(x * 0.09, z * 0.09) - 0.5) * 1.5;
  return land * smooth(t) + (bench - 1) * PIT_DEPTH + rough * (0.4 + 0.6 * (1 - riser));
}

const MINERALS = ["#3a3835", "#57524a", "#6f675a", "#857a68", "#4a4744", "#94887a"].map((c) => new THREE.Color(c));

function Terrain({ detail, shadows }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(320, 320, detail, detail);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
      pos.setY(i, y);
      // Colour follows depth, so each cut shows the same strata all the way round.
      const band = (y + PIT_DEPTH) * 0.42 + fbm(x * 0.02, z * 0.02) * 2.4;
      const k = Math.floor(band), f = smooth(band - k);
      c.copy(MINERALS[((k % 6) + 6) % 6]).lerp(MINERALS[((k + 1) % 6 + 6) % 6], f);
      c.multiplyScalar(0.75 + fbm(x * 0.22, z * 0.22) * 0.55);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [detail]);
  const bump = useMemo(() => {
    const size = 256, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = 255 * fbm(x * 0.09, y * 0.09);
      data.set([v, v, v, 255], (y * size + x) * 4);
    }
    const t = new THREE.DataTexture(data, size, size);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(26, 26);
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow={shadows} castShadow={shadows}>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0.02} bumpMap={bump} bumpScale={1.4} />
    </mesh>
  );
}

function Stockpiles({ shadows }) {
  // A heightfield rather than a cone: no point at the top, and the sides slump unevenly.
  const piles = useMemo(() => [[-26, 6, 9, 7], [-11, 15, 7, 5], [-31, 23, 7.5, 5.5], [5, 20, 8, 6]].map(([x, z, r, h], n) => {
    const g = new THREE.PlaneGeometry(r * 2.2, r * 2.2, 70, 70);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vz = p.getZ(i), a = Math.atan2(vz, vx);
      const edge = r * (0.86 + (fbm(Math.cos(a) * 1.6 + n * 9, Math.sin(a) * 1.6) - 0.5) * 0.5);
      const t = Math.max(0, 1 - Math.hypot(vx, vz) / edge);
      p.setY(i, h * Math.pow(t, 0.9) * (1 - 0.14 * t * t) + (fbm(vx * 1.9 + n, vz * 1.9) - 0.5) * 0.45 * Math.min(1, t * 6) - 0.25);
    }
    g.computeVertexNormals();
    return { g, pos: [x, heightAt(x, z), z], color: ["#7d7468", "#5d5850", "#958a7a", "#6a6358"][n] };
  }), []);
  return piles.map((s, i) => (
    <mesh key={i} geometry={s.g} position={s.pos} castShadow={shadows} receiveShadow={shadows}>
      <meshStandardMaterial color={s.color} roughness={1} />
    </mesh>
  ));
}

// Crushing and screening plant: plain steel massing, seen from a distance.
function Plant({ shadows }) {
  const base = heightAt(-1, -11);
  const steel = "#2b2d2f", cladding = "#47494a";
  const box = (p, a, c) => <mesh position={[-1 + p[0], base + p[1], -11 + p[2]]} castShadow={shadows} receiveShadow={shadows}><boxGeometry args={a} /><meshStandardMaterial color={c} roughness={0.6} metalness={0.5} /></mesh>;
  return (
    <group>
      {box([0, 3, 0], [6, 6, 5], cladding)}
      {box([0, 7, 0], [3.6, 2.4, 3.2], steel)}
      {box([7, 2.4, 2], [7, 1.1, 3], cladding)}
      {box([7, 0.9, 2], [6, 1.8, 2.4], steel)}
      {box([-2.4, 3, -3.4], [0.4, 6, 0.4], steel)}
      {box([2.4, 3, -3.4], [0.4, 6, 0.4], steel)}
    </group>
  );
}

// Material on the belt, the only thing that moves steadily: the operation at work.
function Flow({ from, to, count }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    for (let i = 0; i < count; i++) {
      const f = (i / count + clock.elapsedTime * 0.05) % 1;
      dummy.position.lerpVectors(from, to, f);
      dummy.position.y += 0.4;
      dummy.scale.setScalar(0.5 + hash(i, 5) * 0.7);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[null, null, count]}>
      <dodecahedronGeometry args={[0.32, 0]} />
      <meshStandardMaterial color="#a39682" roughness={1} />
    </instancedMesh>
  );
}

const BELT_TOP = new THREE.Vector3(-26, heightAt(-26, 6) + 8.5, 6);
const BELT_FOOT = new THREE.Vector3(-3, heightAt(-3, -9) + 1, -9);

// A plain steel conveyor, feeding the largest stockpile.
function Conveyor({ shadows }) {
  const top = BELT_TOP, foot = BELT_FOOT;
  const mid = top.clone().add(foot).multiplyScalar(0.5);
  const len = top.distanceTo(foot);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), top.clone().sub(foot).normalize());
  const legs = [0.2, 0.45, 0.7].map((f) => foot.clone().lerp(top, f));
  const steel = <meshStandardMaterial color="#26282a" roughness={0.55} metalness={0.7} />;
  return (
    <group>
      <mesh position={mid} quaternion={q} castShadow={shadows}><boxGeometry args={[len, 0.45, 1.1]} />{steel}</mesh>
      {legs.map((p, i) => {
        const ground = heightAt(p.x, p.z), h = p.y - ground;
        return <mesh key={i} position={[p.x, ground + h / 2, p.z]} castShadow={shadows}><boxGeometry args={[0.28, h, 0.9]} />{steel}</mesh>;
      })}
    </group>
  );
}

// Haul vehicles working a loop round the pit. Small and far off, as they'd be seen from the rim.
function Trucks() {
  const refs = useRef([]);
  const count = 4;
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const a = clock.elapsedTime * 0.035 + (i / count) * Math.PI * 2;
      const r = 26 + Math.sin(a * 2 + i) * 4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
      g.position.set(x, heightAt(x, z) + 0.75, z);
      g.rotation.y = -a;
    });
  });
  return Array.from({ length: count }, (_, i) => (
    <group key={i} ref={(el) => { refs.current[i] = el; }}>
      <mesh position={[0, 0.45, 0.6]}><boxGeometry args={[1.5, 1.1, 2.3]} /><meshStandardMaterial color="#8a6a2e" roughness={0.6} metalness={0.3} /></mesh>
      <mesh position={[0, 0.5, -1.05]}><boxGeometry args={[1.4, 1.1, 1]} /><meshStandardMaterial color="#c8c2b4" roughness={0.5} /></mesh>
      <mesh position={[0, 0.4, -1.6]}><boxGeometry args={[1, 0.18, 0.08]} /><meshBasicMaterial color="#ffd9a0" toneMapped={false} /></mesh>
    </group>
  ));
}

function Dust({ count }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) p.set([(hash(i, 1) - 0.5) * 150, hash(i, 2) * 34 - 24, (hash(i, 3) - 0.5) * 150], i * 3);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  useFrame(({ clock }) => { ref.current.rotation.y = clock.elapsedTime * 0.006; ref.current.position.y = Math.sin(clock.elapsedTime * 0.1) * 0.8; });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#d8c6a6" size={0.34} transparent opacity={0.42} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// Where the camera stands for each chapter. Order: opening, material, process, movement, business, people.
const POS = [[0, 62, 150], [-96, 34, 70], [-46, 8, 38], [12, -14, 44], [58, 22, 58], [0, 118, 66]];
const AIM = [[0, -8, 0], [-4, -20, 0], [-14, -30, 2], [-22, -31, 10], [-4, -26, 0], [0, -28, -2]];
const path = new THREE.CatmullRomCurve3(POS.map((p) => new THREE.Vector3(...p)));
const aims = new THREE.CatmullRomCurve3(AIM.map((p) => new THREE.Vector3(...p)));

function Rig({ progress, sunRef }) {
  const { camera, pointer } = useThree();
  const eased = useRef(progress.current);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    eased.current += (progress.current - eased.current) * 0.07;
    const t = eased.current;
    path.getPoint(t, camera.position);
    aims.getPoint(t, look);
    camera.position.x += pointer.x * 1.4;
    camera.position.y += pointer.y * 0.8;
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 7); // never through the ground
    camera.lookAt(look);
    // Low morning light swings round, so the rock faces change as the story moves.
    const a = 0.9 + t * 2.1;
    sunRef.current.position.set(Math.cos(a) * 120, 34 + Math.sin(t * Math.PI) * 44, Math.sin(a) * 120);
    sunRef.current.intensity = 3.1 - t * 1.1;
  });
  return null;
}

export default function Scene({ progress, active, mobile }) {
  const sun = useRef();
  const shadows = !mobile;
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={mobile ? [1, 1.25] : [1, 1.6]}
      shadows={shadows}
      gl={{ antialias: !mobile, powerPreference: "high-performance" }}
      camera={{ fov: mobile ? 56 : 40, near: 1, far: 460, position: POS[0] }}
    >
      <color attach="background" args={["#14130f"]} />
      <fog attach="fog" args={["#1b1915", 90, 300]} />
      <hemisphereLight args={["#a7a59e", "#1a1712", 0.5]} />
      <directionalLight
        ref={sun} color="#ffd6a3" position={[80, 50, 80]} intensity={3} castShadow={shadows}
        shadow-mapSize={[1536, 1536]} shadow-camera-left={-130} shadow-camera-right={130}
        shadow-camera-top={130} shadow-camera-bottom={-130} shadow-camera-far={340} shadow-bias={-0.0006}
      />
      <Terrain detail={mobile ? 170 : 300} shadows={shadows} />
      <Stockpiles shadows={shadows} />
      <Conveyor shadows={shadows} />
      <Plant shadows={shadows} />
      <Flow from={BELT_FOOT} to={BELT_TOP} count={mobile ? 18 : 36} />
      <Trucks />
      <Dust count={mobile ? 160 : 460} />
      <Rig progress={progress} sunRef={sun} />
    </Canvas>
  );
}
