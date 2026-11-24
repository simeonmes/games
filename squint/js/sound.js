"use strict";
// Chiptune blips made in code, so there are no audio files to load.

const Sound = (() => {
  let ac = null, master = null, muted = false;
  try { muted = localStorage.getItem("squint.muted") === "1"; } catch (e) {}

  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.25;
    master.connect(ac.destination);
  }

  function tone(freq, dur, type = "square", gain = 0.5, when = 0, slide = 0) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const seq = (notes, step, type, gain) => notes.forEach((f, i) => f && tone(f, step * 1.4, type, gain, i * step));

  const SOUNDS = {
    join: () => seq([523, 784], 0.07, "square", 0.25),
    leave: () => seq([523, 330], 0.08, "square", 0.25),
    round: () => seq([392, 523, 659, 784], 0.08, "square", 0.3),
    choose: () => seq([659, 880], 0.06, "triangle", 0.4),
    guessed: () => seq([784, 988, 1319], 0.07, "square", 0.3),
    other: () => tone(988, 0.09, "triangle", 0.35),
    close: () => tone(440, 0.12, "triangle", 0.35, 0, 520),
    tick: () => tone(1200, 0.03, "square", 0.15),
    turn: () => seq([659, 523, 392], 0.1, "triangle", 0.4),
    win: () => seq([523, 659, 784, 1047, 0, 784, 1047], 0.1, "square", 0.3),
    like: () => tone(880, 0.08, "sine", 0.4),
    tap: () => tone(660, 0.03, "square", 0.15),
    bad: () => tone(160, 0.18, "sawtooth", 0.25),
  };

  return {
    init,
    play(name) { try { init(); SOUNDS[name] && SOUNDS[name](); } catch (e) {} },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem("squint.muted", muted ? "1" : "0"); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.25;
      return muted;
    },
  };
})();
