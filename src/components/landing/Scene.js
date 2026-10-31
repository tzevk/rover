"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCounter } from "./Counter";
import { buildStreet } from "./Street";
import { lerp, sunAt, viewPose } from "./day";
import { loadFonts } from "./paint";

const time = { value: 0 };

// Lowers the resolution if frames run long, and brings it back when there's headroom.
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

// One set is on stage at a time: the street, or the counter from the owner's chair.
function Stage({ run, mobile, lang, maxDpr }) {
  const { gl, scene, camera, size } = useThree();
  const steady = useSteadyFrames(maxDpr);
  const sets = useRef({});
  const light = useRef(null);
  const fill = useRef(null);
  const moving = useRef({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), aim: new THREE.Vector3(), aimVel: new THREE.Vector3() });
  const pose = useRef({ eye: [0, 0, 0], aim: [0, 0, 0] });

  useEffect(() => {
    let gone = false;
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.04).texture;
    scene.environment = map;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
    (async () => {
      const fonts = await loadFonts(lang);
      if (gone) return;
      const r = run.current;
      const street = buildStreet(gl, { mobile, fonts, time });
      street.onWidth = () => r.repaint?.();
      scene.add(street.group);
      sets.current.street = street;
      r.repaint = () => street.paint(r.name, r.tag, r.chalk);
      r.repaint();
      r.reset = () => { street.resetLock(); sets.current.counter?.reset(); };
      scene.add(light.current.target);
      r.ready = true;
      r.onReady?.();
      // The counter is heavier, so it's built once the street is on screen.
      await new Promise((go) => setTimeout(go, 60));
      if (gone) return;
      const counter = buildCounter(gl, { mobile, fonts, lang, run });
      counter.group.visible = false;
      r.prepareDay = () => counter.prepare(r.values);
      scene.add(counter.group);
      sets.current.counter = counter;
    })();
    return () => { gone = true; scene.environment = null; map.dispose(); };
  }, [gl, scene, run, mobile, lang]);

  useEffect(() => {
    const r = run.current;
    const ray = new THREE.Raycaster(), desk = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), spot = new THREE.Vector2(), hit = new THREE.Vector3();
    r.input = (kind, x, y) => {
      if (r.stage !== "counter") return;
      spot.set(x, y);
      ray.setFromCamera(spot, camera);
      if (ray.ray.intersectPlane(desk, hit)) sets.current.counter?.input(kind, hit);
    };
    r.toScreen = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height }; };
    return () => { r.input = null; };
  }, [camera, run, size]);

  const sun = useRef({});
  useFrame(({ clock }, delta) => {
    const r = run.current, dt = Math.min(delta, 0.05);
    const { street, counter } = sets.current;
    if (!street) return;
    time.value = clock.elapsedTime;
    steady(delta);
    r.tick?.(dt);
    const inside = r.stage === "counter" && counter;
    street.group.visible = !inside;
    if (counter) counter.group.visible = Boolean(inside);
    const l = light.current, f = fill.current;

    if (!inside) {
      const d = r.dusk;
      street.frame(camera, size, r.pointer, r.push, dt, r.shake > 0 ? r.shake * Math.sin(clock.elapsedTime * 70) : 0);
      r.shake = Math.max(0, r.shake - dt * 4);
      street.update(r.lift, d, dt, clock.elapsedTime, 1);
      l.position.set(lerp(-430, 560, d), lerp(560, 300, d), lerp(620, 640, d));
      l.target.position.set(0, 130, 0);
      l.color.setRGB(1, lerp(0.93, 0.64, d), lerp(0.78, 0.36, d));
      l.intensity = lerp(2.25, 2.1, d);
      f.intensity = lerp(1.05, 0.95, d);
      f.color.setRGB(1, lerp(0.97, 0.86, d), lerp(0.9, 0.72, d));
      scene.environmentIntensity = 0.3;
      return;
    }

    counter.update(dt, clock.elapsedTime);
    const s = sunAt(r.t, sun.current);
    l.position.set(s.x * 760, s.y * 760, s.z * 760 - 60);
    l.target.position.set(0, 0, -60);
    l.color.setRGB(s.r, s.g, s.b);
    l.intensity = s.power;
    f.intensity = lerp(1.5, 1.3, s.evening);
    f.color.setRGB(1, lerp(0.96, 0.88, s.evening), lerp(0.88, 0.76, s.evening));
    scene.environmentIntensity = 0.42;

    // A critically damped spring, so the camera eases in as well as out.
    const view = viewPose(r.view, size.width / size.height, pose.current), m = moving.current;
    if (r.cut) { m.pos.set(...view.eye); m.aim.set(...view.aim); m.vel.set(0, 0, 0); m.aimVel.set(0, 0, 0); r.cut = false; }
    const stiff = 15, damp = 2 * Math.sqrt(stiff);
    const follow = (p, v, tx, ty, tz) => {
      v.x += ((tx - p.x) * stiff - v.x * damp) * dt;
      v.y += ((ty - p.y) * stiff - v.y * damp) * dt;
      v.z += ((tz - p.z) * stiff - v.z * damp) * dt;
      p.addScaledVector(v, dt);
    };
    follow(m.aim, m.aimVel, ...view.aim);
    follow(m.pos, m.vel, ...view.eye);
    if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); }
    const shake = r.shake > 0 ? r.shake * Math.sin(clock.elapsedTime * 80) : 0;
    r.shake = Math.max(0, r.shake - dt * 5);
    camera.position.set(m.pos.x + r.pointer.x * 5, m.pos.y + shake * 1.4, m.pos.z - r.pointer.y * 4);
    camera.lookAt(m.aim);
  }, -1);

  return (
    <>
      <hemisphereLight ref={fill} args={["#fff4e0", "#d9b98f", 1.1]} />
      <directionalLight
        ref={light} castShadow
        shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-470} shadow-camera-right={470}
        shadow-camera-top={420} shadow-camera-bottom={-420} shadow-camera-near={40} shadow-camera-far={1700}
        shadow-radius={5} shadow-bias={-0.00035} shadow-normalBias={0.4}
      >
      </directionalLight>
    </>
  );
}

export default function Scene({ run, mobile, lang, active }) {
  const maxDpr = mobile ? 1.35 : 1.6;
  return (
    <Canvas
      frameloop={active ? "always" : "never"} dpr={maxDpr} flat shadows="percentage"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 24, near: 10, far: 3200, position: [0, 150, 900] }}
    >
      <color attach="background" args={["#f6e6c8"]} />
      <Stage run={run} mobile={mobile} lang={lang} maxDpr={maxDpr} />
    </Canvas>
  );
}
