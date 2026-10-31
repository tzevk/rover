"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

const Scene = dynamic(() => import("./Scene"), { ssr: false }); // only downloaded if it will run

// A slow or metered connection, or a low-memory phone, keeps the still background instead.
function canRender3D() {
  const net = navigator.connection;
  if (net?.saveData || /(^|-)[23]g$/.test(net?.effectiveType ?? "") || navigator.deviceMemory < 3) return false;
  try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch { return false; }
}

// Owns the scroll: smooth wheel movement, the 0 → 1 story position for the camera, and each
// chapter's text. If 3D can't run or motion is off, the page keeps a still background and the
// chapters simply read one after another.
export default function Experience({ children }) {
  const root = useRef(null);
  const progress = useRef(0);
  const [stage, setStage] = useState(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still && canRender3D()) setStage({ mobile: innerWidth < 800 });
    if (still) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = innerWidth >= 800 ? new Lenis({ lerp: 0.09 }) : null;
    const tick = (t) => lenis?.raf(t * 1000);
    if (lenis) { lenis.on("scroll", ScrollTrigger.update); gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0); }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: "[data-reel]", start: "top top", end: "bottom bottom",
        onUpdate: (s) => { progress.current = s.progress; },
        onToggle: (s) => setActive(s.isActive || s.progress === 0),
      });
      const steps = gsap.utils.toArray("[data-step]");
      if (steps.length) {
        ScrollTrigger.create({
          trigger: "[data-flow]", start: "top top", end: "bottom bottom",
          onUpdate: (s) => {
            const at = Math.min(steps.length - 1, Math.floor(s.progress * steps.length));
            steps.forEach((el, i) => { el.dataset.state = i < at ? "past" : i === at ? "now" : "next"; });
          },
        });
      }
      gsap.utils.toArray("[data-chapter]").forEach((ch) => {
        const copy = ch.querySelector("[data-copy]");
        gsap.timeline({ scrollTrigger: { trigger: ch, start: "top 55%", end: "bottom 40%", scrub: 0.6 } })
          .fromTo(copy, { autoAlpha: 0, y: 70 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" })
          .to(copy, { autoAlpha: 1, duration: 0.4 })
          .to(copy, { autoAlpha: 0, y: -70, duration: 0.3, ease: "power2.in" });
      });
    }, root);

    return () => { ctx.revert(); if (lenis) { gsap.ticker.remove(tick); lenis.destroy(); } };
  }, []);

  return (
    <div ref={root} className="exp">
      <div className="stage" aria-hidden="true">
        {stage && <Scene progress={progress} active={active} mobile={stage.mobile} />}
      </div>
      {children}
    </div>
  );
}
