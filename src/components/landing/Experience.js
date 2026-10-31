"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

const Scene = dynamic(() => import("./Scene"), { ssr: false }); // only downloaded if it will run

// A slow or metered connection, or a low-memory phone, keeps the still picture instead.
function canRender3D() {
  const net = navigator.connection;
  if (net?.saveData || /(^|-)[23]g$/.test(net?.effectiveType ?? "") || navigator.deviceMemory < 3) return false;
  try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch { return false; }
}

// Lingers on each stop, then moves on: most of a stop's scroll is spent standing at it.
const hold = (t) => { const k = Math.min(1, Math.max(0, (t - 0.58) / 0.42)); return k * k * (3 - 2 * k); };

// Owns the scroll. `story` is the position in the film: 0 the site, 1 the problem, 2 onwards the
// stops, and the last value the finished page. If 3D can't run or motion is off, none of this
// starts and the stops simply read as a list.
export default function Experience({ children }) {
  const root = useRef(null);
  const story = useRef(0);
  const leader = useRef(null);
  const [stage, setStage] = useState(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = root.current;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !canRender3D()) {
      el.dataset.still = "true";
      return;
    }
    const journey = el.querySelector("[data-journey]");
    // Building the ground takes a moment, so it waits for the headline to land: page first, then the rise.
    const opening = setTimeout(() => setStage({ mobile: innerWidth < 800 }), 1000);
    if (!journey) return () => clearTimeout(opening);
    el.dataset.live = "true";

    gsap.registerPlugin(ScrollTrigger);
    const lenis = innerWidth >= 800 ? new Lenis({ lerp: 0.09 }) : null;
    const tick = (t) => lenis?.raf(t * 1000);
    if (lenis) { lenis.on("scroll", ScrollTrigger.update); gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0); }

    const stops = [...el.querySelectorAll("[data-stop]")];
    const steps = [...el.querySelectorAll("[data-step]")];
    const count = el.querySelector("[data-rail-count]"), name = el.querySelector("[data-rail-name]");
    const rail = el.querySelector(".rail"), svg = el.querySelector(".leader");
    const line = svg.querySelector("line"), dot = svg.querySelector("circle");
    let before = 0, along = 0, current = -1;

    const publish = () => {
      const f = along * stops.length, i = Math.min(stops.length - 1, Math.floor(f));
      story.current = before < 1 ? before * 2 : 2 + i + hold(f - i);
      rail.style.setProperty("--done", String(Math.min(1, along * 1.02)));
      // The last card leaves as the page folds flat, so the finished register comes up clean.
      stops[stops.length - 1].classList.toggle("stop-gone", f > stops.length - 0.42);
      if (i === current) return;
      current = i;
      stops.forEach((s, n) => { s.dataset.state = n === i ? "now" : n < i ? "past" : "next"; });
      steps.forEach((s, n) => { s.dataset.state = n === i ? "now" : n < i ? "past" : "next"; });
      count.textContent = `${i + 1} / ${stops.length}`;
      name.textContent = stops[i].querySelector("h3").textContent;
    };

    // Runs every frame from the scene: draws a line from the card to the thing it's about.
    leader.current = {
      move(x, y, near) {
        const card = stops[current]?.querySelector("[data-record]");
        if (!card || near <= 0 || innerWidth < 900) { svg.style.opacity = 0; return; }
        const r = card.getBoundingClientRect();
        const from = x < r.left ? r.left : x > r.right ? r.right : r.left + r.width / 2;
        const fromY = x < r.left || x > r.right ? r.top + r.height / 2 : y < r.top ? r.top : r.bottom;
        line.setAttribute("x1", from); line.setAttribute("y1", fromY);
        line.setAttribute("x2", x); line.setAttribute("y2", y);
        dot.setAttribute("cx", x); dot.setAttribute("cy", y);
        svg.style.opacity = near;
      },
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el, start: "top top", endTrigger: journey, end: "top top",
        onUpdate: (s) => { before = s.progress; publish(); },
      });
      ScrollTrigger.create({
        trigger: journey, start: "top top", end: "bottom bottom",
        onUpdate: (s) => { along = s.progress; publish(); },
      });
      ScrollTrigger.create({
        trigger: "[data-reel]", start: "top top", end: "bottom top",
        onToggle: (s) => setActive(s.isActive || s.progress === 0),
      });
      gsap.utils.toArray("[data-chapter]").forEach((ch) => {
        const copy = ch.querySelector("[data-copy]");
        gsap.timeline({ scrollTrigger: { trigger: ch, start: "top 55%", end: "bottom 40%", scrub: 0.6 } })
          .fromTo(copy, { autoAlpha: 0, y: 70 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" })
          .to(copy, { autoAlpha: 1, duration: 0.4 })
          .to(copy, { autoAlpha: 0, y: -70, duration: 0.3, ease: "power2.in" });
      });
    }, el);
    publish();

    // The rail jumps straight to a stop.
    const jump = (e) => {
      const button = e.target.closest("[data-step]");
      if (!button) return;
      const top = journey.getBoundingClientRect().top + scrollY;
      const to = top + ((Number(button.dataset.step) + 0.2) / stops.length) * (journey.offsetHeight - innerHeight);
      if (lenis) lenis.scrollTo(to, { duration: 1.4 }); else scrollTo({ top: to, behavior: "smooth" });
    };
    rail.addEventListener("click", jump);

    return () => {
      clearTimeout(opening);
      rail.removeEventListener("click", jump);
      ctx.revert();
      leader.current = null;
      delete el.dataset.live;
      if (lenis) { gsap.ticker.remove(tick); lenis.destroy(); }
    };
  }, []);

  return (
    <div ref={root} className="exp">
      <div className="stage" aria-hidden="true">
        {stage && <Scene story={story} active={active} mobile={stage.mobile} leader={leader} />}
      </div>
      {children}
    </div>
  );
}
