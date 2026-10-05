"use strict";
// Synthesized sounds (no asset files): pickaxe clinks, the cash register, upgrade blips,
// a fanfare for new shafts and mines, and a sparkle for nuggets. Repeating sounds are
// throttled so a busy mine stays pleasant.

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  const last = {};

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function ready(key, gap) {
    if (!ac || muted) return false;
    const now = ac.currentTime;
    if (key && last[key] && now - last[key] < gap) return false;
    if (key) last[key] = now;
    return true;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, freq, q = 1, when = 0) {
    const t0 = ac.currentTime + when;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const play = {
    clink() {
      if (!ready("clink", 0.09)) return;
      const f = 1800 + Math.random() * 900;
      tone(f, 0.08, "triangle", 0.05);
      noise(0.05, 0.05, 3000, 2);
    },
    cash() {
      if (!ready("cash", 0.22)) return;
      tone(1318, 0.09, "square", 0.04);
      tone(1760, 0.18, "square", 0.04, 0.06);
    },
    collect() {
      if (!ready("collect", 0.15)) return;
      noise(0.12, 0.08, 500, 0.8);
    },
    upgrade() {
      if (!ready("upgrade", 0.05)) return;
      tone(520, 0.08, "square", 0.06, 0, 780);
      tone(780, 0.1, "square", 0.05, 0.06, 1040);
    },
    worker() {
      if (!ready()) return;
      [660, 880, 1100].forEach((f, k) => tone(f, 0.12, "triangle", 0.08, k * 0.07));
    },
    unlock() {
      if (!ready()) return;
      [392, 523, 659, 784, 1046].forEach((f, k) => tone(f, 0.22, "square", 0.06, k * 0.09));
      noise(0.5, 0.06, 200, 0.6);
    },
    hire() {
      if (!ready()) return;
      [523, 659, 784].forEach((f, k) => tone(f, 0.16, "triangle", 0.1, k * 0.08));
    },
    ability() {
      if (!ready()) return;
      tone(300, 0.35, "sawtooth", 0.05, 0, 1200);
      noise(0.3, 0.05, 1500, 0.7);
    },
    nugget() {
      if (!ready()) return;
      [1568, 2093, 2637, 3136].forEach((f, k) => tone(f, 0.18, "sine", 0.07, k * 0.05));
    },
    prestige() {
      if (!ready()) return;
      [262, 330, 392, 523, 659, 784, 1046].forEach((f, k) => tone(f, 0.35, "triangle", 0.09, k * 0.1));
    },
    tap() {
      if (!ready("tap", 0.05)) return;
      tone(240, 0.06, "square", 0.05, 0, 180);
    },
    no() {
      if (!ready("no", 0.2)) return;
      tone(160, 0.14, "square", 0.05, 0, 120);
    },
  };

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = muted ? 0 : 0.45;
  }

  return { init, play, setMuted, get muted() { return muted; } };
})();
