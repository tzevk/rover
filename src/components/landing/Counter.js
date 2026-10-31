import * as THREE from "three";
import { bakeSurface, blurred, canvasTexture, INK, makeCanvas, paintArm, paintPerson, paintRoom, paintStreet, paintTempo, paper, stampMark } from "./paint";
import { BEATS, cashAt, clamp, clockLabel, DESK, digits, enters, leaves, lerp, MONEY, number, ramp, rand, rupees, smooth, sunAt, TAKEN, TAX } from "./day";
import { fill, STORY } from "./story";

// The counter from the owner's chair, with the door and the street beyond. Every position here is
// worked out from run.t, so dragging the sun back really does put the day back. What the visitor did
// (ticks, stamps, their signature) stays on the paper, because that part doesn't need undoing.
const SHEET = { width: 760, height: 940 };
const SLIP = { width: 130, height: 160 };
const SPOT = { x: DESK.slip[0], z: DESK.slip[1], y: 1.4 };
const BOX = { width: 104, depth: 74, height: 19 };
const STUB = 0.17;                    // the share of the challan that stays on the pad

const tick = (ctx, x, y) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - 24, y - 4);
  ctx.lineTo(x - 6, y + 20);
  ctx.lineTo(x + 34, y - 34);
  ctx.stroke();
};

function drawHeader(ctx, fonts, name, title, number) {
  ctx.textAlign = "left";
  ctx.fillStyle = "#9a2c18";
  let size = 50;
  ctx.font = `400 ${size}px ${fonts.sign}`;
  while (ctx.measureText(name).width > 660 && size > 26) { size -= 2; ctx.font = `400 ${size}px ${fonts.sign}`; }
  ctx.fillText(name, 48, 92);
  ctx.fillStyle = "#3a3a44";
  ctx.font = `600 27px ${fonts.text}`;
  ctx.fillText(title, 48, 136);
  ctx.textAlign = "right";
  ctx.fillText(number ?? "", 712, 136);
  ctx.textAlign = "left";
  ctx.fillRect(48, 156, 664, 3);
}

function drawRow(ctx, fonts, label, value, y) {
  ctx.fillStyle = "#6a6a70";
  ctx.font = `500 25px ${fonts.text}`;
  ctx.fillText(label, 48, y);
  ctx.fillStyle = "rgba(60, 60, 80, 0.3)";
  ctx.fillRect(48, y + 12, 664, 2);
  ctx.fillStyle = INK;
  ctx.font = `400 42px ${fonts.hand}`;
  ctx.textAlign = "right";
  ctx.fillText(value, 712, y + 2);
  ctx.textAlign = "left";
}

function flatSheet(width, depth, bend = 0.7) {
  const g = new THREE.PlaneGeometry(width, depth, 10, 12);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / width, z = p.getZ(i) / depth;
    p.setY(i, bend * (x * x + z * z * 0.6) * (1 + Math.sin(x * 9 + z * 5) * 0.2));
  }
  g.computeVertexNormals();
  return g;
}

