"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Lingers on each stop, then moves on with an ease that has no sudden starts.
const hold = (t) => { const k = Math.min(1, Math.max(0, (t - 0.46) / 0.54)); return k * k * k * (k * (6 * k - 15) + 10); };

// Owns the scroll. `story` is the position in the film: 0 the fan at rest, 1 the problem, 2 onwards
// the stops, and the last value the finished page. If 3D can't run or motion is off, none of this
// starts and the stops simply read as a list.
export default function Experience({ stops: list, sample, children }) {
  const root = useRef(null);
  const story = useRef(0);
  const leader = useRef(null);
  const cursor = useRef({ x: 0, y: 0, on: false, seen: false, blade: -1 });
  const tag = useRef(null);
  const names = useMemo(() => list.map((s) => s[0]), [list]);
  const [stage, setStage] = useState(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = root.current;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !canRender3D()) {
      el.dataset.still = "true";
      return;
    }
    const journey = el.querySelector("[data-journey]");
    // Painting the blades takes a moment, so it waits for the headline to land: page first, then the fan.
    const opening = setTimeout(() => setStage({ mobile: innerWidth < 800 }), 900);
    if (!journey) return () => clearTimeout(opening);
    el.dataset.live = "true";

    gsap.registerPlugin(ScrollTrigger);
    const lenis = innerWidth >= 800 ? new Lenis({ lerp: 0.085 }) : null;
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
      // The last card leaves as the fan closes, so the finished register comes up clean.
      stops[stops.length - 1].classList.toggle("stop-gone", f > stops.length - 0.42);
      if (i === current) return;
      current = i;
      stops.forEach((s, n) => { s.dataset.state = n === i ? "now" : n < i ? "past" : "next"; });
      steps.forEach((s, n) => { s.dataset.state = n === i ? "now" : n < i ? "past" : "next"; });
      count.textContent = `${i + 1} / ${stops.length}`;
      name.textContent = stops[i].querySelector("h3").textContent;
    };

    const toStop = (index) => {
      const top = journey.getBoundingClientRect().top + scrollY;
      const to = top + ((index + 0.2) / stops.length) * (journey.offsetHeight - innerHeight);
      if (lenis) lenis.scrollTo(to, { duration: 1.5 }); else scrollTo({ top: to, behavior: "smooth" });
    };

    // The cursor parts the fan. Pointing at a card or a control leaves it alone.
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      const c = cursor.current;
      c.x = (e.clientX / innerWidth) * 2 - 1;
      c.y = 1 - (e.clientY / innerHeight) * 2;
      c.seen = true;
      c.on = !e.target.closest?.(".stop, .rail, .lp-nav, .chapter-copy, .acts, .ground, .register, .hero h1, .hero-foot p");
    };
    addEventListener("pointermove", onMove, { passive: true });
    const onClick = (e) => {
      if (cursor.current.blade < 0 || e.target.closest?.("a, button, input, select, textarea")) return;
      toStop(cursor.current.blade);
    };
    addEventListener("click", onClick);

    // Runs every frame from the scene: the small record that follows the cursor over a blade.
    const label = el.querySelector("[data-blade-tag]");
    let showing = -1, wide = 0;
    tag.current = {
      show(index, x, y) {
        if (index !== showing) {
          showing = index;
          label.classList.toggle("on", index >= 0);
          document.documentElement.classList.toggle("over-blade", index >= 0);
          if (index >= 0) {
            [...label.children].slice(0, 3).forEach((node, i) => { node.textContent = list[index][i]; });
            wide = label.offsetWidth;
          }
        }
        // Near the right edge it swaps to the cursor's other side, so it's never cut off.
        if (index >= 0) label.style.transform = `translate3d(${x + 18 + wide > innerWidth - 12 ? x - 18 - wide : x + 18}px, ${y - 22}px, 0)`;
      },
    };

    // Also every frame: draws a line from the card to its blade. The card's position is read once
    // per stop, because reading layout sixty times a second is what makes pages stutter.
    let cardFor = -1, r = null;
    leader.current = {
      move(x, y, near) {
        const card = stops[current]?.querySelector("[data-record]");
        if (!card || near <= 0 || innerWidth < 900) { svg.style.opacity = 0; return; }
        if (cardFor !== current) { cardFor = current; r = card.getBoundingClientRect(); }
        const from = x < r.left ? r.left : x > r.right ? r.right : r.left + r.width / 2;
        const fromY = x < r.left || x > r.right ? r.top + r.height / 2 : y < r.top ? r.top : r.bottom;
        line.setAttribute("x1", from); line.setAttribute("y1", fromY);
        line.setAttribute("x2", x); line.setAttribute("y2", y);
        dot.setAttribute("cx", x); dot.setAttribute("cy", y);
        svg.style.opacity = near;
      },
    };

    // A record slip leans towards the cursor, and the sheen on it follows.
    const onTilt = (e) => {
      const slip = e.target.closest?.(".panel");
      if (!slip) return;
      const box = slip.getBoundingClientRect();
      const px = (e.clientX - box.left) / box.width, py = (e.clientY - box.top) / box.height;
      slip.style.setProperty("--rx", `${(0.5 - py) * 5}deg`);
      slip.style.setProperty("--ry", `${(px - 0.5) * 7}deg`);
      slip.style.setProperty("--mx", `${px * 100}%`);
      slip.style.setProperty("--my", `${py * 100}%`);
    };
    el.addEventListener("pointermove", onTilt, { passive: true });

    const thread = el.querySelector("[data-thread]");
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
      if (thread) {
        ScrollTrigger.create({
          trigger: thread.parentElement, start: "top 70%", end: "bottom bottom",
          onUpdate: (s) => thread.style.setProperty("--run", String(s.progress)),
        });
      }
      gsap.utils.toArray("[data-chapter]").forEach((ch) => {
        const copy = ch.querySelector("[data-copy]");
        gsap.timeline({ scrollTrigger: { trigger: ch, start: "top 55%", end: "bottom 40%", scrub: 0.6 } })
          .fromTo(copy, { autoAlpha: 0, y: 70 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" })
          .to(copy, { autoAlpha: 1, duration: 0.4 })
          .to(copy, { autoAlpha: 0, y: -70, duration: 0.3, ease: "power2.in" });
      });
    }, el);
    publish();

    const jump = (e) => {
      const button = e.target.closest("[data-step]");
      if (button) toStop(Number(button.dataset.step));
    };
    rail.addEventListener("click", jump);

    return () => {
      clearTimeout(opening);
      rail.removeEventListener("click", jump);
      removeEventListener("pointermove", onMove);
      removeEventListener("click", onClick);
      el.removeEventListener("pointermove", onTilt);
      document.documentElement.classList.remove("over-blade");
      ctx.revert();
      leader.current = null;
      tag.current = null;
      delete el.dataset.live;
      if (lenis) { gsap.ticker.remove(tick); lenis.destroy(); }
    };
  }, [list]);

  return (
    <div ref={root} className="exp">
      <div className="stage" aria-hidden="true">
        {stage && <Scene story={story} active={active} mobile={stage.mobile} leader={leader} cursor={cursor} tag={tag} names={names} />}
      </div>
      {children}
      <div className="blade-tag" data-blade-tag aria-hidden="true"><strong /><span /><em /><small>{sample}</small></div>
    </div>
  );
}
