"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Action } from "./Motion";
import { clamp, ramp, seeded, starfield } from "./stars";

// Everything is laid out in the picture's own space, 740 by 416, so lines sit exactly on the arms.

// Factory outlines: sawtooth sheds, chimneys, silos and a gantry, standing on `base`.
function factories(x0, x1, base, scale) {
  const paths = [], lights = [];
  const light = (x, y, w, h) => lights.push({ x, y, w, h });
  let x = x0, i = 0;
  while (x < x1) {
    const kind = i % 4, r = seeded(i + x0 + 1);
    if (kind === 0) {
      const teeth = 3 + Math.floor(r * 2), w = 15 * scale, h = 30 * scale;
      let d = `M${x} ${base}V${base - h}`;
      for (let t = 0; t < teeth; t++) d += `l${w} ${-10 * scale}v${10 * scale}`;
      paths.push(`${d}V${base}Z`);
      for (let t = 0; t < teeth; t++) {
        paths.push(`M${x + t * w + 3 * scale} ${base - h * 0.62}h${w - 6 * scale}M${x + t * w + 3 * scale} ${base - h * 0.34}h${w - 6 * scale}`);
        light(x + t * w + 5 * scale, base - h * 0.53, w - 10 * scale, h * 0.09);
      }
      x += teeth * w + 4 * scale;
    } else if (kind === 1) {
      const w = 9 * scale, h = (58 + r * 28) * scale;
      paths.push(`M${x} ${base}L${x + 2 * scale} ${base - h}h${w - 4 * scale}L${x + w} ${base}Z M${x + 1.6 * scale} ${base - h * 0.84}h${w - 3.2 * scale}M${x + 1.2 * scale} ${base - h * 0.72}h${w - 2.4 * scale}`);
      x += w + 5 * scale;
    } else if (kind === 2) {
      const w = 22 * scale, h = 40 * scale;
      for (let t = 0; t < 2; t++) {
        const sx = x + t * (w + 2 * scale);
        paths.push(`M${sx} ${base}V${base - h}a${w / 2} ${5 * scale} 0 0 1 ${w} 0V${base}M${sx} ${base - h * 0.66}a${w / 2} ${4 * scale} 0 0 0 ${w} 0M${sx} ${base - h * 0.33}a${w / 2} ${4 * scale} 0 0 0 ${w} 0`);
      }
      x += w * 2 + 8 * scale;
    } else {
      const w = 34 * scale, h = 52 * scale;
      let d = `M${x} ${base}V${base - h}H${x + w}V${base}M${x} ${base - h}L${x + w * 0.5} ${base - h - 9 * scale}L${x + w} ${base - h}`;
      for (let t = 1; t < 4; t++) d += `M${x} ${base - (h * t) / 4}H${x + w}L${x} ${base - (h * (t + 1)) / 4}`;
      paths.push(d);
      x += w + 5 * scale;
    }
    i += 1;
  }
  paths.lights = lights;
  return paths;
}

// Circuit traces: straight runs with chamfered corners, ending in pads.
function circuit(x0, x1, y0, y1, count) {
  const paths = [], pads = [];
  for (let i = 0; i < count; i++) {
    const y = y0 + (i / count) * (y1 - y0), r = seeded(i + 9);
    const bend = x0 + r * (x1 - x0) * 0.6, rise = (seeded(i + 40) - 0.5) * 34;
    const end = bend + 30 + seeded(i + 70) * (x1 - bend);
    paths.push(`M${x0} ${y}H${bend}l${Math.abs(rise)} ${rise}H${end}`);
    pads.push([x0, y], [end, y + rise]);
  }
  return { paths, pads };
}

// Where the gold stars land: pads and chip corners that sit inside the arm.
const say = (line) => line.split(" ").map((word, i) => <Fragment key={i}><span className="word" style={{ "--i": i }}>{word}</span>{" "}</Fragment>);

const landings = ({ board, chips }) => [
  ...board.pads.filter(([x, y]) => x > 420 && x < 640 && y > 176 && y < 238),
  ...chips.flatMap(([x, y, w, h]) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]),
].slice(0, 34);

