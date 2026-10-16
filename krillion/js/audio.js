"use strict";
// Synthesized sounds (no asset files): a sonar ping to start a dive, key taps, a buzz for an
// answer that isn't in the bank, clock ticks in the last five seconds, a chime that climbs
// higher the rarer the answer, and a sinking tone when time runs out.

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem("krillion.muted") === "1"; } catch (e) {}

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
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
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, freq, when = 0, q = 1) {
    if (!ac) return;
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
    src.stop(t0 + dur + 0.02);
  }

  const play = {
    ping() {
      tone(1320, 1.1, "sine", 0.35);
      tone(1320, 0.9, "sine", 0.12, 0.35);
      tone(1320, 0.7, "sine", 0.05, 0.7);
    },
    key() { noise(0.03, 0.08, 3000, 0, 2); },
    wrong() {
      tone(180, 0.16, "square", 0.12);
      tone(140, 0.22, "square", 0.12, 0.09);
    },
    tick(urgent) { tone(urgent ? 1000 : 800, 0.05, "triangle", 0.15); },
    tier(t) {
      const steps = { p: 1, c: 2, s: 3, r: 4, d: 5, k: 7 }[t] || 1;
      const scale = [523, 659, 784, 988, 1175, 1319, 1568];
      for (let i = 0; i < steps; i++) tone(scale[i], 0.35, "sine", 0.22, i * 0.07);
      if (t === "k") {
        tone(2093, 0.9, "sine", 0.12, steps * 0.07);
        for (let i = 0; i < 6; i++) noise(0.18, 0.05, 2000 + i * 500, 0.2 + i * 0.08, 8);
      }
      if (t === "c") tone(330, 0.3, "triangle", 0.15, 0.15, 660);
    },
    timeout() {
      tone(440, 0.8, "sawtooth", 0.08, 0, 110);
      noise(0.6, 0.12, 400, 0.1);
    },
    bubbles() {
      for (let i = 0; i < 8; i++) tone(300 + Math.random() * 500, 0.08, "sine", 0.12, i * 0.06 + Math.random() * 0.03, 900 + Math.random() * 600);
    },
    tap() { tone(660, 0.06, "sine", 0.1); },
  };

  return {
    init,
    play(name, ...args) { if (ac && !muted && play[name]) play[name](...args); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem("krillion.muted", muted ? "1" : "0"); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
  };
})();
