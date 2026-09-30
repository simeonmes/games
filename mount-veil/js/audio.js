"use strict";
// Synthesized sound effects plus a soft wind loop (no audio files).

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null, wind = null, muted = false;

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startWind();
  }

  function startWind() {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 400; f.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.value = 0.05;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.13; lg.gain.value = 180;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(master);
    src.start(); lfo.start();
    wind = g;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, freq, type = "bandpass", q = 1, when = 0, slideTo = null) {
    const t0 = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  const vary = () => 0.94 + Math.random() * 0.12;   // slight random pitch

  const bank = {
    jump: () => { noise(0.08, 0.2, 1800 * vary(), "bandpass", 1.5); tone(330 * vary(), 0.08, "square", 0.05, 0, 520); },
    wallJump: () => { noise(0.1, 0.25, 1400 * vary(), "bandpass", 1.5); tone(300 * vary(), 0.09, "square", 0.05, 0, 560); },
    land: (e) => noise(0.09, 0.12 + e.power * 0.2, 500, "lowpass"),
    dash: (e) => {
      const pitch = e.dy < 0 ? 1.25 : e.dy > 0 ? 0.8 : 1;
      noise(0.22, 0.4, 3000 * pitch, "bandpass", 0.8, 0, 600 * pitch);
      tone(180 * pitch, 0.15, "sawtooth", 0.06, 0, 90 * pitch);
    },
    refill: () => { tone(1320, 0.12, "triangle", 0.18); tone(1760, 0.2, "triangle", 0.15, 0.06); },
    refillBack: () => tone(990, 0.1, "sine", 0.06),
    spring: () => { tone(220, 0.25, "square", 0.08, 0, 880); noise(0.08, 0.15, 1200); },
    crumble: () => noise(0.35, 0.18, 300, "lowpass", 1),
    crumbled: () => noise(0.25, 0.25, 180, "lowpass", 1),
    grab: () => noise(0.05, 0.12, 2500, "highpass"),
    berryTouch: () => { tone(880, 0.1, "triangle", 0.12); tone(1175, 0.14, "triangle", 0.1, 0.07); },
    berry: (e) => {
      // Each berry in a chain chimes a step higher.
      const base = 523 * Math.pow(2, Math.min(e.chain - 1, 6) * 2 / 12);
      [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.18, "triangle", 0.15, i * 0.06));
    },
    death: () => { noise(0.4, 0.4, 900, "bandpass", 0.7, 0, 150); tone(440, 0.35, "square", 0.08, 0, 110); },
    respawn: () => { tone(330, 0.25, "sine", 0.1, 0, 660); },
    room: () => {},
    zipStart: () => { tone(110, 0.12, "square", 0.08); noise(0.5, 0.2, 700, "bandpass", 1, 0.08, 2400); },
    zipStop: () => { noise(0.18, 0.35, 260, "lowpass", 1); tone(90, 0.15, "square", 0.08); },
    berryFly: () => { noise(0.25, 0.12, 2500, "bandpass", 2, 0, 5000); tone(1400, 0.2, "sine", 0.05, 0, 2200); },
    dreamIn: () => { tone(660, 0.3, "sine", 0.1, 0, 990); tone(990, 0.3, "sine", 0.06, 0.05, 1320); },
    dreamOut: () => { tone(1320, 0.18, "triangle", 0.1, 0, 880); noise(0.12, 0.15, 3000, "highpass"); },
    switch: (e) => { tone(e.left ? 700 : 1050, 0.15, "triangle", 0.15); tone(e.left ? 1050 : 1575, 0.2, "triangle", 0.1, 0.06); },
    moveStart: () => { tone(140, 0.2, "square", 0.06, 0, 200); noise(0.3, 0.1, 400, "lowpass"); },
    moveBreak: () => { noise(0.4, 0.35, 300, "lowpass", 1); tone(80, 0.2, "square", 0.08); },
    moveBack: () => tone(660, 0.15, "triangle", 0.08, 0, 990),
    cloudBreak: () => noise(0.2, 0.12, 2400, "bandpass", 2),
    swap: () => { noise(0.12, 0.15, 1600, "bandpass", 2); tone(300, 0.1, "square", 0.05, 0, 600); },
    boostIn: (e) => tone(e.red ? 330 : 440, 0.2, "sine", 0.12, 0, e.red ? 220 : 660),
    redLaunch: () => { noise(0.3, 0.3, 800, "bandpass", 1, 0, 3000); tone(200, 0.2, "sawtooth", 0.06, 0, 400); },
    redEnd: () => noise(0.15, 0.25, 500, "lowpass"),
    freeze: () => { [1568, 1319, 1047, 784].forEach((f, i) => tone(f, 0.6, "sine", 0.08, i * 0.07)); noise(0.8, 0.1, 5000, "highpass"); },
    flyIn: () => { tone(880, 0.3, "triangle", 0.1, 0, 1320); tone(1320, 0.3, "sine", 0.06, 0.08, 1760); },
    flyOut: () => tone(990, 0.2, "sine", 0.06, 0, 660),
    bump: () => { tone(260, 0.18, "square", 0.08, 0, 520); noise(0.1, 0.2, 1200, "bandpass", 1.5); },
    heartbeat: () => { tone(110, 0.25, "sine", 0.25); tone(110, 0.25, "sine", 0.22, 0.28); [523, 659, 784].forEach((f, i) => tone(f, 0.8, "triangle", 0.08, 0.6 + i * 0.12)); },
    voicemail: () => { tone(880, 0.35, "sine", 0.12); },
    cassette: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.07, i * 0.07)),
    heart: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, "triangle", 0.12, i * 0.09)),
    goldenTouch: () => { tone(1175, 0.15, "triangle", 0.12); tone(1568, 0.25, "triangle", 0.1, 0.08); },
    golden: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.4, "triangle", 0.14, i * 0.1)),
    core: (e) => { noise(0.5, 0.3, e.mode === "hot" ? 300 : 3000, "bandpass", 1, 0, e.mode === "hot" ? 120 : 6000); tone(e.mode === "hot" ? 110 : 880, 0.4, "triangle", 0.1); },
    kevin: () => { tone(90, 0.2, "sawtooth", 0.1, 0, 60); noise(0.2, 0.2, 400, "lowpass"); },
    kevinStop: () => { noise(0.3, 0.4, 200, "lowpass", 1); tone(60, 0.25, "square", 0.1); },
    seekerHit: () => { noise(0.15, 0.3, 900, "bandpass", 2); tone(200, 0.12, "square", 0.06, 0, 100); },
    lanternGrab: () => { tone(660, 0.12, "triangle", 0.08); tone(990, 0.2, "sine", 0.05, 0.05); },
    lanternDrop: () => tone(440, 0.12, "sine", 0.05, 0, 330),
    blip: (e) => tone(e.pitch * vary(), 0.045, "square", 0.025),
    chime: () => [392, 330, 262, 196].forEach((f, i) => { tone(f, 1.6, "sine", 0.18, i * 0.5); tone(f * 2, 1.2, "triangle", 0.05, i * 0.5); }),
    gate: () => { noise(0.6, 0.3, 200, "lowpass", 1); [392, 523, 659].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, 0.15 + i * 0.08)); },
    complete: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.45, "triangle", 0.16, i * 0.11)),
  };

  return {
    init,
    play(e) {
      if (!ac || muted || !bank[e.type]) return;
      bank[e.type](e);
    },
    get muted() { return muted; },
    set muted(v) { muted = v; if (master) master.gain.value = muted ? 0 : 0.45; },
  };
})();
