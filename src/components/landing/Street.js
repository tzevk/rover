import * as THREE from "three";
import { bakeSurface, blurred, canvasTexture, makeCanvas, paintAwning, paintInterior, paintSign, SHUTTER } from "./paint";
import { clamp, lerp, rand } from "./day";

// The shop from the street, straight on: a shutter in a limewashed wall, garland over it, sun coming
// in low across the road. The visitor's name is painted on the shutter and they lift it by hand.
const DOOR = { width: 320, height: 250, travel: 232 };
const VIEW = { height: 392, centre: 152, fov: 24 };

const LEAF_SHADE = /* glsl */ `
  float shadeHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float shadeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(shadeHash(i), shadeHash(i + vec2(1, 0)), u.x), mix(shadeHash(i + vec2(0, 1)), shadeHash(i + vec2(1, 1)), u.x), u.y);
  }
  float leafShade(vec2 p, float t) {
    float a = shadeNoise(p * 0.03 + vec2(t * 0.07, t * 0.04)) * 0.55 + shadeNoise(p * 0.08 - vec2(t * 0.1, 0.0)) * 0.3 + shadeNoise(p * 0.19 + t * 0.1) * 0.15;
    float reach = smoothstep(160.0, 620.0, p.x + p.y * 0.5);
    return mix(1.0, 0.86, smoothstep(0.46, 0.54, a) * reach);
  }
`;

// Trees across the road throw moving shade on anything that uses this.
function dappled(material, time, extra) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    extra?.uniforms(shader);
    shader.vertexShader = `varying vec3 vSpot;\n${shader.vertexShader}`.replace("#include <project_vertex>", "#include <project_vertex>\n vSpot = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    let fragment = `uniform float uTime; varying vec3 vSpot; ${LEAF_SHADE}\n${shader.fragmentShader}`;
    if (extra) fragment = extra.fragment(fragment);
    shader.fragmentShader = fragment.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n gl_FragColor.rgb *= leafShade(vSpot.xy, uTime);");
  };
  return material;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function wallGeometry() {
  const s = new THREE.Shape();
  const hw = DOOR.width / 2;
  s.moveTo(-600, 0); s.lineTo(-hw, 0); s.lineTo(-hw, DOOR.height); s.lineTo(hw, DOOR.height); s.lineTo(hw, 0);
  s.lineTo(600, 0); s.lineTo(600, 560); s.lineTo(-600, 560); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 600) / 1200, p.getY(i) / 560);
  return g;
}

function flowerGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), b = Math.acos(clamp(v.y / v.length(), -1, 1));
    v.multiplyScalar(1 + 0.2 * Math.sin(a * 7) * Math.sin(b * 6));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Marigolds strung across the top of the door, hanging in swags, with mango leaves at the joins.
function makeGarland() {
  const group = new THREE.Group();
  const swags = 5, each = 13, count = swags * each;
  const flowers = new THREE.InstancedMesh(flowerGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.72, flatShading: true }), count);
  flowers.castShadow = true;
  const orange = new THREE.Color("#f07f13"), yellow = new THREE.Color("#fbb42a");
  const spots = [];
  const left = -DOOR.width / 2 + 6, span = (DOOR.width - 12) / swags;
  for (let s = 0; s < swags; s++) {
    for (let i = 0; i < each; i++) {
      const k = (i + 0.5) / each;
      spots.push({ x: left + (s + k) * span, y: DOOR.height - 4 - Math.sin(k * Math.PI) * 25, size: 3.5 + rand(i, s) * 0.8, phase: rand(s, i) * 6 });
      flowers.setColorAt(s * each + i, (i + s) % 3 === 2 ? yellow : orange);
    }
  }
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(5, -9, 0, -22);
  leafShape.quadraticCurveTo(-5, -9, 0, 0);
  const leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), new THREE.MeshStandardMaterial({ color: "#4e8440", roughness: 0.6, side: THREE.DoubleSide }), (swags + 1) * 3);
  leaves.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let s = 0; s <= swags; s++) {
    for (let i = 0; i < 3; i++) {
      e.set(0.1, 0, (i - 1) * 0.42);
      m.compose(new THREE.Vector3(left + s * span, DOOR.height - 4, 0.5), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(s * 3 + i, m);
    }
  }
  group.add(flowers, leaves);
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), at = new THREE.Vector3(), scale = new THREE.Vector3();
  const sway = (time, strength) => {
    spots.forEach((f, i) => {
      const swing = Math.sin(time * 1.1 + i * 0.14) * 1.1 * strength * (1 + Math.sin(f.phase) * 0.2);
      at.set(f.x + swing * 0.5, f.y + Math.cos(time * 0.9 + f.phase) * 0.25, Math.sin(time * 0.8 + f.phase) * 0.8);
      turn.setFromEuler(e.set(f.phase, f.phase * 2, 0));
      matrix.compose(at, turn, scale.setScalar(f.size));
      flowers.setMatrixAt(i, matrix);
    });
    flowers.instanceMatrix.needsUpdate = true;
  };
  sway(0, 1);
  group.position.z = 16;
  return { group, sway };
}

