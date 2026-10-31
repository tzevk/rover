// The shop's sounds, made in the browser so nothing is downloaded. Starts on the visitor's first
// gesture, as browsers require, and can be turned off.
export function createSound() {
  let ctx = null, out = null, room = null, on = true;
  const AudioCtx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;

  function noiseBuffer(seconds) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function burst({ at = 0, length = 0.08, gain = 0.3, type = "bandpass", freq = 1800, q = 1.2 }) {
    if (!ctx || !on) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + at;
    s.buffer = noiseBuffer(length + 0.02);
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + length);
    s.connect(f).connect(g).connect(out);
    s.start(t);
  }

  function tone({ at = 0, freq = 440, to, length = 0.2, gain = 0.2, type = "sine" }) {
    if (!ctx || !on) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + length);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + length);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.02);
  }

  // A low street hum and fan, always under everything.
  function startRoom() {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    room = ctx.createGain();
    s.buffer = noiseBuffer(3);
    s.loop = true;
    f.type = "lowpass";
    f.frequency.value = 420;
    room.gain.value = 0.035;
    s.connect(f).connect(room).connect(out);
    s.start();
  }

  return {
    wake() {
      if (!AudioCtx) return;
      if (!ctx) {
        ctx = new AudioCtx();
        out = ctx.createGain();
        out.gain.value = on ? 0.8 : 0;
        out.connect(ctx.destination);
        startRoom();
      }
      if (ctx.state === "suspended") ctx.resume();
    },
    setOn(value) {
      on = value;
      if (out) out.gain.value = value ? 0.8 : 0;
    },
    get on() { return on; },
    // One slat passing the guide. Called as the shutter moves, so it rattles at the speed of the hand.
    slat(speed) { burst({ length: 0.05, gain: 0.05 + speed * 0.12, freq: 900 + Math.random() * 900, q: 3 }); tone({ freq: 190 + Math.random() * 90, length: 0.05, gain: 0.03 + speed * 0.05, type: "square" }); },
    slam() { tone({ freq: 96, to: 42, length: 0.34, gain: 0.5 }); burst({ length: 0.2, gain: 0.3, freq: 620, q: 0.8 }); for (let i = 1; i < 4; i++) burst({ at: i * 0.06, length: 0.04, gain: 0.1 / i, freq: 1500, q: 3 }); },
    lock() { burst({ length: 0.02, gain: 0.3, freq: 3200, q: 6 }); burst({ at: 0.09, length: 0.03, gain: 0.34, freq: 2200, q: 6 }); },
    tick() { burst({ length: 0.035, gain: 0.2, freq: 2600, q: 2 }); },
    stamp() { tone({ freq: 140, to: 58, length: 0.16, gain: 0.5 }); burst({ length: 0.05, gain: 0.3, type: "lowpass", freq: 900 }); },
    pen() { burst({ length: 0.06, gain: 0.05, freq: 5200, q: 1 }); },
    tear() { burst({ length: 0.05, gain: 0.14 + Math.random() * 0.1, freq: 2600 + Math.random() * 2400, q: 1.4 }); },
    paper() { burst({ length: 0.16, gain: 0.1, freq: 3400, q: 0.7 }); },
    notes() { for (let i = 0; i < 3; i++) burst({ at: i * 0.05, length: 0.06, gain: 0.1, freq: 4200, q: 1 }); },
    count() { burst({ length: 0.04, gain: 0.1, freq: 4600, q: 1.4 }); },
    coins() { [2800, 3600, 4300].forEach((f, i) => tone({ at: i * 0.05, freq: f, length: 0.22, gain: 0.05 })); },
    buzz() { for (let i = 0; i < 2; i++) tone({ at: i * 0.2, freq: 150, length: 0.15, gain: 0.14, type: "sawtooth" }); },
    ring() { for (let i = 0; i < 4; i++) tone({ at: i * 0.11, freq: i % 2 ? 1320 : 990, length: 0.1, gain: 0.08 }); },
    horn() { tone({ freq: 420, length: 0.22, gain: 0.06, type: "square" }); tone({ at: 0.28, freq: 420, length: 0.3, gain: 0.06, type: "square" }); },
    sweep(rate) { burst({ length: 0.07, gain: 0.03 + rate * 0.08, type: "highpass", freq: 900 + rate * 1400 }); },
    found() { [523, 659, 784].forEach((f, i) => tone({ at: i * 0.11, freq: f, length: 0.6, gain: 0.09 })); },
    drop() { tone({ freq: 220, to: 92, length: 1.1, gain: 0.1 }); if (room) room.gain.value = 0.012; },
    lift() { if (room) room.gain.value = 0.035; },
  };
}
