"use strict";
// Synthesized sounds (no asset files): the foil tear, a card flip, a rising chime for
// hits that grows with the card's rank, and a coin for selling.

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

  const ok = () => { init(); return ac && !muted; };

  return {
    get muted() { return muted; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.4; },
    tear() { if (ok()) { noise(0.35, 0.5, 3200); noise(0.2, 0.3, 1400, 0.12); } },
    flip() { if (ok()) noise(0.07, 0.35, 2200); },
    coin() { if (ok()) { tone(988, 0.08, "square", 0.12); tone(1319, 0.22, "square", 0.12, 0.07); } },
    // rank 1 rare .. 4 chase card: more notes, higher and brighter.
    hit(rank) {
      if (!ok() || rank < 1) return;
      const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, rank + 2);
      notes.forEach((f, i) => tone(f, 0.28 + rank * 0.06, rank > 2 ? "triangle" : "sine", 0.16, i * 0.07));
      if (rank >= 3) noise(0.6, 0.12, 6000, 0.1);
    },
  };
})();