function makeLock(steel) {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: "#c79a3b", metalness: 0.9, roughness: 0.34 });
  const body = box(17, 14, 6, brass);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(5, 1.2, 10, 20, Math.PI), steel);
  shackle.position.y = 7;
  shackle.castShadow = true;
  group.add(body, shackle);
  return group;
}

export function buildStreet(gl, { mobile, fonts, time }) {
  const group = new THREE.Group();
  const size = mobile ? 1536 : 2048;
  const steel = bakeSurface(gl, "shutter", size), wall = bakeSurface(gl, "wall", size), stone = bakeSurface(gl, "stone", 1024);

  const signCanvas = makeCanvas(mobile ? 1280 : 1800, Math.round((mobile ? 1280 : 1800) * (SHUTTER.height / SHUTTER.width)));
  const signTexture = canvasTexture(signCanvas, gl);

  const shutterMaterial = dappled(new THREE.MeshStandardMaterial({ map: steel.color, bumpMap: steel.detail, bumpScale: 2.6, roughnessMap: steel.detail, metalnessMap: steel.detail, roughness: 1, metalness: 1, envMapIntensity: 0.32 }), time, {
    uniforms: (shader) => { shader.uniforms.uSign = { value: signTexture }; },
    fragment: (text) => `uniform sampler2D uSign;\n${text}`.replace("#include <map_fragment>", `#include <map_fragment>
      vec4 signPaint = texture2D(uSign, vMapUv);
      signPaint.a *= smoothstep(0.08, 0.36, texture2D(bumpMap, vMapUv).r);
      diffuseColor.rgb = mix(diffuseColor.rgb, signPaint.rgb, signPaint.a);`),
  });
  shutterMaterial.customProgramCacheKey = () => "shutter";
  const wallMaterial = dappled(new THREE.MeshStandardMaterial({ map: wall.color, bumpMap: wall.detail, bumpScale: 1.4, roughness: 0.94, envMapIntensity: 0.4 }), time);
  wallMaterial.customProgramCacheKey = () => "wall";

  const front = new THREE.Mesh(wallGeometry(), wallMaterial);
  front.receiveShadow = true;
  group.add(front);

  // A cloth awning over the door, sun-faded, with a scalloped edge that throws its shadow on the shutter.
  const cloth = paintAwning(1024, 512);
  const clothTexture = canvasTexture(cloth.top, gl), edgeTexture = canvasTexture(cloth.edge, gl);
  const awningMaterial = new THREE.MeshStandardMaterial({ map: clothTexture, roughness: 0.86, side: THREE.DoubleSide });
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.width + 64, 76), awningMaterial);
  awning.position.set(0, DOOR.height + 30, 33);
  awning.rotation.x = -Math.PI / 2 + 0.56;
  awning.castShadow = true;
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.width + 64, 20), new THREE.MeshStandardMaterial({ map: edgeTexture, roughness: 0.86, alphaTest: 0.5, side: THREE.DoubleSide }));
  edge.position.set(0, DOOR.height + 0.5, 64.5);
  edge.castShadow = true;
  const trim = new THREE.MeshStandardMaterial({ color: "#f7ebcf", roughness: 0.7 });
  const sill = box(DOOR.width + 16, 4, 10, trim);
  sill.position.set(0, DOOR.height + 2, 4);
  group.add(awning, edge, sill);

  const dark = new THREE.MeshStandardMaterial({ color: "#5a6a66", metalness: 0.55, roughness: 0.46 });
  [-1, 1].forEach((side) => {
    const guide = box(9, DOOR.height, 12, dark);
    guide.position.set(side * (DOOR.width / 2 - 2), DOOR.height / 2, -4);
    group.add(guide);
  });

  const door = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SHUTTER.width, SHUTTER.height), shutterMaterial);
  panel.position.set(0, SHUTTER.height / 2, -8);
  panel.castShadow = panel.receiveShadow = true;
  door.add(panel);
  const bar = box(DOOR.width, 8, 6, dark);
  bar.position.set(0, 4, -5);
  const grip = box(58, 3, 3, trim);
  grip.material = new THREE.MeshStandardMaterial({ color: "#c9cdc6", metalness: 0.9, roughness: 0.3 });
  grip.position.set(0, 13, 2);
  const postA = box(3, 13, 7, grip.material), postB = box(3, 13, 7, grip.material);
  postA.position.set(-27, 12, -1);
  postB.position.set(27, 12, -1);
  door.add(bar, grip, postA, postB);
  group.add(door);

  const lock = makeLock(grip.material);
  lock.position.set(0, 5, 0);
  group.add(lock);

  const room = blurred(gl, paintInterior(1024, 768), 2.4);
  const interior = new THREE.Mesh(new THREE.PlaneGeometry(360, 270), new THREE.MeshBasicMaterial({ map: room }));
  interior.position.set(0, 135, -150);
  const inside = new THREE.MeshBasicMaterial({ color: "#f3cf98", side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(360, 150), new THREE.MeshBasicMaterial({ color: "#e9c28b" }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.2, -80);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(360, 150), inside);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, DOOR.height + 10, -80);
  const glow = new THREE.Group();
  glow.add(interior, floor, ceiling);
  group.add(glow);

  const groundMaterial = new THREE.MeshStandardMaterial({ map: stone.color, bumpMap: stone.detail, bumpScale: 1.2, roughness: 0.95, envMapIntensity: 0.4 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 300), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -8, 150);
  ground.receiveShadow = true;
  const step = box(DOOR.width + 40, 8, 34, new THREE.MeshStandardMaterial({ color: "#d7cdbb", roughness: 0.9 }));
  step.position.set(0, -4, 12);
  group.add(ground, step);

  const garland = makeGarland();
  group.add(garland.group);

  const look = new THREE.Vector3(), lean = { x: 0, y: 0 };
  const street = {
    group,
    lockDrop: 0,
    signWidth: 320,
    paint(name, tag, chalk) {
      paintSign(signCanvas, fonts, { name, tag, chalk, width: street.signWidth, at: street.side ? 150 : 176 });
      signTexture.needsUpdate = true;
    },
    // The whole front fills the height of the screen, so a phone sees the middle of the shutter.
    frame(camera, size, pointer, push, dt, shake) {
      const aspect = size.width / size.height;
      const distance = (VIEW.height / 2) / Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));
      const seen = VIEW.height * aspect;
      if (Math.abs(street.seen - seen) > 1 || !street.seen) {
        street.seen = seen;
        street.signWidth = seen;
        street.side = size.width >= 1100 && aspect >= 1.5;   // room for the notice on the wall
        street.onWidth?.();
      }
      const shift = street.side ? seen * -0.12 : 0;
      lean.x += (pointer.x - lean.x) * (1 - Math.exp(-dt * 2.4));
      lean.y += (pointer.y - lean.y) * (1 - Math.exp(-dt * 2.4));
      if (camera.fov !== VIEW.fov) { camera.fov = VIEW.fov; camera.updateProjectionMatrix(); }
      camera.position.set(lerp(shift, 0, push) + lean.x * 9, VIEW.centre + lean.y * 5 + shake * 1.6, lerp(distance, distance * 0.3, push));
      look.set(lerp(shift, 0, push), VIEW.centre + 30 * push, -40);
      camera.lookAt(look);
    },
    update(lift, duskness, dt, t, sway) {
      door.position.y = lift * DOOR.travel;
      if (lift > 0.004 && street.lockDrop === 0) street.lockDrop = 0.0001;
      if (street.lockDrop > 0) {
        street.lockDrop = Math.min(1, street.lockDrop + dt * 2.6);
        lock.position.y = 5 - 9 * street.lockDrop * street.lockDrop;
        lock.rotation.z = street.lockDrop * 0.9;
      }
      garland.sway(t, sway);
      interior.material.color.setScalar(lerp(0.9, 1.08, lift));
    },
    resetLock() { street.lockDrop = 0; lock.position.y = 5; lock.rotation.z = 0; },
    size: DOOR,
  };
  return street;
}
