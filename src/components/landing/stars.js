// The night sky: faint stars stay put, gold ones gather into the circuit on the arm.
export const seeded = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
export const clamp = (v) => Math.min(1, Math.max(0, v));
export const ramp = (v, a, b) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const sprite = (size, paint) => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size / 2);
  return c;
};

const halo = (g, m) => {
  const r = g.createRadialGradient(m, m, 0, m, m, m);
  r.addColorStop(0, "rgb(255 250 236 / 1)");
  r.addColorStop(0.09, "rgb(255 232 190 / 0.85)");
  r.addColorStop(0.3, "rgb(242 176 88 / 0.2)");
  r.addColorStop(1, "rgb(242 176 88 / 0)");
  g.fillStyle = r;
  g.fillRect(0, 0, m * 2, m * 2);
};

const flare = (g, m) => {
  halo(g, m);
  g.strokeStyle = "rgb(255 236 200 / 0.55)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(m * 0.1, m); g.lineTo(m * 1.9, m);
  g.moveTo(m, m * 0.1); g.lineTo(m, m * 1.9);
  g.stroke();
};

export function starfield(canvas, arms, goals) {
  const ctx = canvas.getContext("2d");
  const soft = sprite(64, halo), bright = sprite(96, flare);
  let w = 0, h = 0, W = 0, midX = 0, midY = 0, apart = 0.19, cleared = false;

  const faint = Array.from({ length: innerWidth < 700 ? 90 : 190 }, (_, i) => ({
    x: seeded(i + 21), y: seeded(i + 57), s: 4 + seeded(i + 93) ** 3 * 10, a: 0.3 + seeded(i + 131) * 0.6, tw: 0.3 + seeded(i + 171) * 0.7, at: seeded(i + 211) * 6.283, deep: 3 + seeded(i + 251) * 7,
  }));
  const gold = goals.map(([px, py], i) => ({
    px, py, x: 0.04 + seeded(i + 301) * 0.92, y: 0.08 + seeded(i + 341) * 0.84, at: seeded(i + 381), s: i % 6 === 0 ? 46 : 20 + seeded(i + 421) * 12, flared: i % 6 === 0, phase: seeded(i + 461) * 6.283,
  }));
  // Each gold star links to its nearest neighbours, so the sky reads as constellations.
  const links = [];
  gold.forEach((a, i) => {
    gold.map((b, j) => [Math.hypot(a.x - b.x, (a.y - b.y) * 0.62), j])
      .filter(([, j]) => j !== i).sort((m, n) => m[0] - n[0]).slice(0, 2)
      .forEach(([far, j]) => { if (far < 0.24 && !links.some(([m, n]) => m === j && n === i)) links.push([i, j]); });
  });

  const fit = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = arms.offsetWidth; midX = arms.offsetLeft; midY = arms.offsetTop;
    apart = Number(getComputedStyle(arms).getPropertyValue("--apart")) || apart;
    cleared = false;
  };

  const paint = (p, night, reach, aim, now) => {
    const end = 1 - ramp(p, 0.26, 0.37);
    if (night <= 0 && end <= 0) {
      if (!cleared) { ctx.clearRect(0, 0, w, h); cleared = true; }
      return;
    }
    cleared = false;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const t = now / 1000;
    faint.forEach((s) => {
      ctx.globalAlpha = s.a * (0.72 + 0.28 * Math.sin(t * s.tw + s.at)) * night;
      ctx.drawImage(soft, s.x * w - aim.x * s.deep - s.s / 2, s.y * h - aim.y * s.deep - s.s / 2, s.s, s.s);
    });
    const shift = (1 - reach) * apart * W - 0.009 * W;
    const at = gold.map((s) => {
      const k = ramp(p, 0.025 + s.at * 0.08, 0.15 + s.at * 0.08);
      const tx = midX + (s.px / 740 - 0.5) * W + shift, ty = midY + (s.py / 416 - 0.5) * W * 0.5622;
      const sx = s.x * w - aim.x * 12, sy = s.y * h - aim.y * 12, bow = Math.sin(k * Math.PI) * 0.09 * h;
      return { x: sx + (tx - sx) * k, y: sy + (ty - sy) * k - bow, k };
    });
    const web = 0.34 * ramp(p, 0.03, 0.08) * (1 - ramp(p, 0.19, 0.25));
    if (web > 0) {
      ctx.globalAlpha = web;
      ctx.strokeStyle = "#f2c27a";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      links.forEach(([a, b]) => { ctx.moveTo(at[a].x, at[a].y); ctx.lineTo(at[b].x, at[b].y); });
      ctx.stroke();
    }
    gold.forEach((s, i) => {
      const size = s.s * (1 - at[i].k * 0.55), art = s.flared ? bright : soft;
      ctx.globalAlpha = end * (0.8 + 0.2 * Math.sin(t * 0.9 + s.phase));
      ctx.drawImage(art, at[i].x - size / 2, at[i].y - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  return { fit, paint };
}
