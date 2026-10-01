// Sounds and music, all made in code with the Web Audio API.
// Music is a slow, generated ambient piece: soft chords and a few bell notes, in a different
// key and mood for each zone, drifting into the next as you climb.

const Z_MUSIC = {
  slums: { root: 50, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], tempo: 0.9, wave: "triangle" },
  build: { root: 52, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], tempo: 1.0, wave: "triangle" },
  isles: { root: 53, scale: [0, 2, 4, 7, 9, 11], chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], tempo: 1.1, wave: "sine" },
  junk: { root: 55, scale: [0, 2, 4, 5, 7, 9], chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], tempo: 1.15, wave: "triangle" },
  ice: { root: 49, scale: [0, 2, 3, 7, 8], chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 3], [-5, -2, 2, 5]], tempo: 0.75, wave: "sine" },
  space: { root: 48, scale: [0, 2, 6, 7, 11], chords: [[0, 7, 11, 14], [2, 6, 9, 14], [-1, 4, 7, 11], [-3, 4, 7, 12]], tempo: 0.6, wave: "sine" },
  top: { root: 50, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 14], [5, 9, 12, 16], [7, 11, 14, 19], [0, 7, 12, 16]], tempo: 0.8, wave: "sine" },
};

export const Audio = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, noise = null, wind = null, windF = null, rain = null, zip = null;
  let sfxVol = 0.8, musicVol = 0.5, zone = "slums", nextChord = 0, chordI = 0, nextNote = 0;

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicVol * 0.5; musicBus.connect(master);
    // A long echo for the music.
    const delay = ac.createDelay(1); delay.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.35;
    const wet = ac.createGain(); wet.gain.value = 0.3;
    musicBus.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind = loop(400, "bandpass", 0.6); windF = wind.f;
    rain = loop(3000, "highpass", 0.4);
    zip = loop(1800, "bandpass", 6);
  }

  function loop(freq, type, q) {
    const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(sfxBus); src.start();
    return { g, f };
  }

  function tone(freq, dur, type, vol, when = 0, slide = null, bus = sfxBus, attack = 0.005) {
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  function hiss(dur, vol, freq, type = "bandpass", q = 1, slide = null) {
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const bank = {
    step: (e) => hiss(0.06, 0.12, e.soft ? 600 : 1400, "bandpass", 1.2),
    jump: () => { hiss(0.12, 0.12, 1200, "bandpass", 1, 2600); tone(220, 0.1, "sine", 0.06, 0, 330); },
    land: (e) => { const k = Math.min(1, e.v / 25); hiss(0.12 + k * 0.2, 0.2 + k * 0.5, 300 + k * 200, "lowpass", 1); },
    bounce: () => { tone(160, 0.35, "sine", 0.35, 0, 640); hiss(0.1, 0.15, 900); },
    mantle: () => hiss(0.25, 0.14, 900, "bandpass", 0.8, 500),
    zipOn: () => { tone(1200, 0.2, "triangle", 0.08); tone(1800, 0.3, "sine", 0.05, 0.05); },
    zipOff: () => tone(900, 0.15, "triangle", 0.06, 0, 600),
    crumble: () => { for (let i = 0; i < 4; i++) setTimeout(() => ac && hiss(0.08, 0.2, 700 + Math.random() * 900, "bandpass", 3), i * 120); },
    duck: () => { tone(900, 0.12, "square", 0.08, 0, 1300); tone(1100, 0.14, "square", 0.07, 0.13, 1500); [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.4, "triangle", 0.1, 0.3 + i * 0.08)); },
    checkpoint: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.5, "triangle", 0.1, i * 0.1)),
    zone: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 2.2, "sine", 0.09, i * 0.18, null, sfxBus, 0.05)),
    finish: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 2.5, "triangle", 0.12, i * 0.15, null, sfxBus, 0.02)),
    fall: () => tone(300, 0.6, "sine", 0.06, 0, 120),
  };

  // Called every frame: wind, rain and zip-line loops, and the next music notes.
  function update(st) {
    if (!ac) return;
    const t = ac.currentTime;
    const fallK = Math.min(1, Math.max(0, -st.vy - 8) / 30);
    const windVol = 0.03 + Math.min(0.08, st.y / 6000) + fallK * 0.35;
    wind.g.gain.setTargetAtTime(windVol, t, 0.2);
    windF.frequency.setTargetAtTime(350 + fallK * 900 + Math.sin(t * 0.3) * 120, t, 0.2);
    rain.g.gain.setTargetAtTime(st.rain * 0.06, t, 0.5);
    zip.g.gain.setTargetAtTime(st.zip ? 0.08 : 0, t, 0.05);
    const z = Z_MUSIC[st.zone] || Z_MUSIC.slums;
    if (st.zone !== zone) { zone = st.zone; nextChord = Math.min(nextChord, t + 1.5); }
    if (musicVol <= 0) return;
    const bar = 6 / z.tempo;
    if (t >= nextChord) {
      const ch = z.chords[chordI++ % z.chords.length];
      for (const n of ch) pad(mtof(z.root + n), bar * 1.15, z.wave, t);
      pad(mtof(z.root + ch[0] - 12), bar * 1.15, "sine", t, 0.05);
      nextChord = t + bar;
      nextNote = t + 0.5;
    }
    if (t >= nextNote) {
      if (Math.random() < 0.7) {
        const deg = z.scale[Math.floor(Math.random() * z.scale.length)];
        const f = mtof(z.root + 24 + deg + (Math.random() < 0.3 ? 12 : 0));
        tone(f, 2.4, "sine", 0.04, 0, null, musicBus, 0.01);
        tone(f * 2, 1.2, "sine", 0.012, 0, null, musicBus, 0.01);
      }
      nextNote = t + (0.6 + Math.random() * 1.4) / z.tempo;
    }
  }

  function pad(freq, dur, wave, t, vol = 0.035) {
    for (const det of [-4, 4]) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = wave; o.frequency.value = freq; o.detune.value = det;
      f.type = "lowpass"; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  return {
    init, update,
    play(e) { if (ac && bank[e.type]) bank[e.type](e); },
    setVolumes(s, m) {
      sfxVol = s; musicVol = m;
      if (sfxBus) { sfxBus.gain.value = s; musicBus.gain.value = m * 0.5; }
    },
    suspend(on) { if (ac) on ? ac.suspend() : ac.resume(); },
  };
})();
