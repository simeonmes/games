"use strict";
// Keyboard (rebindable), gamepad and on-screen touch buttons, turned into one input per
// simulation frame: { mx, my, jump, jumpPressed, dashPressed, grab }.
// Presses are remembered until the next simulation frame reads them, so a quick tap between
// two frames still counts.

const DEFAULT_BINDS = {
  jump: ["KeyC", "Space", "KeyJ"],
  dash: ["KeyX", "KeyK"],
  grab: ["KeyZ", "KeyL", "ShiftLeft", "ShiftRight"],
};
const MOVE_KEYS = {
  left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"],
};

const Input = {
  binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)),
  grabMode: "hold",          // "hold" or "toggle"
  keys: new Set(),
  edge: { jump: false, dash: false, grab: false },
  grabToggled: false,
  padPrev: {},
  touch: { mx: 0, my: 0, jump: false, dash: false, grab: false, active: false },
  onPause: null,
  capture: null,             // rebinding: function(code) called with the next key

  init() {
    addEventListener("keydown", (e) => {
      if (this.capture) { e.preventDefault(); const f = this.capture; this.capture = null; f(e.code); return; }
      if (e.code === "Escape" || e.code === "Enter" || e.code === "KeyP") { if (!e.repeat && this.onPause) this.onPause(e.code); }
      const action = this.actionFor(e.code);
      const isMove = Object.values(MOVE_KEYS).some((l) => l.includes(e.code));
      if ((action || isMove) && document.activeElement === document.body) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (action) this.press(action);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => { this.keys.clear(); });
  },

  actionFor(code) {
    for (const [a, list] of Object.entries(this.binds)) if (list.includes(code)) return a;
    return null;
  },

  press(action) {
    this.edge[action] = true;
    if (action === "grab" && this.grabMode === "toggle") this.grabToggled = !this.grabToggled;
  },

  held(action) {
    return this.binds[action].some((k) => this.keys.has(k));
  },

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      return {
        x: p.axes[0] || 0, y: p.axes[1] || 0,
        left: b(14), right: b(15), up: b(12), down: b(13),
        jump: b(0) || b(3), dash: b(2) || b(1), grab: b(4) || b(5) || b(6) || b(7), start: b(9),
        raw: p,
      };
    }
    return null;
  },

  // One simulation frame's worth of input.
  frame() {
    const k = (list) => list.some((c) => this.keys.has(c));
    let mx = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0);
    let my = (k(MOVE_KEYS.down) ? 1 : 0) - (k(MOVE_KEYS.up) ? 1 : 0);
    let jump = this.held("jump"), grab = this.held("grab");

    const pad = this.pad();
    if (pad) {
      // Snap the stick to 8 directions, like Celeste's aim.
      const m = Math.hypot(pad.x, pad.y);
      if (m > 0.4) {
        const a = Math.round(Math.atan2(pad.y, pad.x) / (Math.PI / 4)) * (Math.PI / 4);
        mx = mx || Math.round(Math.cos(a));
        my = my || Math.round(Math.sin(a));
      }
      if (pad.left) mx = -1; if (pad.right) mx = 1; if (pad.up) my = -1; if (pad.down) my = 1;
      jump = jump || pad.jump;
      grab = grab || pad.grab;
      for (const a of ["jump", "dash", "grab"]) {
        if (pad[a] && !this.padPrev[a]) this.press(a);
        this.padPrev[a] = pad[a];
      }
      if (pad.start && !this.padPrev.start && this.onPause) this.onPause("pad");
      this.padPrev.start = pad.start;
    }

    const t = this.touch;
    if (t.active) {
      mx = mx || t.mx; my = my || t.my;
      jump = jump || t.jump; grab = grab || t.grab;
    }

    if (this.grabMode === "toggle") grab = this.grabToggled;
    const out = { mx, my, jump, jumpPressed: this.edge.jump, dashPressed: this.edge.dash, grab };
    this.edge.jump = this.edge.dash = this.edge.grab = false;
    return out;
  },

  clearEdges() { this.edge.jump = this.edge.dash = this.edge.grab = false; },

  rumble(strength, ms) {
    const pad = this.pad();
    const act = pad && pad.raw.vibrationActuator;
    if (act && act.playEffect) act.playEffect("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
  },

  keyName(code) {
    return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Arrow", "").replace("Left", " L").replace("Right", " R").replace("Space", "Space");
  },

  // On-screen buttons for touchscreens: a stick on the left, Jump / Dash / Grab on the right.
  initTouch(root) {
    const stick = root.querySelector(".stick"), knob = root.querySelector(".knob");
    let stickId = null, cx = 0, cy = 0;
    const setStick = (x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), r = stick.offsetWidth * 0.5;
      const k = Math.min(1, r / (d || 1));
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      if (d < r * 0.3) { this.touch.mx = 0; this.touch.my = 0; return; }
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      this.touch.mx = Math.round(Math.cos(a));
      this.touch.my = Math.round(Math.sin(a));
    };
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.touch.active = true;
      stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      setStick(e.clientX, e.clientY);
    });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) setStick(e.clientX, e.clientY); });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; this.touch.mx = 0; this.touch.my = 0; knob.style.transform = "";
    };
    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);

    for (const btn of root.querySelectorAll("[data-act]")) {
      const act = btn.dataset.act;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.touch.active = true;
        btn.setPointerCapture(e.pointerId);
        btn.classList.add("down");
        this.touch[act] = true;
        this.press(act);
      });
      const up = () => { btn.classList.remove("down"); this.touch[act] = false; };
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
    }
  },
};
