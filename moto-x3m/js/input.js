"use strict";
// Input: keyboard, gamepad and on-screen touch buttons, all reduced to the same frame:
// { gas, brake, back, fwd }. Keyboard is the main way to play (Chromebooks included): no
// mouse is needed anywhere, in the menus or in a ride.

const KEYS = {
  gas: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  back: ["ArrowLeft", "KeyA"],
  fwd: ["ArrowRight", "KeyD"],
};

const Input = (() => {
  const down = new Set();
  const BLOCK = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  window.addEventListener("keydown", (e) => {
    if (BLOCK.has(e.code) && Input.captureKeys) e.preventDefault();
    down.add(e.code);
  });
  window.addEventListener("keyup", (e) => down.delete(e.code));
  window.addEventListener("blur", () => down.clear());

  const any = (codes) => codes.some((c) => down.has(c));

  // --- Gamepad: RT or A for gas, LT or B for brake, stick or d-pad to lean.
  function fromPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads || []) {
      if (!p || !p.connected) continue;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const x = p.axes[0] || 0;
      return {
        gas: b(0) || b(7) || b(12),
        brake: b(1) || b(6) || b(13),
        back: b(14) || x < -0.4,
        fwd: b(15) || x > 0.4,
        start: b(9),
      };
    }
    return null;
  }

  // --- Touch: lean back / forward on the left, brake / gas on the right.
  const touch = { enabled: false, held: {}, ids: new Map(), buttons: [] };

  function layout(w, h) {
    const m = Math.min(w, h);
    const r = Math.max(30, Math.min(54, m * 0.1));
    const y = h - r * 1.45;
    touch.buttons = [
      { key: "back", x: r * 1.4, y, r, label: "◀" },
      { key: "fwd", x: r * 3.9, y, r, label: "▶" },
      { key: "brake", x: w - r * 3.9, y, r, label: "▼" },
      { key: "gas", x: w - r * 1.4, y, r: r * 1.12, label: "▲" },
    ];
    touch.pause = { x: w - 34, y: 34, r: 24 };
  }

  function hit(x, y) {
    let best = null, bd = Infinity;
    for (const b of touch.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.6 && d < bd) { best = b; bd = d; }
    }
    return best;
  }

  function attachTouch(el, onPause) {
    const opts = { passive: false };
    const refresh = () => {
      touch.held = {};
      for (const k of touch.ids.values()) if (k) touch.held[k] = true;
    };
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      touch.enabled = true;
      Input.onFirstTouch && Input.onFirstTouch();
      const rect = el.getBoundingClientRect();
      for (const t of e.changedTouches) {
        const x = t.clientX - rect.left, y = t.clientY - rect.top;
        if (touch.pause && Math.hypot(x - touch.pause.x, y - touch.pause.y) < touch.pause.r * 1.6) { onPause && onPause(); continue; }
        const b = hit(x, y);
        touch.ids.set(t.identifier, b ? b.key : null);
      }
      refresh();
    }, opts);
    el.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      for (const t of e.changedTouches) {
        if (!touch.ids.has(t.identifier)) continue;
        const b = hit(t.clientX - rect.left, t.clientY - rect.top);
        touch.ids.set(t.identifier, b ? b.key : null); // slide a thumb between buttons
      }
      refresh();
    }, opts);
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) touch.ids.delete(t.identifier);
      refresh();
    };
    el.addEventListener("touchend", end, opts);
    el.addEventListener("touchcancel", end, opts);
  }

  function read() {
    const pad = fromPad();
    const t = touch.held;
    return {
      gas: any(KEYS.gas) || !!t.gas || !!(pad && pad.gas),
      brake: any(KEYS.brake) || !!t.brake || !!(pad && pad.brake),
      back: any(KEYS.back) || !!t.back || !!(pad && pad.back),
      fwd: any(KEYS.fwd) || !!t.fwd || !!(pad && pad.fwd),
    };
  }

  return {
    captureKeys: false,
    touch,
    read,
    pad: fromPad,
    layout,
    attachTouch,
    clear: () => down.clear(),
    onFirstTouch: null,
  };
})();
