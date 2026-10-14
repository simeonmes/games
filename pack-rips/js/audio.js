"use strict";
// Synthesized sounds (no asset files): taps, the pack wheel's ticks, the foil tear, the
// swell before a card turns over, a chime that grows with the card's payout range, and a
// coin for selling.

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.4;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type, gain, when = 0) {
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, freq, when = 0) {
    const t0 = ac.currentTime + when;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = "bandpass";
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // A tone that glides from one pitch to another.
  function sweep(from, to, dur, type, gain, when = 0) {
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const ok = () => { init(); return ac && !muted; };

  return {
    get muted() { return muted; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.4; },
    tear() { if (ok()) { noise(0.35, 0.5, 3200); noise(0.2, 0.3, 1400, 0.12); } },
    flip() { if (ok()) noise(0.07, 0.35, 2200); },
    tap() { if (ok()) tone(520, 0.05, "sine", 0.1); },
    buy() { if (ok()) { tone(392, 0.09, "triangle", 0.14); tone(587, 0.16, "triangle", 0.14, 0.07); } },
    tick() { if (ok()) { noise(0.03, 0.22, 4200); tone(1500, 0.03, "square", 0.03); } },
    pick() { if (ok()) { sweep(260, 780, 0.28, "sine", 0.16); noise(0.25, 0.12, 1800); } },
    scratch() { if (ok()) noise(0.05, 0.16, 3600); },
    // The card rising face down: longer and brighter for the better ranges.
    swell(rank) { if (ok()) { sweep(140, 300 + rank * 130, 0.6, "sawtooth", 0.035 + rank * 0.012); noise(0.6, 0.05 + rank * 0.02, 900 + rank * 500); } },
    coin() { if (ok()) { tone(988, 0.08, "square", 0.12); tone(1319, 0.22, "square", 0.12, 0.07); } },
    // rank 0 lowest range .. 4 top range: more notes, higher and brighter.
    hit(rank) {
      if (!ok()) return;
      if (rank < 1) return tone(330, 0.22, "sine", 0.12);
      const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, rank + 2);
      notes.forEach((f, i) => tone(f, 0.28 + rank * 0.06, rank > 2 ? "triangle" : "sine", 0.16, i * 0.07));
      if (rank >= 3) noise(0.6, 0.12, 6000, 0.1);
    },
  };
})();