function mesh(geometry, material, cast = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function roundedBlock(width, depth, height, radius) {
  const s = new THREE.Shape(), w = width / 2, d = depth / 2, r = radius;
  s.moveTo(-w + r, -d);
  s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r);
  s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r);
  s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
  const g = new THREE.ExtrudeGeometry(s, { depth: height - 0.8, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export function buildCounter(gl, { mobile, fonts, lang, run: shared }) {
  const words = STORY[lang], w = words.slips, run = shared.current;
  const group = new THREE.Group();
  const quality = mobile ? 0.72 : 1;
  const sheetW = Math.round(SHEET.width * quality), sheetH = Math.round(SHEET.height * quality);

  // The counter top: teak under glass, catching the door in its shine.
  const wood = bakeSurface(gl, "wood", mobile ? 1536 : 2048);
  const top = mesh(new THREE.PlaneGeometry(960, 560), new THREE.MeshPhysicalMaterial({ map: wood.color, bumpMap: wood.detail, bumpScale: 0.5, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.34, envMapIntensity: 0.5 }), false);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, 0, 80);
  group.add(top);

  // Beyond it, the room and the street: slightly out of focus, as they are when you're reading.
  const backdropMaterial = (texture, extra) => new THREE.MeshBasicMaterial({ map: texture, transparent: true, premultipliedAlpha: true, depthWrite: false, ...extra });
  const streetLayer = new THREE.Mesh(new THREE.PlaneGeometry(1500, 620), new THREE.MeshBasicMaterial({ map: blurred(gl, paintStreet(1280, 530), 2) }));
  streetLayer.position.set(0, 190, -660);
  const roomMap = blurred(gl, paintRoom(1536, 640), 2);
  const roomLayer = new THREE.Mesh(new THREE.PlaneGeometry(1700, 720), backdropMaterial(roomMap));
  roomLayer.position.set(0, 220, -520);
  group.add(streetLayer, roomLayer);

  const tempo = new THREE.Mesh(new THREE.PlaneGeometry(330, 165), backdropMaterial(blurred(gl, paintTempo(512, 256), 1.4)));
  tempo.position.set(800, 94, -610);
  group.add(tempo);
  const walkers = ["#3f8f8a", "#d9472b", "#efe3c8", "#e8940c"].map((colour, i) => {
    const person = new THREE.Mesh(new THREE.PlaneGeometry(64, 180), backdropMaterial(blurred(gl, paintPerson(128, 360, colour), 2.8)));
    person.position.set(0, 96, -640 + i * 6);
    person.userData = { speed: 2.1 + i * 0.7, offset: i * 330, sign: i % 2 ? 1 : -1 };
    group.add(person);
    return person;
  });

  // Invisible walls round the door, so the sun comes in as a shape that crosses the counter.
  const blocker = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  [[-690, 300, 900, 1000], [690, 300, 900, 1000], [0, 880, 2400, 1000]].forEach(([x, y, width, height]) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), blocker);
    wall.position.set(x, y, -430);
    wall.castShadow = true;
    group.add(wall);
  });

  // The day book: the red cloth ledger every shop keeps.
  const pageW = 1600, pageH = 1000, rowTop = 196, rowGap = 74;
  const bookPaper = makeCanvas(pageW, pageH), bookInk = makeCanvas(pageW, pageH);
  const bookPaperTexture = canvasTexture(bookPaper, gl), bookInkTexture = canvasTexture(bookInk, gl);
  const shown = { value: 1 };
  const pageMaterial = new THREE.MeshStandardMaterial({ map: bookPaperTexture, roughness: 0.9, envMapIntensity: 0.3 });
  pageMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uInk = { value: bookInkTexture };
    shader.uniforms.uShown = shown;
    shader.fragmentShader = `uniform sampler2D uInk; uniform float uShown;\n${shader.fragmentShader}`.replace("#include <map_fragment>", `#include <map_fragment>
      vec4 written = texture2D(uInk, vMapUv);
      float row = floor(((1.0 - vMapUv.y) * ${pageH.toFixed(1)} - ${(rowTop - 44).toFixed(1)}) / ${rowGap.toFixed(1)});
      float reached = row + step(0.5, vMapUv.x) * 9.0 + fract(vMapUv.x * 2.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, written.rgb, written.a * smoothstep(0.0, 0.04, uShown - reached));`);
  };
  const book = new THREE.Group();
  const cover = mesh(roundedBlock(216, 152, 3, 3), new THREE.MeshStandardMaterial({ color: "#a32a1c", roughness: 0.8 }));
  const block = mesh(roundedBlock(208, 144, 5, 1.5), new THREE.MeshStandardMaterial({ color: "#f3ead6", roughness: 0.9 }));
  block.position.y = 3;
  const page = mesh(flatSheet(208, 144, -1.4), pageMaterial, false);
  page.position.y = 9.2;
  book.add(cover, block, page);
  book.position.set(DESK.register[0], 0, DESK.register[1]);
  book.rotation.y = -0.05;
  group.add(book);

  function drawBook(v) {
    const c = bookPaper.getContext("2d");
    paper(c, pageW, pageH, "#f8f0dc");
    for (let i = 0; i < 11; i++) {
      c.fillStyle = "rgba(70, 110, 150, 0.32)";
      c.fillRect(30, rowTop + 16 + i * rowGap, pageW - 60, 2);
    }
    c.fillStyle = "rgba(190, 60, 50, 0.6)";
    [176, 980, 1000].forEach((x) => c.fillRect(x, 0, 3, pageH));
    c.fillRect(30, rowTop - 62, pageW - 60, 3);
    c.fillStyle = "#3a3a44";
    c.font = `600 30px ${fonts.text}`;
    c.fillText(w.time, 44, rowTop - 78);
    c.fillText(w.details, 196, rowTop - 78);
    c.fillText(w.register, 1020, rowTop - 78);
    const spine = c.createLinearGradient(pageW / 2 - 90, 0, pageW / 2 + 90, 0);
    spine.addColorStop(0, "rgba(90, 60, 30, 0)");
    spine.addColorStop(0.5, "rgba(90, 60, 30, 0.42)");
    spine.addColorStop(1, "rgba(90, 60, 30, 0)");
    c.fillStyle = spine;
    c.fillRect(pageW / 2 - 90, 0, 180, pageH);
    bookPaperTexture.needsUpdate = true;

    const n = bookInk.getContext("2d");
    n.clearRect(0, 0, pageW, pageH);
    n.fillStyle = INK;
    const row = (i, time, text, amount, right = 0) => {
      const y = rowTop + i * rowGap;
      n.font = `400 36px ${fonts.hand}`;
      n.textAlign = "left";
      if (time) n.fillText(time, right + 40, y);
      n.fillText(text, right + (right ? 40 : 196), y);
      n.textAlign = "right";
      if (amount) n.fillText(amount, right + 770, y);
    };
    const l = w.lines, at = (t) => clockLabel(t, lang).replace(/ ?[ap]m$/, "");
    row(0, "", w.opening, rupees(MONEY.opening, lang));
    row(1, at(5), l.staff);
    row(2, at(40), fill(l.order, v));
    row(3, at(135), fill(l.made, v));
    row(4, at(250), l.challan);
    row(5, at(251), fill(l.invoice, v), rupees(TAX.total, lang));
    row(6, at(390), fill(l.received, v), `+ ${rupees(MONEY.received, lang)}`);
    row(7, at(430), l.tea, `- ${rupees(MONEY.tea, lang)}`);
    row(0, "", w.opening, rupees(MONEY.opening, lang), 810);
    row(1, "", "+", rupees(MONEY.received, lang), 810);
    row(2, "", "-", rupees(MONEY.tea, lang), 810);
    row(3, "", w.should, rupees(MONEY.book, lang), 810);
    bookInkTexture.needsUpdate = true;
  }
  const lines = [[5.3, 9.5], [40.3, 44.5], [135.3, 139.5], [250.1, 250.9], [254.3, 258.5], [390.3, 394.5], [430.3, 434.5]];
  function linesAt(t) {
    let sum = 1;
    lines.forEach(([a, b]) => { sum += ramp(t, a, b); });
    return t > 584 ? 9 + 4 * ramp(t, 584, 589) : sum;
  }

  // Paper that arrives at the counter. Each one has a canvas, because things get written on it.
  const paperSheet = (colour) => {
    const canvas = makeCanvas(sheetW, sheetH), ctx = canvas.getContext("2d");
    ctx.scale(quality, quality);
    const texture = canvasTexture(canvas, gl);
    return { canvas, ctx, texture, colour };
  };
  const sheets = { staff: paperSheet("#fbf5e4"), order: paperSheet("#fff9e8"), made: paperSheet("#fbe9e4"), delivery: paperSheet("#f9dfe4"), invoice: paperSheet("#fdf2c4") };
  const sheetMaterial = (sheet) => new THREE.MeshStandardMaterial({ map: sheet.texture, roughness: 0.92, envMapIntensity: 0.3, side: THREE.DoubleSide });
  const slips = {};
  ["staff", "order", "made", "invoice"].forEach((id) => {
    const m = mesh(flatSheet(SLIP.width, SLIP.height), sheetMaterial(sheets[id]));
    m.visible = false;
    group.add(m);
    slips[id] = m;
  });
  // The challan tears along its perforation: the stub stays, the body goes with the driver.
  const stubGeometry = new THREE.PlaneGeometry(SLIP.width, SLIP.height * STUB);
  stubGeometry.rotateX(-Math.PI / 2);
  const bodyGeometry = new THREE.PlaneGeometry(SLIP.width, SLIP.height * (1 - STUB));
  bodyGeometry.rotateX(-Math.PI / 2);
  bodyGeometry.translate(-SLIP.width / 2, 0, (SLIP.height * (1 - STUB)) / 2);
  const remap = (g, v0, v1) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, lerp(v0, v1, uv.getY(i))); };
  remap(stubGeometry, 1 - STUB, 1);
  remap(bodyGeometry, 0, 1 - STUB);
  const deliveryMaterial = sheetMaterial(sheets.delivery);
  const stub = mesh(stubGeometry, deliveryMaterial), body = mesh(bodyGeometry, deliveryMaterial);
  stub.visible = body.visible = false;
  group.add(stub, body);

  function drawSheets(v) {
    const s = sheets;
    let c = s.staff.ctx;
    paper(c, SHEET.width, SHEET.height, s.staff.colour);
    drawHeader(c, fonts, v.name, w.attendance, clockLabel(5, lang));
    [...words.workers, w.absentName].forEach((who, i) => {
      const y = 280 + i * 142;
      c.fillStyle = INK;
      c.font = `400 54px ${fonts.hand}`;
      c.fillText(who, 60, y + 16);
      c.fillStyle = "rgba(60, 60, 80, 0.3)";
      c.fillRect(48, y + 54, 664, 2);
      if (i < 3) {
        c.strokeStyle = "#3a3a44";
        c.lineWidth = 4;
        c.strokeRect(586, y - 46, 84, 84);
      } else {
        c.fillStyle = "#6a6a70";
        c.font = `500 28px ${fonts.text}`;
        c.textAlign = "right";
        c.fillText(w.absent, 712, y + 12);
        c.textAlign = "left";
      }
    });
    s.staff.texture.needsUpdate = true;

    c = s.order.ctx;
    paper(c, SHEET.width, SHEET.height, s.order.colour);
    drawHeader(c, fonts, v.name, w.order, w.orderNo);
    [[w.customer, v.customer], [w.item, v.item], [w.quantity, `${v.qty} ${v.unit}`], [w.rate, rupees(v.rate, lang)], [w.amount, rupees(TAX.amount, lang)]].forEach(([a, b], i) => drawRow(c, fonts, a, b, 250 + i * 88));
    s.order.texture.needsUpdate = true;

    c = s.made.ctx;
    paper(c, SHEET.width, SHEET.height, s.made.colour);
    drawHeader(c, fonts, v.name, w.shift, clockLabel(135, lang));
    [[w.made, `${v.qty} ${v.unit}`], [w.used, v.used]].forEach(([a, b], i) => drawRow(c, fonts, a, b, 250 + i * 88));
    c.fillStyle = "#6a6a70";
    c.font = `500 25px ${fonts.text}`;
    c.fillText(w.sign, 48, 480);
    c.strokeStyle = "rgba(60, 60, 80, 0.5)";
    c.setLineDash([10, 9]);
    c.lineWidth = 3;
    c.strokeRect(48, 500, 664, 370);
    c.setLineDash([]);
    s.made.texture.needsUpdate = true;

    c = s.delivery.ctx;
    paper(c, SHEET.width, SHEET.height, s.delivery.colour);
    drawHeader(c, fonts, v.name, w.challan, "No. 1042");
    c.fillStyle = "#6a6a70";
    for (let x = 12; x < SHEET.width; x += 22) c.fillRect(x, SHEET.height * STUB - 3, 11, 5);
    [[w.customer, v.customer], [w.item, v.item], [w.quantity, `${v.qty} ${v.unit}`], [w.vehicle, "MH 12 AB 1234"], [w.driver, words.workers[0]]].forEach(([a, b], i) => drawRow(c, fonts, a, b, 300 + i * 88));
    s.delivery.texture.needsUpdate = true;

    c = s.invoice.ctx;
    paper(c, SHEET.width, SHEET.height, s.invoice.colour);
    drawHeader(c, fonts, v.name, w.invoice, "RK/26-27/00042");
    [[w.customer, v.customer], [`${v.qty} ${v.unit}`, rupees(TAX.amount, lang)], [w.gst, rupees(TAX.gst, lang)], [w.total, rupees(TAX.total, lang)]].forEach(([a, b], i) => drawRow(c, fonts, a, b, 250 + i * 88));
    s.invoice.texture.needsUpdate = true;
  }

  // The phone.
  const phoneScreen = makeCanvas(360, 760);
  const phoneTexture = canvasTexture(phoneScreen, gl);
  const phone = new THREE.Group();
  const phoneBody = mesh(roundedBlock(42, 88, 2.4, 6), new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 0.3, metalness: 0.5 }));
  const phoneGlass = mesh(new THREE.PlaneGeometry(38, 80), new THREE.MeshStandardMaterial({ color: "#000", emissive: "#fff", emissiveMap: phoneTexture, emissiveIntensity: 1, roughness: 0.2 }), false);
  phoneGlass.rotation.x = -Math.PI / 2;
  phoneGlass.position.y = 2.5;
  phone.add(phoneBody, phoneGlass);
  phone.position.set(DESK.phone[0], 0, DESK.phone[1]);
  phone.rotation.y = 0.08;
  group.add(phone);

  function drawPhone(state, v) {
    const c = phoneScreen.getContext("2d");
    c.fillStyle = state === "off" ? "#0b0c0e" : "#f3efe6";
    c.fillRect(0, 0, 360, 760);
    if (state === "message") {
      c.fillStyle = "#23705f";
      c.fillRect(0, 0, 360, 104);
      c.fillStyle = "#fff";
      c.font = `600 28px ${fonts.text}`;
      c.fillText(v.customer, 26, 66);
      c.fillStyle = "#fff";
      c.beginPath();
      c.roundRect(20, 180, 318, 264, 16);
      c.fill();
      c.fillStyle = "#1c1c1c";
      c.font = `400 32px ${fonts.text}`;
      const text = fill(w.message, v).split(" ");
      let line = "", y = 234;
      text.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (c.measureText(next).width > 280) { c.fillText(line, 38, y); line = word; y += 46; } else line = next;
      });
      c.fillText(line, 38, y);
    }
    if (state === "call") {
      c.fillStyle = "#17382f";
      c.fillRect(0, 0, 360, 760);
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.font = `400 30px ${fonts.text}`;
      c.fillText(w.call, 180, 170);
      c.font = `600 38px ${fonts.text}`;
      c.fillText(v.customer, 180, 232);
      c.fillStyle = "#3fbf72";
      c.beginPath();
      c.arc(180, 610, 52, 0, 7);
      c.fill();
      c.textAlign = "left";
    }
    phoneTexture.needsUpdate = true;
  }

  // The cash box, its lid thrown back, and the notes in it.
  const enamel = new THREE.MeshStandardMaterial({ color: "#4f8f88", roughness: 0.4, metalness: 0.25 });
  const box = new THREE.Group();
  const floor = mesh(new THREE.BoxGeometry(BOX.width, 2, BOX.depth), enamel);
  floor.position.y = 1;
  box.add(floor);
  [[0, -BOX.depth / 2, BOX.width, 2], [0, BOX.depth / 2, BOX.width, 2], [-BOX.width / 2, 0, 2, BOX.depth], [BOX.width / 2, 0, 2, BOX.depth]].forEach(([x, z, sx, sz]) => {
    const side = mesh(new THREE.BoxGeometry(sx, BOX.height, sz), enamel);
    side.position.set(x, BOX.height / 2, z);
    box.add(side);
  });
  const lid = mesh(new THREE.BoxGeometry(BOX.width, 2, BOX.depth), enamel);
  // Hinged on the left, so the sun from the door still reaches the notes.
  lid.position.set(-BOX.width / 2 + Math.cos(1.84) * BOX.width / 2, BOX.height + Math.sin(1.84) * BOX.width / 2, 0);
  lid.rotation.z = 1.84;
  box.add(lid);
  const catchPlate = mesh(new THREE.BoxGeometry(16, 5, 1.2), new THREE.MeshStandardMaterial({ color: "#c7c8c3", metalness: 0.8, roughness: 0.34 }));
  catchPlate.position.set(0, BOX.height - 3, BOX.depth / 2 + 1.2);
  box.add(catchPlate);
  box.position.set(DESK.box[0], 0, DESK.box[1]);
  group.add(box);

  // Banknote-coloured slips with a printed frame and a watermark circle.
  const noteCanvas = makeCanvas(256, 112), noteCtx = noteCanvas.getContext("2d");
  noteCtx.fillStyle = "#fff";
  noteCtx.fillRect(0, 0, 256, 112);
  noteCtx.strokeStyle = "rgba(40, 30, 30, 0.34)";
  noteCtx.lineWidth = 4;
  noteCtx.strokeRect(9, 9, 238, 94);
  noteCtx.fillStyle = "rgba(40, 30, 30, 0.2)";
  noteCtx.beginPath();
  noteCtx.arc(178, 56, 28, 0, 7);
  noteCtx.fill();
  noteCtx.fillRect(28, 42, 84, 8);
  noteCtx.fillRect(28, 60, 56, 8);
  const noteTones = [new THREE.Color("#b7c3a4"), new THREE.Color("#e9a06a"), new THREE.Color("#c3afd6")];
  const NOTE_VALUE = 400;
  const maxNotes = Math.ceil(MONEY.book / NOTE_VALUE) + 4;
  const notes = new THREE.InstancedMesh(new THREE.BoxGeometry(44, 0.7, 20), new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTexture(noteCanvas, gl) }), maxNotes);
  notes.castShadow = true;
  notes.receiveShadow = true;
  const place = new THREE.Matrix4(), turnBy = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), unit = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < maxNotes; i++) {
    const stack = i % 3, level = Math.floor(i / 3);
    at.set(-31 + stack * 31 + (rand(i, 1) - 0.5) * 1.4, 2.6 + level * 0.74, (rand(i, 2) - 0.5) * 4);
    turnBy.setFromAxisAngle(yAxis, (rand(i, 3) - 0.5) * 0.09 + Math.PI / 2);
    notes.setMatrixAt(i, place.compose(at, turnBy, unit));
    notes.setColorAt(i, noteTones[stack]);
  }
  box.add(notes);

  const noteMaterial = new THREE.MeshStandardMaterial({ color: "#e9a06a", roughness: 0.8 });
  const makeBundle = (count, tone) => {
    const g = new THREE.Group();
    const stack = mesh(new THREE.BoxGeometry(32, count * 0.55, 15), noteMaterial.clone());
    stack.material.color.set(tone);
    stack.position.y = (count * 0.55) / 2;
    const band = mesh(new THREE.BoxGeometry(5, count * 0.55 + 0.3, 15.2), new THREE.MeshStandardMaterial({ color: "#f6ecd2", roughness: 0.8 }));
    band.position.y = stack.position.y;
    g.add(stack, band);
    return g;
  };
  const wad = makeBundle(8, "#c3afd6");       // the diesel money
  wad.visible = false;
  group.add(wad);
  const bundle = makeBundle(12, "#b7c3a4");   // the customer's payment
  bundle.visible = false;
  group.add(bundle);

  const coinMaterial = new THREE.MeshStandardMaterial({ color: "#c8c6bc", metalness: 0.9, roughness: 0.34 });
  const coins = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const coin = mesh(new THREE.CylinderGeometry(6, 6, 1.2, 24), coinMaterial);
    coin.position.set((i - 1) * 4, 0.7 + i * 1.2, i * 1.2);
    coins.add(coin);
  }
  coins.visible = false;
  group.add(coins);

  // Tea, in the small glass it always comes in.
  const glass = new THREE.Group();
  const tea = mesh(new THREE.CylinderGeometry(6.4, 5, 11, 20), new THREE.MeshStandardMaterial({ color: "#b5733a", roughness: 0.4 }));
  tea.position.y = 6;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 5.6, 15, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.26, roughness: 0.08, clearcoat: 1 }));
  shell.position.y = 7.6;
  const tray = mesh(new THREE.CylinderGeometry(18, 18, 1.4, 32), new THREE.MeshStandardMaterial({ color: "#c7c8c3", metalness: 0.8, roughness: 0.36 }));
  tray.position.y = 0.7;
  const trayGroup = new THREE.Group();
  glass.add(tea, shell);
  glass.position.y = 1.4;
  trayGroup.add(tray, glass);
  trayGroup.position.set(DESK.tray[0], 0, DESK.tray[1]);
  trayGroup.visible = false;
  group.add(trayGroup);

  // The rubber stamp and its violet pad.
  const pad = new THREE.Group();
  const padTin = mesh(roundedBlock(52, 34, 3.4, 3), new THREE.MeshStandardMaterial({ color: "#7b7f7e", metalness: 0.7, roughness: 0.4 }));
  const felt = mesh(new THREE.BoxGeometry(46, 0.5, 28), new THREE.MeshStandardMaterial({ color: "#5b3aa6", roughness: 0.95 }), false);
  felt.position.y = 3.4;
  pad.add(padTin, felt);
  pad.position.set(DESK.pad[0], 0, DESK.pad[1]);
  group.add(pad);
  const stamp = new THREE.Group();
  const stampHandle = new THREE.Mesh(new THREE.LatheGeometry([[0.1, 34], [5.6, 33], [7.8, 28], [6.4, 22], [3.4, 16], [3.2, 9], [5.4, 7], [5.4, 5]].map(([x, y]) => new THREE.Vector2(x, y)), 24), new THREE.MeshPhysicalMaterial({ color: "#8a4a22", roughness: 0.32, clearcoat: 0.8 }));
  stampHandle.castShadow = true;
  const stampBase = mesh(new THREE.BoxGeometry(32, 5, 15), new THREE.MeshStandardMaterial({ color: "#c79a3b", metalness: 0.85, roughness: 0.36 }));
  stampBase.position.y = 3;
  stamp.add(stampHandle, stampBase);
  group.add(stamp);

  // A soft amber ring on whatever the visitor should touch next.
  const hint = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 72), new THREE.MeshBasicMaterial({ color: "#ffb01f", transparent: true, depthTest: false, side: THREE.DoubleSide }));
  hint.rotation.x = -Math.PI / 2;
  hint.renderOrder = 8;
  hint.visible = false;
  group.add(hint);

  // The shadow of a hand. Nothing else about it is ever seen.
  const arm = new THREE.Mesh(new THREE.PlaneGeometry(112, 224), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(paintArm(256, 512)), alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
  arm.castShadow = true;
  group.add(arm);

  // Dust in the light from the door.
  const dustCount = mobile ? 60 : 140, dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) dustPositions.set([(rand(i, 1) - 0.5) * 620, rand(i, 2) * 220 + 10, -rand(i, 3) * 460 + 60], i * 3);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const speckCanvas = makeCanvas(32, 32), speckCtx = speckCanvas.getContext("2d"), speckFade = speckCtx.createRadialGradient(16, 16, 1, 16, 16, 16);
  speckFade.addColorStop(0, "rgba(255, 246, 226, 1)");
  speckFade.addColorStop(1, "rgba(255, 246, 226, 0)");
  speckCtx.fillStyle = speckFade;
  speckCtx.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(speckCanvas), size: 2.6, transparent: true, depthWrite: false, opacity: 0.5, sizeAttenuation: true }));
  dust.frustumCulled = false;
  group.add(dust);

  // What the visitor is doing right now.
  const hand = { hit: new THREE.Vector3(), has: false };
  let doing = {}, seenBeat = -2, auto = null, values = null, autoTime = 0;
  const state = { ticks: 0, signed: 0, tear: 0, count: 0, stamped: {}, held: null, carried: new THREE.Vector3(), done: {}, strokes: [] };
  const stampState = { x: DESK.pad[0], y: 6, z: DESK.pad[1], press: -1, word: "", sheet: null, turn: 0, into: { x: 0, z: 0 } };

  const toSheet = (p) => ({ x: ((p.x - SPOT.x) / SLIP.width + 0.5) * SHEET.width, y: ((p.z - SPOT.z) / SLIP.height + 0.5) * SHEET.height });
  const inside = (p, x, z, w, d) => Math.abs(p.x - x) < w / 2 && Math.abs(p.z - z) < d / 2;
  const onSlip = (p) => inside(p, SPOT.x, SPOT.z, SLIP.width + 10, SLIP.height + 10);
  const boxTop = (i) => ({ x: SPOT.x + ((628 / SHEET.width) - 0.5) * SLIP.width, z: SPOT.z + (((280 + i * 142) / SHEET.height) - 0.5) * SLIP.height });
  const current = () => (run.phase === "wait" ? BEATS[run.beat] : null);
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not on this device */ } };

  function tickBox(i) {
    const c = sheets.staff.ctx;
    tick(c, 628, 280 + i * 142);
    sheets.staff.texture.needsUpdate = true;
    run.sound.tick();
    state.ticks = Math.max(state.ticks, i + 1);
    if (state.ticks >= 3) finish();
  }
  function finish() {
    const beat = current();
    if (!beat) return;
    state.done[beat.id] = true;
    doing = {};
    auto = null;
    hint.visible = false;
    run.finishBeat();
  }
  function pressStamp(p, sheetId) {
    if (stampState.press >= 0 || state.stamped[sheetId]) return;
    stampState.press = 0;
    stampState.sheet = sheetId;
    stampState.at = { x: clamp(p.x, SPOT.x - 38, SPOT.x + 38), z: clamp(p.z, SPOT.z - 40, SPOT.z + 60) };
    stampState.word = sheetId === "order" ? w.booked : w.billed;
  }
  function addStroke(p) {
    const q = toSheet(p), s = doing.last, c = sheets.made.ctx;
    const x = clamp(q.x, 56, 704), y = clamp(q.y, 510, 860);
    if (s) {
      c.strokeStyle = INK;
      c.lineWidth = 6;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.quadraticCurveTo((s.x + x) / 2, (s.y + y) / 2, x, y);
      c.stroke();
      const step = Math.hypot(x - s.x, y - s.y);
      state.signed += step;
      if (step > 6 && Math.random() < 0.4) run.sound.pen();
      sheets.made.texture.needsUpdate = true;
    }
    doing.last = { x, y };
    state.strokes.push([Math.round(x), Math.round(y), s ? 1 : 0]);
  }
  function setTear(value) {
    if (value > state.tear + 0.012) { run.sound.tear(); state.tear = value; }
    if (state.tear > 0.94) { state.tear = 1; buzz(14); finish(); }
  }

  const gestures = {
    tick: {
      over(p) { const b = boxTop(state.ticks); return inside(p, b.x, b.z, 26, 26) && "pointer"; },
      down(p) { for (let i = state.ticks; i < 3; i++) { const b = boxTop(i); if (inside(p, b.x, b.z, 26, 26)) { tickBox(i); break; } } },
    },
    stamp: {
      over(p) { return onSlip(p) && "pointer"; },
      down(p, beat) { if (onSlip(p)) pressStamp(p, beat.id === "order" ? "order" : "invoice"); },
    },
    sign: {
      over(p) { return onSlip(p) && toSheet(p).y > 470 && "crosshair"; },
      down(p) { if (onSlip(p) && toSheet(p).y > 470) { doing.drawing = true; doing.last = null; addStroke(p); } },
      move(p) { if (doing.drawing) addStroke(p); },
      up() { doing.drawing = false; if (state.signed > 340) { run.signature = state.strokes.slice(); finish(); } },
    },
    tear: {
      over(p) { return onSlip(p) && "ew-resize"; },
      down(p) { if (onSlip(p)) doing.from = p.x; },
      move(p) { if (doing.from !== undefined) { const moved = Math.abs(p.x - doing.from); setTear(Math.max(state.tear, moved / (SLIP.width * 0.72))); } },
      up() { doing.from = undefined; },
    },
    bundle: {
      over(p) { return inside(p, bundle.position.x, bundle.position.z, 62, 44) && (state.held ? "grabbing" : "grab"); },
      down(p) { if (inside(p, bundle.position.x, bundle.position.z, 62, 44)) state.held = "bundle"; },
      move(p) { if (state.held) state.carried.copy(p); },
      up() { drop(); },
    },
    coins: {
      over(p) { return inside(p, coins.position.x, coins.position.z, 50, 44) && (state.held ? "grabbing" : "grab"); },
      down(p) { if (inside(p, coins.position.x, coins.position.z, 50, 44)) state.held = "coins"; },
      move(p) { if (state.held) state.carried.copy(p); },
      up() { drop(); },
    },
    hold: {
      over(p) { return inside(p, DESK.box[0], DESK.box[1], BOX.width + 24, BOX.depth + 24) && "pointer"; },
      down(p) { if (inside(p, DESK.box[0], DESK.box[1], BOX.width + 24, BOX.depth + 24)) doing.counting = true; },
      up() { doing.counting = false; },
    },
  };
  function drop() {
    const held = state.held;
    state.held = null;
    if (!held) return;
    const target = held === "bundle" ? [DESK.box[0], DESK.box[1], BOX.width, BOX.depth] : [DESK.tray[0], DESK.tray[1], 70, 70];
    if (inside(state.carried, target[0], target[1], target[2], target[3])) {
      if (held === "bundle") run.sound.notes(); else run.sound.coins();
      finish();
    }
  }

  function arrive(id) {
    const s = run.sound;
    if (id === "order") { s.buzz(); buzz([80, 60, 80]); }
    if (id === "invoice") { s.ring(); buzz([140, 90, 140]); doing.ringing = 2.4; }
    if (id === "delivery") s.horn();
    if (id === "staff" || id === "made" || id === "payment") s.paper();
  }

  function setPose(m, x, y, z, turn) {
    m.position.set(x, y, z);
    m.rotation.y = turn;
  }

  const FROM = { x: 30, z: -226, y: 3 }, PILE = { x: DESK.pile[0], z: DESK.pile[1] };
  function poseSlip(m, index, order, t) {
    const [a0, a1] = enters(index), [b0, b1] = leaves(index);
    const p = ramp(t, a0, a1), q = ramp(t, b0, b1);
    m.visible = p > 0;
    if (!m.visible) return;
    const lift = Math.sin(p * Math.PI) * 5 + Math.sin(q * Math.PI) * 26;
    const x = lerp(lerp(FROM.x, SPOT.x, p), PILE.x + order * 2.4, q);
    const z = lerp(lerp(FROM.z, SPOT.z, p), PILE.z - order * 1.6, q);
    setPose(m, x, lerp(lerp(FROM.y, SPOT.y, p), 0.8 + order * 0.5, q) + lift, z, lerp(0.4 * (1 - p), 0.16 * order - 0.3, q));
  }

  let phoneState = "";
  const sun = {};
  function update(dt, now) {
    const t = run.t, v = values;
    if (!v) return;
    const beat = current(), s = sunAt(t, sun);

    if (run.phase === "wait" && seenBeat !== run.beat) { seenBeat = run.beat; arrive(beat.id); }

    poseSlip(slips.staff, 0, 0, t);
    poseSlip(slips.order, 1, 1, t);
    poseSlip(slips.made, 2, 2, t);
    poseSlip(slips.invoice, 4, 4, t);

    // The challan: both pieces arrive together; the stub goes to the pile, the body out of the door.
    const [c0, c1] = enters(3), [d0, d1] = leaves(3);
    const cp = ramp(t, c0, c1), cq = clamp((t - d0) / (d1 - d0));
    const open = state.tear * 0.17;
    stub.visible = body.visible = cp > 0;
    if (cp > 0) {
      const lift = Math.sin(cp * Math.PI) * 5;
      const x = lerp(FROM.x, SPOT.x, cp), z = lerp(FROM.z, SPOT.z, cp), y = lerp(FROM.y, SPOT.y, cp) + lift;
      const seam = z - SLIP.height / 2 + SLIP.height * STUB;
      setPose(stub, lerp(x, PILE.x + 7, ramp(t, 252, 262)), lerp(y, 2.4, ramp(t, 252, 262)), lerp(z - SLIP.height / 2 + (SLIP.height * STUB) / 2, PILE.z - 5, ramp(t, 252, 262)), lerp(0.4 * (1 - cp), -0.1, ramp(t, 252, 262)));
      const out = smooth(cq);
      setPose(body, lerp(x + SLIP.width / 2, 120, out), y + Math.sin(out * Math.PI) * 60 + 0.1, lerp(seam + state.tear * 4, -360, out), lerp(0.4 * (1 - cp) + open, 0.8, out));
      body.visible = cq < 1;
    }

    shown.value = linesAt(t);

    // The notes in the box follow the money.
    const live = cashAt(t);
    notes.count = clamp(Math.round(live / NOTE_VALUE), 0, maxNotes);

    // The hand comes in along the sunlight, takes the notes and goes.
    const reach = ramp(t, TAKEN[0] - 0.5, TAKEN[0]) * (1 - ramp(t, TAKEN[1], TAKEN[1] + 0.5));
    arm.visible = reach > 0.01;
    if (arm.visible) {
      const height = 280, slide = (1 - reach) * 240;
      arm.position.set(DESK.box[0] + (s.x / s.y) * height, height, DESK.box[1] + (s.z / s.y) * height);
      arm.lookAt(arm.position.x + s.x, arm.position.y + s.y, arm.position.z + s.z);
      arm.rotateZ(Math.PI);
      arm.translateY(44 + slide);
    }
    const carried = ramp(t, TAKEN[0], TAKEN[1]);
    wad.visible = carried > 0.01 && carried < 0.99;
    if (wad.visible) wad.position.set(lerp(DESK.box[0], DESK.box[0] + 40, carried), lerp(10, 90, carried), lerp(DESK.box[1], DESK.box[1] - 140, carried));

    const want = t > 30 && t < 64 ? "message" : t > 250.4 && t < 258 ? "call" : "off";
    if (want !== phoneState) { phoneState = want; drawPhone(want, v); }
    const ringing = (beat?.id === "order" || (beat?.id === "invoice")) && !state.done[beat.id];
    phone.position.x = DESK.phone[0] + (ringing ? Math.sin(now * 90) * 0.32 * (Math.sin(now * 7) > 0 ? 1 : 0) : 0);

    const tripIn = ramp(t, 226, 244), tripOut = ramp(t, 262, 284);
    tempo.position.x = lerp(lerp(860, 30, tripIn), -860, tripOut);
    walkers.forEach((p) => {
      const d = p.userData, span = 1500;
      p.position.x = (((t * d.speed * d.sign + d.offset) % span) + span) % span - span / 2;
    });

    // Sky and room take on the time of day.
    streetLayer.material.color.setRGB(s.r, lerp(1, s.g, 0.9), lerp(1, s.b, 0.85));
    roomLayer.material.color.setRGB(1, lerp(0.97, 0.88, s.evening), lerp(0.92, 0.74, s.evening));

    dust.rotation.y = Math.sin(now * 0.05) * 0.06;
    dust.position.y = Math.sin(now * 0.13) * 5;

    // Tray arrives for the tea and leaves its glass on the counter.
    const teaIn = ramp(t, 410, 428);
    trayGroup.visible = teaIn > 0;
    trayGroup.position.z = lerp(-300, DESK.tray[1], teaIn);

    // Money and coins on the counter.
    const payIn = ramp(t, 360, 388);
    const moved = state.held === "bundle";
    bundle.visible = payIn > 0 && t < 391 && !state.done.payment;
    if (moved) bundle.position.set(state.carried.x, 26, state.carried.z);
    else bundle.position.set(DESK.bundle[0], lerp(46, 0.4, payIn), lerp(-340, DESK.bundle[1], payIn));
    const coinsIn = ramp(t, 420, 429);
    coins.visible = coinsIn > 0 && t < 431 && !state.done.tea;
    if (state.held === "coins") coins.position.set(state.carried.x, 18, state.carried.z);
    else coins.position.set(DESK.coins[0], 0.2, DESK.coins[1]);

    // The stamp waits on its pad, follows the hand when it's wanted, and comes down hard.
    const stamping = beat?.gesture === "stamp" && !state.stamped[beat.id === "order" ? "order" : "invoice"];
    let goal = { x: DESK.pad[0], z: DESK.pad[1], y: 3.8 };
    if (stamping) goal = hand.has && onSlip(hand.hit) ? { x: hand.hit.x, z: hand.hit.z, y: 40 } : { x: SPOT.x + 30, z: SPOT.z - 8, y: 40 };
    const follow = 1 - Math.exp(-dt * 12);
    if (stampState.press < 0) {
      stampState.x += (goal.x - stampState.x) * follow;
      stampState.y += (goal.y - stampState.y) * follow;
      stampState.z += (goal.z - stampState.z) * follow;
    } else {
      const was = stampState.press;
      stampState.press += dt / 0.42;
      const k = stampState.press;
      stampState.x += (stampState.at.x - stampState.x) * 0.5;
      stampState.z += (stampState.at.z - stampState.z) * 0.5;
      stampState.y = k < 0.42 ? lerp(40, 3.2, smooth(k / 0.42)) : lerp(3.2, 40, ramp(k, 0.56, 1));
      if (was < 0.42 && k >= 0.42) {
        const q = toSheet(stampState.at);
        stampMark(sheets[stampState.sheet].ctx, q.x, q.y, stampState.word, fonts, -0.1 + Math.random() * 0.1);
        sheets[stampState.sheet].texture.needsUpdate = true;
        state.stamped[stampState.sheet] = true;
        run.sound.stamp();
        run.shake = 0.8;
        buzz(26);
      }
      if (k >= 1) { stampState.press = -1; finish(); }
    }
    stamp.position.set(stampState.x, stampState.y, stampState.z);

    // Counting: notes flicker past under the thumb and the figure runs up.
    if (doing.counting && beat?.gesture === "hold") {
      const was = state.count;
      state.count = Math.min(1, state.count + dt / 2.1);
      if (Math.floor(was * 26) !== Math.floor(state.count * 26)) run.sound.count();
      run.setCount?.(Math.round(MONEY.box * smooth(state.count) / 50) * 50);
      if (state.count >= 1) { run.setCount?.(MONEY.box); finish(); }
    }

    // The button version of each gesture plays it out on its own.
    if (auto) {
      const { kind, from } = auto;
      auto.time += dt;
      if (kind === "tick" && auto.time > 0.26) { auto.time = 0; tickBox(state.ticks); }
      if (kind === "sign") {
        const k = clamp(auto.time), x = SPOT.x - 44 + k * 88, z = SPOT.z + 50 + Math.sin(k * 15) * 11 - k * 8;
        hand.hit.set(x, 0, z);
        addStroke(hand.hit);
        if (k >= 1) { run.signature = state.strokes.slice(); finish(); }
      }
      if (kind === "tear") setTear(Math.min(1, auto.time / 0.8));
      if (kind === "bundle" || kind === "coins") {
        const k = smooth(clamp(auto.time / 0.8)), to = kind === "bundle" ? DESK.box : DESK.tray;
        state.held = kind;
        state.carried.set(lerp(from.x, to[0], k), 0, lerp(from.z, to[1], k));
        if (k >= 1) drop();
      }
    }

    // Point at the next thing to touch.
    const inWait = beat && !auto && stampState.press < 0 && !state.held && !doing.drawing && !doing.counting;
    hint.visible = Boolean(inWait);
    if (inWait) {
      let x = SPOT.x, z = SPOT.z, r = 30;
      if (beat.gesture === "tick") ({ x, z } = boxTop(state.ticks)), (r = 15);
      if (beat.gesture === "stamp") { r = 26; z = SPOT.z + 34; x = SPOT.x + 14; }
      if (beat.gesture === "sign") { z = SPOT.z + 42; r = 36; }
      if (beat.gesture === "tear") { x = SPOT.x - SLIP.width / 2 + 8; z = SPOT.z - SLIP.height / 2 + SLIP.height * STUB; r = 15; }
      if (beat.gesture === "bundle") { x = bundle.position.x; z = bundle.position.z; r = 30; }
      if (beat.gesture === "coins") { x = coins.position.x; z = coins.position.z; r = 18; }
      if (beat.gesture === "hold") { x = DESK.box[0]; z = DESK.box[1]; r = 66; }
      const pulse = 1 + Math.sin(now * 3.6) * 0.06;
      hint.position.set(x, 12, z);
      hint.scale.setScalar(r * pulse);
      hint.material.opacity = 0.74 + Math.sin(now * 3.6) * 0.24;
    }
  }

  run.perform = () => {
    const beat = current();
    if (!beat || auto) return;
    if (beat.gesture === "stamp") { pressStamp({ x: SPOT.x + 14, z: SPOT.z + 34 }, beat.id === "order" ? "order" : "invoice"); return; }
    if (beat.gesture === "hold") { doing.counting = true; return; }
    if (beat.gesture === "sign") doing.last = null;
    auto = { kind: beat.gesture, time: 0, from: beat.gesture === "bundle" ? { x: bundle.position.x, z: bundle.position.z } : { x: coins.position.x, z: coins.position.z } };
  };

  function reset() {
    state.ticks = 0; state.signed = 0; state.tear = 0; state.count = 0; state.stamped = {}; state.held = null; state.done = {}; state.strokes = [];
    doing = {}; auto = null; seenBeat = -2; phoneState = ""; values = null;
    stampState.press = -1;
  }

  return {
    group,
    reset,
    prepare(v) {
      reset();
      values = v;
      drawBook(v);
      drawSheets(v);
    },
    update,
    input(kind, p) {
      hand.hit.copy(p);
      hand.has = kind !== "up";
      const beat = current();
      if (!beat) return;
      gestures[beat.gesture]?.[kind]?.(p, beat);
      run.setCursor?.(gestures[beat.gesture]?.over(p) || "");
    },
  };
}