// Drawn in the browser: these lines are decoration, so they stay out of the page's HTML.
const drawings = () => ({
  mills: [factories(30, 250, 212, 0.5), factories(-6, 262, 262, 0.62), factories(-10, 250, 312, 0.85)],
  skyline: factories(0, 345, 408, 0.72),
  board: circuit(392, 760, 134, 300, 22),
  floor: circuit(392, 760, 356, 410, 8),
  chips: [[560, 196, 34, 26], [640, 170, 42, 32], [700, 214, 26, 26], [508, 214, 22, 18]],
});

export default function Touch({ touch, headline, cta, descriptor }) {
  const pin = useRef(null), run = useRef(null), sky = useRef(null), arms = useRef(null);
  const turn = headline.indexOf(touch.turn), first = headline.slice(0, turn).trim();
  const [lead, tail] = headline.slice(turn).split(touch.accent);

  const [art, setArt] = useState(null);
  useEffect(() => setArt(drawings()), []);

  useEffect(() => {
    if (!art) return undefined;
    const el = pin.current, section = run.current;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const field = starfield(sky.current, arms.current, landings(art));
    let goal = still ? 1 : 0, p = goal, speed = 0, last = 0, frame = 0;
    const read = () => {
      const box = section.getBoundingClientRect();
      if (!still) goal = clamp(-box.top / Math.max(1, box.height - innerHeight));
      el.style.setProperty("--sy", `${-scrollY}px`);
      el.dataset.off = box.bottom < 0 ? "1" : "0";
    };
    const place = () => {
      const night = 1 - ramp(p, 0.27, 0.42), tech = ramp(p, 0.1, 0.3), mills = ramp(p, 0.3, 0.52), reach = ramp(p, 0.38, 0.8), flesh = ramp(p, 0.5, 0.82), spark = ramp(p, 0.79, 0.83) * (1 - ramp(p, 0.9, 1) * 0.6);
      const set = (k, v) => el.style.setProperty(k, v.toFixed(4));
      set("--tech", tech); set("--mills", mills); set("--reach", reach); set("--flesh", flesh); set("--spark", spark);
      set("--night", night);
      set("--dawn", ramp(p, 0.24, 0.34) * (1 - ramp(p, 0.36, 0.45)) * 0.92);
      set("--type", ramp(Math.abs(night - 0.5), 0.1, 0.4));
      el.dataset.sky = night > 0.5 ? "night" : "day";
      set("--one", (1 - ramp(p, 0.21, 0.26)) * ramp(p, 0.015, 0.05));
      set("--two", ramp(p, 0.42, 0.46) * (1 - ramp(p, 0.64, 0.68)));
      set("--end", ramp(p, 0.88, 0.95));
      set("--lit", ramp(p, 0.81, 0.98));
      set("--wave", clamp((p - 0.8) / 0.16));
      set("--flow", ramp(p, 0.24, 0.32));
      set("--cue", 1 - ramp(p, 0, 0.03));
      set("--done", p);
      el.dataset.ended = p > 0.88 ? "1" : "0";
    };
    const step = (now) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const stiff = 26;
      speed += ((goal - p) * stiff - speed * 2 * Math.sqrt(stiff)) * dt;
      p += speed * dt;
      if (Math.abs(speed) > 0.00005 || Math.abs(goal - p) > 0.00005) place();
      if (Math.abs(aim.tx - aim.x) + Math.abs(aim.ty - aim.y) > 0.0005) {
        aim.x += (aim.tx - aim.x) * 0.06;
        aim.y += (aim.ty - aim.y) * 0.06;
        el.style.setProperty("--mx", aim.x.toFixed(4));
        el.style.setProperty("--my", aim.y.toFixed(4));
      }
      if (p < 0.42) field.paint(p, 1 - ramp(p, 0.27, 0.42), ramp(p, 0.38, 0.8), aim, now);
      else field.paint(1, 0, 1, aim, now);
    };
    const aim = { x: 0, y: 0, tx: 0, ty: 0 };
    const lines = [...el.querySelectorAll("[data-line]")];
    const measure = () => lines.forEach((line) => {
      const room = (line.parentElement.clientWidth - line.offsetWidth) / 2;
      line.style.setProperty("--in", `${line.dataset.line === "left" ? room : -room}px`);
    });
    const resize = () => { field.fit(); measure(); read(); };
    const look = (e) => {
      if (e.pointerType === "touch") return;
      aim.tx = e.clientX / innerWidth - 0.5;
      aim.ty = e.clientY / innerHeight - 0.5;
      el.style.setProperty("--gx", `${e.clientX}px`);
      el.style.setProperty("--gy", `${e.clientY}px`);
      el.dataset.lamp = "1";
    };
    const away = () => { aim.tx = 0; aim.ty = 0; delete el.dataset.lamp; };
    if (!still) { el.addEventListener("pointermove", look, { passive: true }); el.addEventListener("pointerleave", away); }
    resize();
    document.fonts?.ready.then(measure);
    p = goal;
    place();
    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", resize, { passive: true });
    if (!still) frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", read); removeEventListener("resize", resize); el.removeEventListener("pointermove", look); el.removeEventListener("pointerleave", away); };
  }, [art]);

  const draw = (list, varName, width, extra = "") => list.map((d, i) => (
    <path key={i} d={d} pathLength="1" className="drawn" strokeWidth={width} style={{ "--d": (i / list.length).toFixed(3), "--by": `var(${varName})` }} {...(extra ? { opacity: extra } : {})} />
  ));

  const lights = (list, kind = "lit") => list.flatMap((row) => row.lights).map((l, i) => (
    <rect key={i} className={kind} x={l.x} y={l.y} width={l.w} height={l.h} style={{ "--d": ((345 - l.x) / 345).toFixed(3) }} />
  ));

  return (
    <section ref={run} className="touch-run" id="platform" aria-label={descriptor}>
      <div ref={pin} className="touch-pin">
        <div className="night" aria-hidden="true" />
        <div className="dawn" aria-hidden="true" />
        <canvas ref={sky} className="sky" aria-hidden="true" />
        <div className="grid-lamp" aria-hidden="true" />
        <i className="progress" aria-hidden="true" />
        <div className="touch-words">
          <p className="kicker" data-line="left">{descriptor}</p>
          <h1>
            <span className="h-line" data-line="left"><span>{first}</span></span>{" "}
            <span className="h-line h-line-two" data-line="right">
              <span>{lead}<em>{touch.accent}<svg className="swash" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3 10C62 4 118 3 176 5S268 8 297 3" /></svg></em>{tail}</span>
            </span>
          </h1>
        </div>
        <div ref={arms} className="arms" aria-hidden="true">
          {art && <svg className="arm-back" viewBox="0 0 740 416">
            <g className="t-ink">{draw(art.skyline, "--mills", 0.42, "0.34")}</g>
            {lights([art.skyline], "lit lit-far")}
            <circle className="ring" cx="366" cy="214" r="1" pathLength="1" />
            <circle className="ring ring-two" cx="366" cy="214" r="1" />
            <g className="t-ink">{draw(art.floor.paths, "--tech", 0.42, "0.34")}</g>
          </svg>}
          <div className="reach reach-left">
            {art && <svg className="moulded mould-left" viewBox="0 0 740 416"><g className="t-ink">{draw(art.mills.flat(), "--mills", 0.5)}</g>{lights(art.mills)}</svg>}
            <img className="arm-line line-left" src="/touch/left-line.webp" alt="" />
            <img className="flesh flesh-left" src="/touch/left.webp" alt="" />
          </div>
          <div className="reach reach-right">
            {art && <svg className="moulded mould-right" viewBox="0 0 740 416">
              <g className="t-tech">
                {draw(art.board.paths, "--tech", 0.5)}
                {art.board.paths.filter((_, i) => i % 2 === 0).map((d, i) => <path key={i} d={d} pathLength="1" className="pulse" strokeWidth="0.9" style={{ animationDuration: `${3.2 + (i % 4) * 0.9}s`, animationDelay: `${i * -0.7}s` }} />)}
                {art.board.pads.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.4" strokeWidth="0.5" style={{ opacity: "var(--tech)" }} />)}
                {art.chips.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" strokeWidth="0.7" style={{ opacity: "var(--tech)" }} />)}
              </g>
            </svg>}
            <img className="arm-line line-right" src="/touch/right-line.webp" alt="" />
            <img className="flesh flesh-right" src="/touch/right.webp" alt="" />
          </div>
          <i className="spark" />
        </div>
        <p className="cue" aria-hidden="true">{touch.scroll}<i /></p>
        <p className="beat beat-one">{say(touch.one)}</p>
        <p className="beat beat-two">{say(touch.two)}</p>
        <div className="beat beat-end">
          <p>{say(touch.end)}</p>
          <Action href="#demo">{cta.secondary} <ArrowRight size={18} /></Action>
        </div>
      </div>
    </section>
  );
}
