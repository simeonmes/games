"use strict";
// Synthesized audio (no asset files): a two-stroke engine that follows the back wheel,
// landings, crashes, TNT, checkpoint and flip chimes, and a finish fanfare.

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null, engine = null;
  let muted = false;

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, freq, q = 1, when = 0, type = "bandpass") {
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  function makeEngine() {
    if (!ac || engine) return;
    const osc = ac.createOscillator(), osc2 = ac.createOscillator();
    osc.type = "sawtooth"; osc2.type = "square";
    osc.frequency.value = 50; osc2.frequency.value = 25;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 3;
    const g = ac.createGain(), g2 = ac.createGain();
    g.gain.value = 0; g2.gain.value = 0.35;
    osc.connect(lp); osc2.connect(g2).connect(lp);
    lp.connect(g).connect(master);
    osc.start(); osc2.start();
    engine = { osc, osc2, lp, g };
  }

  function updateEngine(rev01, gas, active) {
    if (!ac) return;
    makeEngine();
    const t = ac.currentTime, e = engine;
    const r = Math.max(0, Math.min(1, rev01));
    e.g.gain.setTargetAtTime(active ? 0.05 + r * 0.05 + (gas ? 0.03 : 0) : 0, t, 0.06);
    e.osc.frequency.setTargetAtTime(46 + r * 150 + (gas ? 12 : 0), t, 0.05);
    e.osc2.frequency.setTargetAtTime(23 + r * 75, t, 0.05);
    e.lp.frequency.setTargetAtTime(380 + r * 1500 + (gas ? 300 : 0), t, 0.06);
  }

  return {
    init,
    get ready() { return !!ac; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    updateEngine,
    stopEngine() { if (engine) engine.g.gain.value = 0; },
    land(p) { if (p > 0.08) { noise(0.12, 0.05 + p * 0.25, 260, 0.8); tone(80, 0.12, "sine", 0.1 + p * 0.2, 0, 45); } },
    crash() {
      noise(0.5, 0.35, 700, 0.6);
      tone(140, 0.35, "square", 0.12, 0, 50);
      noise(0.25, 0.2, 2600, 1.5, 0.05);
    },
    boom() {
      noise(1.1, 0.6, 180, 0.5, 0, "lowpass");
      noise(0.5, 0.35, 900, 0.6);
      tone(70, 0.8, "sine", 0.5, 0, 28);
    },
    flip(n) {
      tone(660, 0.12, "triangle", 0.14);
      tone(990, 0.18, "triangle", 0.12, 0.08);
      if (n > 1) tone(1320, 0.22, "triangle", 0.12, 0.16);
    },
    checkpoint() { tone(784, 0.12, "square", 0.08); tone(1175, 0.25, "square", 0.08, 0.1); },
    finish() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, "square", 0.08, i * 0.1));
      noise(1.2, 0.18, 3000, 0.5, 0.3, "highpass");
    },
    star(i) { tone(880 + i * 220, 0.22, "triangle", 0.15); },
    click() { tone(520, 0.05, "square", 0.05); },
  };
})();
