"use client";

import { useEffect, useState } from "react";
import { SKY_PHASES, skyAt } from "@/lib/sky";

// Seeded so the server and the browser draw exactly the same stars.
function starField(count, seed) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: count }, () => `${(rand() * 100).toFixed(1)}vw ${(rand() * 62).toFixed(1)}vh`).join(", ");
}
const STARS = [starField(70, 7), starField(45, 19), starField(24, 41)];

// The living background: sky colours, sun or moon, drifting clouds, birds at sunrise and sunset,
// and twinkling stars at night. Purely decorative. Colours and positions live in globals.css;
// this only says which phase it is and how far through it (--p, 0 → 1).
// Add ?sky=dawn|day|dusk|night to any URL to preview a phase.
export default function SkyScene({ initial, variant = "app" }) {
  const [sky, setSky] = useState(initial);

  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("sky");
    const update = () => setSky(SKY_PHASES.includes(forced) ? { phase: forced, progress: 0.5 } : skyAt());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`sky sky-${variant}`} data-phase={sky.phase} style={{ "--p": sky.progress }} aria-hidden="true">
      <div className="sky-glow" />
      <div className="sky-stars">
        {STARS.map((shadow, i) => <i key={i} style={{ boxShadow: shadow }} />)}
        <b className="sky-shooting" />
      </div>
      <div className="sky-sun" />
      <div className="sky-moon" />
      <div className="sky-clouds"><i /><i /><i /><i /></div>
      <svg className="sky-birds" viewBox="0 0 120 40">
        <g><path d="M0 12 Q6 5 12 12 Q18 5 24 12" /></g>
        <g><path d="M36 4 Q41 -2 46 4 Q51 -2 56 4" /></g>
        <g><path d="M30 26 Q34 21 38 26 Q42 21 46 26" /></g>
      </svg>
      {variant === "app" && (
        <svg className="sky-hills" viewBox="0 0 1440 240" preserveAspectRatio="none">
          <path d="M0 120 L180 70 L340 110 L520 40 L700 104 L880 60 L1060 112 L1240 66 L1440 100 V240 H0Z" />
          <path d="M0 170 L220 128 L420 160 L640 118 L860 164 L1080 130 L1280 160 L1440 138 V240 H0Z" />
        </svg>
      )}
    </div>
  );
}
