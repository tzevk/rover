"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Action, Headline, Rise } from "./Motion";

const Scene = dynamic(() => import("./Scene"), { ssr: false }); // only downloaded if it will run

// A slow or metered connection, or a low-memory phone, keeps the still picture instead.
function canRender3D() {
  const net = navigator.connection;
  if (net?.saveData || /(^|-)[23]g$/.test(net?.effectiveType ?? "") || navigator.deviceMemory < 3) return false;
  try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch { return false; }
}

// Lingers on each stop, then moves on with an ease that has no sudden starts.
const hold = (t) => { const k = Math.min(1, Math.max(0, (t - 0.4) / 0.6)); return k * k * k * (k * (6 * k - 15) + 10); };

// Owns the scroll. `live.s` is the place in the journey: 0 the opening, 1 to 8 the steps. The scene
// follows it; the record beside the scene is the one thing that never changes place.
export default function Experience({ descriptor, headline, sub, cta, journey, children }) {
  const root = useRef(null), pin = useRef(null);
  const live = useRef({ s: 0, x: 0, y: 0, turn: 0, pin, journey, onScreen: false });
  const [stage, setStage] = useState(null);
  const [active, setActive] = useState(true);
  const count = journey.steps.length;

  const jump = useCallback((index) => {
    const run = root.current.querySelector(".journey-run");
    const top = run.getBoundingClientRect().top + scrollY, f = index === count - 1 ? count : index + 1.1;
    scrollTo({ top: top + (f / count) * (run.offsetHeight - innerHeight), behavior: "smooth" });
  }, [count]);

  useEffect(() => {
    const el = root.current, run = el.querySelector(".journey-run"), l = live.current;
    const settle = () => { delete el.dataset.live; el.dataset.still = "true"; el.querySelectorAll("[data-row]").forEach((row) => { row.dataset.state = "past"; }); };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !canRender3D()) { settle(); return; }
    el.dataset.live = "true";
    const giveUp = setTimeout(settle, 30000);    // if it can't start, the page stays as the picture
    l.onReady = () => { clearTimeout(giveUp); el.dataset.painted = "true"; };
    l.onFail = settle;
    const opening = setTimeout(() => setStage({ mobile: innerWidth < 900 }), 400);

    const rows = [...el.querySelectorAll("[data-row]")], steps = [...el.querySelectorAll("[data-step]")];
    let current = -2;
    const read = () => {
      const box = run.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height - innerHeight))) * count, i = Math.floor(f);
      l.s = i + hold(f - i);
      const now = Math.min(count - 1, Math.round(l.s) - 1);
      pin.current.style.setProperty("--hero", String(1 - Math.min(1, Math.max(0, (f - 0.12) / 0.28))));
      if (now === current) return;
      current = now;
      const place = (node, n) => { node.dataset.state = n === now ? "now" : n < now ? "past" : "next"; };
      rows.forEach(place);
      steps.forEach(place);
    };
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      l.x = (e.clientX / innerWidth) * 2 - 1;
      l.y = 1 - (e.clientY / innerHeight) * 2;
      l.onScreen = Boolean(e.target.closest?.(".stage"));
    };
    l.setPointer = (on) => { el.querySelector(".stage").style.cursor = on ? "pointer" : ""; };
    // Dragging the scene turns the view round the product. It swings back on release.
    const canvasArea = el.querySelector(".stage");
    let turning = null;
    const onDown = (e) => {
      if (l.hovered >= 0) { jump(l.hovered); return; }
      turning = e.clientX - l.turn * innerWidth;
    };
    const onDrag = (e) => { if (turning !== null) l.turn = Math.max(-0.5, Math.min(0.5, (e.clientX - turning) / innerWidth)); };
    const onUp = () => { turning = null; l.turn = 0; };
    read();
    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", read, { passive: true });
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointermove", onDrag, { passive: true });
    addEventListener("pointerup", onUp);
    canvasArea.addEventListener("pointerdown", onDown);
    const watch = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0 });
    watch.observe(run);
    return () => {
      clearTimeout(opening); clearTimeout(giveUp); watch.disconnect();
      removeEventListener("scroll", read);
      removeEventListener("resize", read);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointermove", onDrag);
      removeEventListener("pointerup", onUp);
      canvasArea.removeEventListener("pointerdown", onDown);
    };
  }, [count, jump]);

  return (
    <div ref={root} className="exp">
      <section className="journey-run" aria-label={journey.kicker}>
        <span id="platform" className="journey-start" />
        <div className="journey-pin" ref={pin}>
          <div className="stage" aria-hidden="true">
            {stage && <Scene live={live} mobile={stage.mobile} active={active} />}
          </div>
                    <div className="hero">
            <Rise delay={0.1}><p className="mono">{descriptor}</p></Rise>
            <Headline text={headline} />
            <Rise delay={0.8} className="hero-foot">
              <p>{sub}</p>
              <p className="hero-hint">{journey.hint}</p>
              <div className="acts">
                <Action href="#demo">{cta.secondary} <ArrowRight size={17} /></Action>
                <Action href="#platform" line>{cta.primary}</Action>
              </div>
            </Rise>
          </div>
          {journey.steps.map((step, i) => (
            <article key={step.name} className="step" data-step={i} data-state="next">
              <b>{String(i + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</b>
              <h2>{step.name}</h2>
              <p>{step.line}</p>
              <em>{step.row}</em>
            </article>
          ))}
          <nav className="rail" aria-label={journey.kicker}>
            <ol>
              {journey.steps.map((step, i) => (
                <li key={step.name}>
                  <button type="button" data-row={i} data-state="next" onClick={() => jump(i)}><i /><span>{step.name}</span></button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>
      {children}
    </div>
  );
}
