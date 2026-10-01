// Keyboard + mouse (pointer lock), gamepad, and touch controls (a joystick on the left,
// drag anywhere else to look, and Jump / Sprint buttons).

export const Input = {
  keys: new Set(),
  jumpEdge: false,
  look: { x: 0, y: 0 },        // camera turn this frame (radians-ish)
  zoom: 0,
  touch: { mx: 0, my: 0, jump: false, sprint: false, active: false },
  padPrev: {},
  sens: 1, invertY: false,
  onPause: null,
  onRespawn: null,
  enabled: false,

  init(canvas, ui) {
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" || e.code === "KeyP") { if (!e.repeat && this.onPause) this.onPause(); return; }
      if (!this.enabled) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") this.jumpEdge = true;
      if (e.code === "KeyR" && this.onRespawn) this.onRespawn();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.look.x += e.movementX * 0.0024 * this.sens;
      this.look.y += e.movementY * 0.0024 * this.sens * (this.invertY ? -1 : 1);
    });
    canvas.addEventListener("click", () => { if (this.enabled && !this.touch.active && canvas.requestPointerLock) canvas.requestPointerLock(); });
    canvas.addEventListener("wheel", (e) => { this.zoom += Math.sign(e.deltaY) * 0.6; e.preventDefault(); }, { passive: false });
    this.initTouch(canvas, ui);
  },

  initTouch(canvas, ui) {
    const stick = ui.stick, knob = ui.knob;
    let stickId = null, lookId = null, cx = 0, cy = 0, lx = 0, ly = 0;
    const R = 55;
    const start = (e) => {
      if (!this.enabled) return;
      this.touch.active = true;
      document.body.classList.add("touching");
      if (e.clientX < innerWidth * 0.45 && stickId === null) {
        stickId = e.pointerId; cx = e.clientX; cy = e.clientY;
        stick.style.left = cx - R + "px"; stick.style.top = cy - R + "px"; stick.classList.add("on");
      } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    };
    const move = (e) => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.touch.mx = dx / R; this.touch.my = dy / R;
        this.touch.sprint = d > R * 0.92 || this.touch.sprintBtn;
      } else if (e.pointerId === lookId) {
        this.look.x += (e.clientX - lx) * 0.006 * this.sens;
        this.look.y += (e.clientY - ly) * 0.006 * this.sens * (this.invertY ? -1 : 1);
        lx = e.clientX; ly = e.clientY;
      }
    };
    const end = (e) => {
      if (e.pointerId === stickId) { stickId = null; this.touch.mx = this.touch.my = 0; knob.style.transform = ""; stick.classList.remove("on"); }
      if (e.pointerId === lookId) lookId = null;
    };
    ui.pad.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; e.preventDefault(); ui.pad.setPointerCapture(e.pointerId); start(e); });
    ui.pad.addEventListener("pointermove", move);
    ui.pad.addEventListener("pointerup", end);
    ui.pad.addEventListener("pointercancel", end);
    ui.jump.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); this.jumpEdge = true; this.touch.jump = true; ui.jump.classList.add("down"); });
    const up = () => { this.touch.jump = false; ui.jump.classList.remove("down"); };
    ui.jump.addEventListener("pointerup", up); ui.jump.addEventListener("pointercancel", up);
    ui.sprint.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); this.touch.sprintBtn = !this.touch.sprintBtn; ui.sprint.classList.toggle("down", this.touch.sprintBtn); });
  },

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  },

  // One frame of input: move (camera-relative), jump, sprint, and camera turn.
  frame(dt) {
    const k = (...c) => c.some((x) => this.keys.has(x));
    let fx = (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0);
    let fy = (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0);
    let jump = k("Space"), sprint = k("ShiftLeft", "ShiftRight");
    const p = this.pad();
    if (p) {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = (i) => (Math.abs(p.axes[i] || 0) > 0.18 ? p.axes[i] : 0);
      if (ax(0) || ax(1)) { fx = ax(0); fy = -ax(1); }
      this.look.x += ax(2) * dt * 3.2 * this.sens;
      this.look.y += ax(3) * dt * 2.4 * this.sens * (this.invertY ? -1 : 1);
      jump = jump || b(0);
      sprint = sprint || b(4) || b(5) || b(6) || b(7) || b(10);
      if (b(0) && !this.padPrev.a) this.jumpEdge = true;
      if (b(9) && !this.padPrev.start && this.onPause) this.onPause();
      if (b(3) && !this.padPrev.y && this.onRespawn) this.onRespawn();
      this.padPrev.a = b(0); this.padPrev.start = b(9); this.padPrev.y = b(3);
    }
    if (this.touch.active && (this.touch.mx || this.touch.my)) { fx = this.touch.mx; fy = -this.touch.my; sprint = sprint || this.touch.sprint; }
    if (this.touch.sprintBtn) sprint = true;
    jump = jump || this.touch.jump;
    const len = Math.hypot(fx, fy);
    if (len > 1) { fx /= len; fy /= len; }
    const out = { fx, fy, jump, jumpPressed: this.jumpEdge, sprint, lookX: this.look.x, lookY: this.look.y, zoom: this.zoom };
    this.jumpEdge = false;
    this.look.x = this.look.y = 0; this.zoom = 0;
    return out;
  },
};
