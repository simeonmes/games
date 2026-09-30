"use strict";
// The built-in soundtrack: original chiptune songs, composed in code for each chapter.
// Every chapter has its own key, mode, tempo and chords; the melody is generated from a
// fixed seed, so a chapter always plays the same tune. As you climb higher through a
// chapter, more instruments join in. B-sides play a faster remix of their chapter's song.
// It plays whenever no songs of your own are loaded.

const Chip = (() => {
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
  };
  // root: MIDI note of the bass; prog: chord per bar as scale degrees (two 4-bar halves).
  // drums: "none" | "light" | "drive"; lead: "pulse" (25% duty), "square" or "bell".
  const SONGS = {
    c1: { root: 48, scale: "major", bpm: 100, prog: [0, 4, 5, 3, 0, 4, 3, 4], drums: "light", lead: "pulse" },
    c2: { root: 50, scale: "dorian", bpm: 112, prog: [0, 6, 3, 0, 0, 6, 3, 4], drums: "drive", lead: "pulse" },
    c3: { root: 45, scale: "minor", bpm: 118, prog: [0, 5, 2, 6, 0, 5, 3, 4], drums: "drive", lead: "square" },
    c4: { root: 52, scale: "mixolydian", bpm: 108, prog: [0, 6, 3, 0, 3, 6, 0, 4], drums: "light", lead: "pulse" },
    c5: { root: 47, scale: "harmonic", bpm: 90, prog: [0, 5, 3, 4, 0, 5, 1, 4], drums: "light", lead: "bell" },
    c6: { root: 53, scale: "lydian", bpm: 104, prog: [0, 1, 4, 3, 0, 1, 5, 4], drums: "light", lead: "pulse" },
    c7: { root: 49, scale: "minor", bpm: 76, prog: [0, 5, 6, 4, 0, 5, 3, 4], drums: "none", lead: "bell" },
    c8: { root: 46, scale: "minor", bpm: 124, prog: [0, 6, 5, 6, 0, 6, 5, 4], drums: "drive", lead: "square" },
    c9: { root: 50, scale: "major", bpm: 116, prog: [0, 4, 5, 3, 3, 4, 5, 4], drums: "drive", lead: "pulse" },
    c10: { root: 52, scale: "phrygian", bpm: 138, prog: [0, 1, 0, 6, 0, 1, 5, 6], drums: "drive", lead: "square" },
    c11: { root: 53, scale: "major", bpm: 84, prog: [0, 5, 3, 4, 0, 5, 1, 4], drums: "none", lead: "bell" },
  };
  const LOOKAHEAD = 0.25;

  let ac = null, out = null, noiseBuf = null, pulse = null, timer = null;
  let song = null, key = null, stage = 0, step = 0, nextT = 0, gen = 0;
  let volume = 0.6, muted = false, ducked = false, enabled = true;

  function ensure() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    out = ac.createGain();
    out.gain.value = 0;
    out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // A 25% pulse wave, the classic thin chiptune lead.
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) re[i] = (2 * Math.sin(Math.PI * i * 0.25)) / (Math.PI * i);
    pulse = ac.createPeriodicWave(re, im);
    return true;
  }

  // A small seeded random generator, so each chapter's tune is always the same.
  function rng(seed) {
    let a = 0;
    for (const c of seed) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Build a song: 8 bars of 16 steps. The melody is a 2-bar motif, repeated with a varied
  // answer, and the last bar comes home to the key note.
  function compose(id) {
    const bside = /b$/.test(id);
    const base = SONGS[id.replace(/b$/, "")] || SONGS.c1;
    const R = rng(id + "/veil");
    const sc = SCALES[base.scale];
    const note = (deg) => base.root + sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const rhythms = [
      [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    ];
    const slow = base.bpm < 95;
    const bar = (b, chordDeg, rhythm, from) => {
      const notes = [];
      let deg = from;
      for (let s = 0; s < 16; s++) {
        if (!rhythm[s]) continue;
        if (s % 4 === 0) {
          // On the beat: the nearest chord tone.
          const tones = [chordDeg, chordDeg + 2, chordDeg + 4].flatMap((t) => [t + 7, t + 14]);
          deg = tones.reduce((a, t) => (Math.abs(t - deg) < Math.abs(a - deg) ? t : a), tones[0]);
        } else {
          deg += R() < 0.5 ? 1 : -1;
          if (R() < 0.2) deg += R() < 0.5 ? 2 : -2;
        }
        deg = Math.max(6, Math.min(16, deg));
        let len = 1;
        while (s + len < 16 && !rhythm[s + len]) len++;
        notes.push({ s: b * 16 + s, deg, len: Math.min(len, 6) });
      }
      return { notes, last: deg };
    };
    const rA = rhythms[Math.floor(R() * rhythms.length)], rB = rhythms[Math.floor(R() * rhythms.length)];
    const lead = [];
    let d = 9 + Math.floor(R() * 3);
    const motif = [];
    for (let b = 0; b < 2; b++) { const x = bar(b, base.prog[b], b ? rB : rA, d); motif.push(x.notes); d = x.last; lead.push(...x.notes); }
    for (let b = 2; b < 4; b++) { const x = bar(b, base.prog[b], b % 2 ? rB : rA, d); d = x.last; lead.push(...x.notes); }
    for (let b = 4; b < 6; b++) for (const n of motif[b - 4]) lead.push({ s: n.s + 64, deg: n.deg + (b === 5 ? (R() < 0.5 ? 1 : -1) : 0), len: n.len });
    { const x = bar(6, base.prog[6], rA, d); lead.push(...x.notes); }
    lead.push({ s: 7 * 16, deg: 7, len: 6 }, { s: 7 * 16 + 8, deg: base.prog[7] === 4 ? 8 : 9, len: 6 });
    const bassStyle = Math.floor(R() * 3);
    return {
      id, bpm: base.bpm * (bside ? 1.12 : 1), prog: base.prog, drums: bside && base.drums === "none" ? "light" : base.drums,
      leadWave: base.lead, note, lead, bassStyle, slow, bside,
    };
  }

  function env(g, t, peak, len) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + Math.min(0.1, len * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }

  function voice(freq, t, len, wave, peak) {
    const o = ac.createOscillator(), g = ac.createGain();
    if (wave === "pulse") o.setPeriodicWave(pulse); else o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    env(g, t, peak, len);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + len + 0.05);
  }

  function hit(t, kind) {
    if (kind === "kick") {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      env(g, t, 0.35, 0.14);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      return;
    }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : 1800;
    env(g, t, kind === "hat" ? 0.05 : 0.14, kind === "hat" ? 0.04 : 0.12);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.2);
  }

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function schedule(i, t, sixteenth) {
    const s = i % 128, b = Math.floor(s / 16), q = s % 16, deg = song.prog[b];
    // Bass
    const bassHits = song.bassStyle === 0 ? q % 4 === 0 : song.bassStyle === 1 ? q % 2 === 0 && q !== 6 && q !== 14 : q === 0 || q === 6 || q === 8 || q === 12;
    if (bassHits && !(song.slow && q % 8 !== 0)) {
      const m = song.note(deg) - 12 + (q === 8 && song.bassStyle === 1 ? 7 : 0);
      voice(hz(m), t, sixteenth * (song.slow ? 7 : 1.8), "triangle", 0.22);
    }
    // Arpeggio over the chord
    if (stage >= 0 && (song.slow ? q % 2 === 0 : true)) {
      const k = song.slow ? q / 2 : q;
      const tones = [0, 2, 4, 7];
      const m = song.note(deg + tones[k % 4]) + 12;
      voice(hz(m), t, sixteenth * 0.9, song.leadWave === "bell" ? "sine" : "square", song.leadWave === "bell" ? 0.05 : 0.025);
    }
    // Drums
    if (stage >= 1 && song.drums !== "none") {
      if (q % 2 === 0) hit(t, "hat");
      if (q === 0 || (song.drums === "drive" && (q === 8 || q === 10))) hit(t, "kick");
      if (q === 4 || q === 12) hit(t, song.drums === "drive" ? "snare" : "hat");
    } else if (stage >= 2 && q % 4 === 2) hit(t, "hat");
    // Lead melody
    if (stage >= 2 || (song.bside && stage >= 1)) {
      for (const n of song.lead) if (n.s === s) {
        const w = song.leadWave === "bell" ? "triangle" : song.leadWave;
        voice(hz(song.note(n.deg)), t, sixteenth * n.len * 0.95, w, w === "triangle" ? 0.14 : 0.06);
        if (song.leadWave === "bell") voice(hz(song.note(n.deg) + 12), t, sixteenth * n.len * 0.5, "sine", 0.03);
      }
    }
  }

  function tick() {
    if (!song || !ac) return;
    const sixteenth = 60 / song.bpm / 4;
    // After the tab was in the background, pick up from now instead of catching up.
    if (nextT < ac.currentTime - 0.1) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + LOOKAHEAD) {
      schedule(step, nextT, sixteenth);
      nextT += sixteenth;
      step++;
    }
  }

  const target = () => (muted || !enabled ? 0 : volume * 0.55 * (ducked ? 0.35 : 1));
  function fade(v, time = 0.6) {
    if (!out) return;
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setValueAtTime(out.gain.value, ac.currentTime);
    out.gain.linearRampToValueAtTime(v, ac.currentTime + time);
  }

  return {
    SONGS,
    // Play the chapter's song; progress (0..1) through the chapter sets how full it sounds.
    play(id, progress) {
      if (!enabled) { this.stop(); return; }
      if (!ensure()) return;
      stage = progress < 0.3 ? 0 : progress < 0.6 ? 1 : 2;
      if (key === id && song) { fade(target()); return; }
      const my = ++gen;
      const start = () => {
        if (my !== gen) return;
        key = id; song = compose(id); step = 0; nextT = ac.currentTime + 0.1;
        clearInterval(timer); timer = setInterval(tick, 50);
        fade(target(), 1.2);
      };
      if (song) { fade(0, 0.5); song = null; setTimeout(start, 550); } else start();
    },
    stop() {
      gen++;
      if (!ac || !song) return;
      fade(0, 0.8);
      song = null; key = null;
      setTimeout(() => { if (!song) clearInterval(timer); }, 900);
    },
    duck(on) { ducked = on; if (song) fade(target(), 0.2); },
    setVolume(v) { volume = v; if (song) fade(target(), 0.1); },
    setMuted(m) { muted = m; if (song) fade(target(), 0.1); },
    setEnabled(on) { enabled = on; if (!on) this.stop(); },
    get playing() { return key; },
  };
})();
