"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Volume2, VolumeX } from "lucide-react";
import { BEATS, clamp, clockLabel, CLOSE, FOUND, MONEY, number, ramp, rupees, TRADE_DATA } from "./day";
import { createSound } from "./sound";
import { fill, STORY } from "./story";

const Scene = dynamic(() => import("./Scene"), { ssr: false }); // only downloaded if it will run

// A slow or metered connection, or a low-memory phone, keeps the still picture instead.
function canRender3D() {
  const net = navigator.connection;
  if (net?.saveData || /(^|-)[23]g$/.test(net?.effectiveType ?? "") || navigator.deviceMemory < 3) return false;
  try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch { return false; }
}

const FORM_TYPE = { fabrication: 2, garage: 0, bakery: 1, tailoring: 1, trading: 3, printing: 4 };

// The shop. The visitor paints their name on the shutter, lifts it and runs one day from the counter.
// `run` holds what changes every frame; React only hears about it when the words on screen change.
export default function Experience({ lang, descriptor, headline, children }) {
  const s = STORY[lang];
  const root = useRef(null), action = useRef(null), clock = useRef(null), counted = useRef(null), sunKnob = useRef(null), flash = useRef(null), notice = useRef(null), book = useRef(null);
  const sound = useMemo(() => createSound(), []);
  const [stage, setStage] = useState(null);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("fabrication");
  const [view, setView] = useState({ phase: "street", beat: 0 });
  const [muted, setMuted] = useState(false);
  const [still, setStill] = useState(false);
  const run = useRef({ stage: "street", phase: "street", lift: 0, push: 0, dusk: 0, t: 0, beat: 0, view: "home", shake: 0, pointer: { x: 0, y: 0 }, name: "", tag: "", chalk: s.chalk, sound });

  const values = useMemo(() => {
    const data = TRADE_DATA[trade], words = s.trades[trade];
    return {
      customer: words.customer, item: words.item, unit: words.unit, rate: data.rate, qty: number(data.qty, lang), stock: number(data.stock, lang),
      free: number(data.stock - data.qty, lang), used: fill(words.usedLine, { used: number(data.used, lang) }), name: name.trim() || s.defaultName,
    };
  }, [trade, name, lang, s]);

  // The rows of the day as R.K. kept them, newest first. The diesel entry is the one the book missed.
  const rows = useMemo(() => {
    const d = s.day;
    return [
      { t: CLOSE, who: s.you, what: d.counted, amount: rupees(MONEY.box, lang) },
      { t: 430, who: s.you, what: d.tea, amount: `- ${rupees(MONEY.tea, lang)}` },
      { t: 390, who: s.you, what: fill(d.received, values), amount: `+ ${rupees(MONEY.received, lang)}` },
      { t: FOUND, who: s.workers[0], what: s.found.entry, amount: `- ${rupees(MONEY.diesel, lang)}`, key: true },
      { t: 251, who: s.you, what: d.invoice, amount: rupees(10620, lang) },
      { t: 250, who: s.workers[1], what: fill(d.challan, values) },
      { t: 135, who: s.workers[0], what: fill(d.made, values) },
      { t: 40, who: s.you, what: fill(d.order, values), amount: rupees(9000, lang) },
      { t: 5, who: s.you, what: d.staff },
    ];
  }, [s, values, lang]);

  const unlock = useCallback(() => document.documentElement.classList.remove("in-story"), []);

  // Keyboard users land on each new action as it appears. Pointer users don't see a focus ring.
  useEffect(() => { if (view.phase !== "street") action.current?.focus({ preventScroll: true }); }, [view]);

  const show = useCallback((phase, beat) => {
    const r = run.current;
    r.phase = phase;
    if (beat !== undefined) r.beat = beat;
    setView({ phase, beat: r.beat });
    root.current?.setAttribute("data-phase", phase);
  }, []);

  useEffect(() => {
    const r = run.current;
    r.name = name.trim();
    r.tag = name.trim() ? s.trades[trade].label : "";
    r.values = values;
    r.repaint?.();
  }, [name, trade, values, s]);

  const startDay = useCallback(() => {
    const r = run.current;
    r.stage = "counter";
    r.t = -30;
    r.view = "home";
    r.cut = true;
    r.count = 0;
    r.prepareDay?.();
    r.travelFrom = r.t;
    r.travelled = 0;
    show("travel", -1);
  }, [show]);

  const open = useCallback(() => {
    const r = run.current;
    if (r.phase !== "street") return;
    sound.wake();
    document.documentElement.classList.add("in-story");
    window.scrollTo(0, 0);
    r.rising = true;
  }, [sound]);

  const nextBeat = useCallback(() => {
    const r = run.current;
    r.travelFrom = r.t;
    r.travelled = 0;
    show("travel");
  }, [show]);

  const finishBeat = useCallback(() => {
    const r = run.current;
    const beat = BEATS[r.beat];
    r.hold = beat.id === "count" ? 1.1 : beat.quick ? 0.7 : 2;
    if (!beat.quick && beat.id !== "count") r.view = "book";
    show("done");
  }, [show]);

  // Called from the frame loop, once a frame, before anything draws.
  useEffect(() => {
    const r = run.current;
    let slatGap = 0, lastT = 0;
    r.finishBeat = finishBeat;
    r.setCount = (value) => { if (counted.current) counted.current.textContent = rupees(value, lang); };
    r.tick = (dt) => {
      if (r.rising || r.falling) {
        const before = r.lift;
        r.lift = clamp(r.lift + (r.rising ? 1 : -1.5) * dt * 1.15);
        rattle(Math.abs(r.lift - before) / dt);
        if (r.falling && r.lift <= 0) { r.falling = false; sound.slam(); r.shake = 1; }
        if (r.rising && r.lift >= 1) { r.rising = false; sound.slam(); show("entering"); r.push = 0; }
      }
      if (r.closing) {
        const before = r.lift;
        r.lift = clamp(r.lift - dt * 1.1);
        rattle(Math.abs(r.lift - before) / dt);
        if (r.lift <= 0) {
          r.closing = false;
          sound.slam();
          r.shake = 1;
          r.reset?.();
          setTimeout(() => sound.lock(), 320);
          r.afterClose?.();
        }
      }
      if (notice.current) {
        notice.current.style.setProperty("--rise", `${r.lift * -105}svh`);
        notice.current.style.setProperty("--shown", clamp(1 - r.lift * 4));
      }
      if (r.phase === "entering") {
        r.push = Math.min(1, r.push + dt / 1.1);
        if (flash.current) flash.current.style.opacity = ramp(r.push, 0.42, 0.92);
        if (r.push >= 1) { startDay(); r.fade = 1; }
      }
      if (r.fade > 0) {
        r.fade = Math.max(0, r.fade - dt / 1.2);
        if (flash.current) flash.current.style.opacity = r.fade;
      }
      if (r.phase === "travel") {
        const next = BEATS[r.beat + 1];
        r.travelled = Math.min(1, r.travelled + dt / next.seconds);
        const k = r.travelled, eased = k * k * (3 - 2 * k);
        r.t = r.travelFrom + (next.t - r.travelFrom) * eased;
        r.view = next.stay || k > 0.62 ? next.view : "home";
        if (k >= 1) { r.t = next.t; show("wait", r.beat + 1); }
      }
      if (r.phase === "wait" || r.phase === "done") {
        // The clock doesn't quite stop during the invoice. That's when the money goes.
        if (BEATS[r.beat].id === "invoice" && r.t < 254) r.t += dt * 0.42;
      }
      if (r.phase === "done") {
        // Time runs on as the entry goes in the book.
        const beat = BEATS[r.beat];
        if (!beat.quick && beat.id !== "count" && r.t >= 254 - 300 * (beat.id !== "invoice")) r.t += dt * 2.6;
        r.hold -= dt;
        if (r.hold <= 0) {
          if (BEATS[r.beat].id === "count") { sound.drop(); show("short"); }
          else nextBeat();
        }
      }
      if (r.phase === "rewind" && !r.scrubbing && r.autoBack) { r.t = Math.max(FOUND, r.t - dt * 180); }
      if (r.phase === "rewind") {
        const rate = Math.abs(r.t - lastT) / Math.max(dt, 0.001) / 240;
        if (rate > 0.02 && Math.random() < 0.4) sound.sweep(Math.min(1, rate));
        if (r.t <= FOUND + 0.5) { r.t = FOUND - 1.2; r.autoBack = false; sound.found(); r.view = "found"; show("found"); }
      }
      if (r.phase === "found" && r.t < 254) r.t += dt * 0.5;
      lastT = r.t;
      if (clock.current) clock.current.textContent = clockLabel(Math.max(0, r.t), lang);
      if (sunKnob.current) sunKnob.current.style.setProperty("--at", clamp(r.t / 600));
      if (book.current) book.current.querySelectorAll("[data-t]").forEach((row) => { row.dataset.on = r.phase === "found" || r.phase === "shut" || r.t <= Number(row.dataset.t) + 0.5 ? "1" : "0"; });
    };
    function rattle(speed) {
      slatGap += speed * 0.016 * 60;
      if (slatGap > 1.2) { slatGap = 0; sound.slat(Math.min(1, speed)); }
    }
    r.rattle = rattle;
    return () => { r.tick = null; };
  }, [finishBeat, lang, nextBeat, show, sound, startDay]);

  useEffect(() => {
    const el = root.current;
    const settle = () => { delete el.dataset.live; el.dataset.still = "true"; setStill(true); };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !canRender3D()) { settle(); return; }
    el.dataset.live = "true";
    const r = run.current;
    // If the shop can't be built, the page simply stays as the picture and reads on below.
    const giveUp = setTimeout(settle, 20000);
    r.onReady = () => { clearTimeout(giveUp); setReady(true); el.dataset.painted = "true"; };
    const opening = setTimeout(() => setStage({ mobile: innerWidth < 800 }), 300);
    const watch = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.02 });
    watch.observe(el.querySelector(".shop"));
    return () => { clearTimeout(opening); clearTimeout(giveUp); watch.disconnect(); document.documentElement.classList.remove("in-story"); };
  }, []);

  // Pointer: the shutter is handled here; on the counter it goes to the scene as a spot on the desk.
  useEffect(() => {
    const shop = root.current.querySelector(".shop");
    const r = run.current;
    r.setCursor = (kind) => { shop.style.cursor = kind; };
    shop.shop = r;      // lets the end-to-end test find things on the counter
    let drag = null;
    const ndc = (e) => {
      const box = shop.getBoundingClientRect();
      return [((e.clientX - box.left) / box.width) * 2 - 1, 1 - ((e.clientY - box.top) / box.height) * 2];
    };
    const shutterDrag = (e) => {
      const pull = e.target.closest?.("[data-pull]");
      return pull && (r.phase === "street" || r.phase === "shut");
    };
    const capture = (e) => { try { shop.setPointerCapture(e.pointerId); } catch { /* the pointer has already gone */ } };
    const down = (e) => {
      if (e.target.closest?.("button, a, input, label")) return;
      sound.wake();
      if (shutterDrag(e)) {
        capture(e);
        drag = { y: e.clientY, lift: r.lift, last: r.lift };
        if (r.phase === "street") document.documentElement.classList.add("in-story");
        return;
      }
      const [x, y] = ndc(e);
      if (r.phase === "rewind") { drag = { x: e.clientX, t: r.t }; r.scrubbing = true; capture(e); return; }
      r.input?.("down", x, y);
      capture(e);
    };
    const move = (e) => {
      const [x, y] = ndc(e);
      if (e.pointerType !== "touch") { r.pointer.x = x; r.pointer.y = y; }
      if (drag && drag.lift !== undefined) {
        const travel = (e.clientY - drag.y) / (innerHeight * 0.6);
        const next = clamp(drag.lift - travel);
        r.rattle?.(Math.abs(next - drag.last) * 40);
        drag.last = next;
        r.lift = next;
        return;
      }
      if (drag && r.phase === "rewind") {
        const moved = (e.clientX - drag.x) / shop.clientWidth;
        r.t = Math.min(CLOSE, Math.max(FOUND, drag.t + moved * 620));
        return;
      }
      r.input?.("move", x, y);
    };
    const up = () => {
      if (drag && drag.lift !== undefined) {
        if (r.phase === "street") {
          if (r.lift > 0.3) r.rising = true;
          else if (r.lift > 0) { r.falling = true; document.documentElement.classList.remove("in-story"); }
          else document.documentElement.classList.remove("in-story");
        } else if (r.lift < 0.8) r.closing = true;
        else r.lift = 1;
      } else if (r.phase !== "rewind") {
        r.input?.("up", 0, 0);
      }
      r.scrubbing = false;
      drag = null;
    };
    shop.addEventListener("pointerdown", down);
    shop.addEventListener("pointermove", move);
    shop.addEventListener("pointerup", up);
    shop.addEventListener("pointercancel", up);
    return () => {
      shop.removeEventListener("pointerdown", down);
      shop.removeEventListener("pointermove", move);
      shop.removeEventListener("pointerup", up);
      shop.removeEventListener("pointercancel", up);
    };
  }, [sound]);

  const skip = () => {
    const r = run.current;
    r.stage = "street"; r.phase = "street"; r.lift = 0; r.push = 0; r.dusk = 0; r.rising = r.falling = r.closing = false; r.t = 0;
    if (flash.current) flash.current.style.opacity = 0;
    r.reset?.();
    show("street", 0);
    unlock();
    document.getElementById("platform")?.scrollIntoView();
  };

  const startRewind = () => { sound.lift(); run.current.view = "rewind"; run.current.t = CLOSE; show("rewind"); };
  const goBack = () => { run.current.autoBack = true; };
  const toStreet = () => {
    const r = run.current;
    r.stage = "street"; r.dusk = 1; r.lift = 1; r.push = 0; r.fade = 1;
    show("shut");
  };
  const pullDown = () => { run.current.closing = true; };
  const again = () => {
    const r = run.current;
    r.dusk = 0; r.lift = 0; r.push = 0; r.t = 0;
    r.reset?.();
    show("street", 0);
    setTimeout(() => { document.documentElement.classList.add("in-story"); window.scrollTo(0, 0); run.current.rising = true; }, 200);
  };
  const toDemo = () => {
    const form = document.querySelector(".demo-form");
    if (form) {
      form.querySelector('input[name="company"]').value = name.trim();
      const select = form.querySelector('select[name="business_type"]');
      select.selectedIndex = FORM_TYPE[trade] + 1;
    }
  };

  useEffect(() => {
    const r = run.current;
    r.afterClose = () => { unlock(); show("closed"); };
  }, [show, unlock]);

  const toggleSound = () => {
    sound.wake();
    sound.setOn(muted);
    setMuted(!muted);
  };

  const beat = BEATS[view.beat];
  const beatWords = beat ? s.beats[beat.id] : null;
  const inDay = view.phase === "wait" || view.phase === "done" || view.phase === "travel";
  const line = (text) => fill(text ?? "", values);
  const perform = () => run.current.perform?.();

  return (
    <div ref={root} className="exp" data-phase="street">
      <section className="shop" aria-label={descriptor}>
        <div className="stage" aria-hidden="true">
          {stage && <Scene run={run} mobile={stage.mobile} lang={lang} active={active} />}
        </div>

        <form ref={notice} className="notice" onSubmit={(e) => { e.preventDefault(); open(); }}>
          <p className="mono">{descriptor}</p>
          <h1>{headline}</h1>
          <p className="notice-intro">{s.intro} <em>{s.time}</em></p>
          <div className="notice-play">
            <label className="field">
              <span>{s.nameLabel}</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 28))} placeholder={s.namePlaceholder} autoComplete="organization" enterKeyHint="go" />
            </label>
            <fieldset className="trades">
              <legend>{s.tradeLabel}</legend>
              {Object.entries(s.trades).map(([key, t]) => (
                <label key={key} className={key === trade ? "on" : ""}>
                  <input type="radio" name="trade" value={key} checked={key === trade} onChange={() => setTrade(key)} />{t.label}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="act" disabled={!ready}>{s.open} <ArrowUp size={17} /></button>
          </div>
          <a href="#platform" className="notice-skip">{still ? s.closed.read : s.skip}</a>
        </form>

        <div className="pull" data-pull data-for="up" aria-hidden="true"><span><ArrowUp size={15} /> {s.drag}</span></div>
        <div className="pull pull-down" data-pull data-for="down" aria-hidden="true"><span><ArrowDown size={15} /> {s.pullDown}</span></div>

        <div ref={flash} className="whiteout" aria-hidden="true" />

        <div className="story-bar">
          <button type="button" onClick={toggleSound} aria-label={muted ? s.soundOn : s.soundOff}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <button type="button" onClick={skip}>{s.skip}</button>
        </div>

        <div className="caption" aria-live="polite">
          <p className="caption-time" ref={clock} />
          {inDay && beatWords && view.phase !== "travel" && (
            <>
              <h2>{line(view.phase === "done" ? beatWords.done || beatWords.title : beatWords.title)}</h2>
              {view.phase === "wait" && <p>{line(beatWords.text)}</p>}
              {view.phase === "wait" && <button ref={action} type="button" className="caption-act" onClick={perform}>{beatWords.act}</button>}
              {beat.id === "count" && <p className="count"><span>{s.counted}</span> <b ref={counted}>{rupees(0, lang)}</b></p>}
            </>
          )}
          {view.phase === "short" && (
            <>
              <h2>{s.short.title}</h2>
              <p>{s.short.text}</p>
              <button ref={action} type="button" className="act" onClick={startRewind}>{s.short.act}</button>
            </>
          )}
          {view.phase === "rewind" && (
            <>
              <h2>{s.rewind.title}</h2>
              <p>{s.rewind.text}</p>
              <button ref={action} type="button" className="caption-act" onClick={goBack}>{s.rewind.act}</button>
            </>
          )}
          {view.phase === "found" && (
            <>
              <h2>{s.found.title}</h2>
              <p>{s.found.text}</p>
              <button ref={action} type="button" className="act" onClick={toStreet}>{s.found.act}</button>
            </>
          )}
          {view.phase === "shut" && (
            <>
              <h2>{s.shut.title}</h2>
              <p>{s.shut.text}</p>
              <button ref={action} type="button" className="caption-act" onClick={pullDown}>{s.shut.act}</button>
            </>
          )}
        </div>

        <div className="sun-track" ref={sunKnob} aria-hidden="true"><i /></div>

        <aside className="daybook" ref={book} aria-label={s.rewind.label}>
          <strong>{s.rewind.label}</strong>
          <ol>
            {rows.map((row) => (
              <li key={row.t + row.what} data-t={row.t} data-key={row.key ? "1" : undefined}>
                <time>{clockLabel(row.t, lang)}</time>
                <span><b>{row.who}</b> {row.what}</span>
                <em>{row.amount}</em>
              </li>
            ))}
          </ol>
          <dl>{s.found.tally.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
          <p className="daybook-stamp">{s.found.stamp}</p>
        </aside>

        {view.phase === "closed" && (
          <div className="notice notice-closed">
            <p className="mono">{s.closed.time}</p>
            <h2>{s.closed.title}</h2>
            <p>{fill(s.closed.text, values)}</p>
            <div className="acts">
              <a href="#demo" className="act" onClick={toDemo}>{s.closed.demo}</a>
              <button type="button" className="act act-line" onClick={again}>{s.closed.again}</button>
            </div>
            <a href="#platform" className="notice-skip">{s.closed.read}</a>
          </div>
        )}
      </section>
      {children}
    </div>
  );
}
