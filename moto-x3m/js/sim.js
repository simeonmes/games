"use strict";
// Moto X3M fan game simulation: the bike's physics, the level's moving parts and hazards,
// checkpoints, flips and the clock. There is no DOM code here, so the same file runs in the
// browser and in the level checker (tools/verify.js), which rides every level with an
// autopilot to prove it can be finished.
//
// Units are pixels and seconds; y points down, so a positive angle or angular velocity turns
// clockwise on screen (nose down when riding right). The bike is one rigid body with two wheel
// colliders that spin on their own axles: the engine spins the back wheel and the tyres' grip
// against the ground is what pushes the bike along, so wheelies, stalls on steep ramps and
// loops all come out of the same contact solver.

const DT = 1 / 120;
const G = 1150;              // gravity
const WHEEL_R = 16;
const MAX_V = 1900;          // hard cap on the bike's speed, keeps the solver out of trouble
const FLIP_BONUS = 0.5;      // seconds taken off the clock for each full flip landed
const RESPAWN_DELAY = 1.25;  // seconds between a crash and reappearing at the checkpoint
const BRAKE = 130;           // how fast the brake stops a spinning wheel (rad/s²)

// Bike layout in its own frame (x forward, y down, origin at the centre of mass).
const GEO = {
  wheels: [[-36, 6], [38, 6]],          // back, front
  hull: [[2, -6, 12], [-18, -10, 9]],      // engine and seat: solid, but not wheels
  rider: [[-8, -30, 10], [1, -49, 9]],    // torso and head: touching anything is a crash
  m: 1, I: 700, Iw: 38,
};

// Stars unlock the other bikes. Stats: top speed (px/s), engine torque, lean (rad/s²),
// tyre grip, and how fast you can spin in the air (rad/s).
const BIKES = [
  { id: "dirt", name: "Dirt Kid", unlock: 0, speed: 1000, torque: 21000, lean: 17, grip: 1.5, spin: 8.5, body: "#e8412c", trim: "#ffd23f", helmet: "#f4f4f4", visor: "#1b2a4a" },
  { id: "fox", name: "Desert Fox", unlock: 8, speed: 1035, torque: 22000, lean: 18, grip: 1.53, spin: 8.8, body: "#f28c1b", trim: "#2b2b2b", helmet: "#ffcf3f", visor: "#2b1a0a" },
  { id: "lime", name: "Lime Rocket", unlock: 18, speed: 1070, torque: 23000, lean: 19, grip: 1.56, spin: 9.2, body: "#6fd12b", trim: "#1f3d0c", helmet: "#1f3d0c", visor: "#b6ff6a" },
  { id: "ghost", name: "Ghost", unlock: 28, speed: 1105, torque: 24000, lean: 20.5, grip: 1.6, spin: 9.8, body: "#dfe7f5", trim: "#6b7ea8", helmet: "#252c3d", visor: "#8fe3ff" },
  { id: "blaze", name: "Blaze", unlock: 38, speed: 1150, torque: 25500, lean: 22, grip: 1.65, spin: 10.5, body: "#b01ee0", trim: "#ff4fd8", helmet: "#12081c", visor: "#ff4fd8" },
];

const CELL = 160;
let STAMP = 0; // shared by every world (and the autopilot's look-ahead copies), which share segments
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeSeg(ax, ay, bx, by, nx, ny, obj) {
  const dx = bx - ax, dy = by - ay;
  return { ax, ay, bx, by, dx, dy, len2: dx * dx + dy * dy || 1e-9, nx, ny, obj: obj || null };
}

// Edges of a closed polygon with outward normals, whichever way round it was listed.
function polySegs(pts, obj) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) continue;
    out.push(makeSeg(x1, y1, x2, y2, (sgn * (y2 - y1)) / len, (-sgn * (x2 - x1)) / len, obj));
  }
  return out;
}

class Bike {
  constructor(stats) {
    this.stats = stats;
    this.wheels = GEO.wheels.map(([lx, ly]) => ({ lx, ly, spin: 0, rot: 0, contact: false, x: 0, y: 0 }));
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x; this.y = y; this.a = 0;
    this.vx = 0; this.vy = 0; this.w = 0;
    for (const wh of this.wheels) { wh.spin = 0; wh.contact = false; }
    this.crashed = false;
    this.grounded = true;
    this.air = 0; this.airRot = 0;
    this.lean = 0;       // -1 leaning back … 1 leaning forward, smoothed (for the rider's pose)
    this.gas = 0;
  }

  toWorld(lx, ly) {
    const c = Math.cos(this.a), s = Math.sin(this.a);
    return [this.x + c * lx - s * ly, this.y + s * lx + c * ly];
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get forwardSpeed() { return this.vx * Math.cos(this.a) + this.vy * Math.sin(this.a); }
}

// ------------------------------------------------------------------ level objects

function makeObject(o) {
  const obj = Object.assign({}, o);
  obj.bx = o.x; obj.by = o.y;
  switch (o.type) {
    case "mover": case "crumble": {
      // A solid plank that moves, hanging from its top-left corner.
      const w = o.w, hh = o.h || 18;
      obj.local = [[0, 0], [w, 0], [w, hh], [0, hh]];
      obj.solid = true;
      break;
    }
    case "saw": obj.rot = 0; break;
    case "tnt": obj.w = o.w || 34; obj.h = o.h || 34; break;
    case "spikes": obj.h = o.h || 16; break;
  }
  resetObject(obj);
  return obj;
}

function resetObject(obj) {
  obj.alive = true;
  obj.touched = false;
  obj.state = "idle";
  obj.timer = 0;
  obj.fall = 0; obj.fallV = 0;
  obj.x = obj.bx; obj.y = obj.by; obj.a = obj.a0 || 0;
  obj.px = obj.x; obj.py = obj.y; obj.pa = obj.a;
  obj.vx = 0; obj.vy = 0; obj.av = 0;
  obj.segs = null;
}

// Where a moving thing is at time t (movers and saws ease back and forth; saws can orbit).
function pathPos(o, t) {
  if (o.orbit) {
    const ang = (o.phase || 0) + (t * 2 * Math.PI) / o.period;
    return [o.bx + Math.cos(ang) * o.orbit, o.by + Math.sin(ang) * o.orbit];
  }
  if (!o.period || (!o.ex && !o.ey)) return [o.bx, o.by];
  const f = 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / o.period + (o.phase || 0));
  return [o.bx + (o.ex || 0) * f, o.by + (o.ey || 0) * f];
}

function updateObject(o, t, h, killY) {
  o.px = o.x; o.py = o.y; o.pa = o.a;
  switch (o.type) {
    case "mover": [o.x, o.y] = pathPos(o, t); break;
    case "saw": [o.x, o.y] = pathPos(o, t); o.rot += 14 * h; break;
    case "crumble":
      if (o.state === "idle" && o.touched) { o.state = "shake"; o.timer = 0; }
      if (o.state === "shake") { o.timer += h; if (o.timer > (o.delay || 0.45)) o.state = "fall"; }
      if (o.state === "fall") {
        o.fallV += G * h;
        o.fall += o.fallV * h;
        if (o.by + o.fall > killY + 400) { o.state = "gone"; o.alive = false; }
      }
      o.y = o.by + o.fall;
      break;
  }
  o.vx = (o.x - o.px) / h; o.vy = (o.y - o.py) / h; o.av = (o.a - o.pa) / h;
  if (o.solid) {
    if (!o.alive) { o.segs = null; return; }
    const c = Math.cos(o.a), s = Math.sin(o.a);
    o.world = o.local.map(([lx, ly]) => [o.x + c * lx - s * ly, o.y + s * lx + c * ly]);
    o.segs = polySegs(o.world, o);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of o.world) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    o.box = [x0, y0, x1, y1];
  }
}

// ------------------------------------------------------------------ world

class World {
  constructor(level, stats) {
    this.L = level;
    this.stats = stats;
    this.grid = new Map();
    this.segs = [];
    for (const p of level.polys) for (const s of polySegs(p.pts)) this.addStatic(s);
    for (const s of this.segs) s.mark = 0;

    // Loops are rings of inward-facing track. Half of the ring is switched off at a time, so the
    // bike can ride in at the bottom, go all the way round and ride out without being caught
    // by the part it came in on.
    this.loops = (level.loops || []).map((lp) => {
      const n = Math.max(32, Math.round(lp.r / 5));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const th = Math.PI / 2 - (i / n) * Math.PI * 2; // bottom, right, top, left, bottom
        pts.push([lp.cx + Math.cos(th) * lp.r, lp.cy + Math.sin(th) * lp.r, th]);
      }
      const inSegs = [], outSegs = [];
      for (let i = 0; i < n; i++) {
        const [x1, y1, th1] = pts[i], [x2, y2] = pts[i + 1];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, d = Math.hypot(lp.cx - mx, lp.cy - my);
        const s = makeSeg(x1, y1, x2, y2, (lp.cx - mx) / d, (lp.cy - my) / d, null);
        const quarter = Math.floor(((Math.PI / 2 - th1) / (Math.PI / 2)) + 1e-6); // 0 lower-right … 3 lower-left
        if (quarter !== 3) inSegs.push(s);   // riding in: everything but the lower-left quarter
        if (quarter !== 0) outSegs.push(s);  // riding out: everything but the lower-right quarter
      }
      return { cx: lp.cx, cy: lp.cy, r: lp.r, inSegs, outSegs, phase: 0 };
    });

    this.objs = (level.objects || []).map(makeObject);
    this.bike = new Bike(stats);
    this.events = [];
    this.time = 0;      // runs the moving parts
    this.clock = 0;     // the player's time (before flip bonuses)
    this.started = false;
    this.finished = false;
    this.flips = 0;
    this.bonus = 0;
    this.deaths = 0;
    this.cp = -1;
    this.crashT = 0;
    this.ragdoll = null;
    this.contacts = [];
    this.respawn(true);
  }

  // A copy to try things out on (the autopilot's look-ahead). The level geometry is shared.
  clone() {
    const w = Object.create(World.prototype);
    Object.assign(w, this);
    w.bike = Object.assign(Object.create(Bike.prototype), this.bike);
    w.bike.wheels = this.bike.wheels.map((q) => Object.assign({}, q));
    w.objs = this.objs.map((o) => Object.assign({}, o));
    w.loops = this.loops.map((l) => Object.assign({}, l));
    w.events = [];
    w.contacts = [];
    w.ragdoll = null;
    return w;
  }

  addStatic(s) {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const y0 = Math.floor(Math.min(s.ay, s.by) / CELL), y1 = Math.floor(Math.max(s.ay, s.by) / CELL);
    this.segs.push(s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = cx * 100003 + cy;
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, (cell = []));
        cell.push(s);
      }
    }
  }

  get score() { return Math.max(0, this.clock - this.bonus); }

  // Every surface a circle overlaps (or nearly touches, within `margin`), as contact records.
  collide(cx, cy, r, margin, out, fromBike) {
    const R = r + margin;
    const stamp = ++STAMP;
    const x0 = Math.floor((cx - R) / CELL), x1 = Math.floor((cx + R) / CELL);
    const y0 = Math.floor((cy - R) / CELL), y1 = Math.floor((cy + R) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const cell = this.grid.get(gx * 100003 + gy);
        if (!cell) continue;
        for (const s of cell) {
          if (s.mark === stamp) continue;
          s.mark = stamp;
          this.circleSeg(cx, cy, r, R, s, out, null);
        }
      }
    }
    for (const lp of this.loops) {
      const d = Math.hypot(cx - lp.cx, cy - lp.cy);
      if (d < lp.r - R - 2 || d > lp.r + R + 2) continue;
      for (const s of lp.phase === 1 ? lp.outSegs : lp.inSegs) this.circleSeg(cx, cy, r, R, s, out, null);
    }
    for (const o of this.objs) {
      if (!o.segs) continue;
      const b = o.box;
      if (cx + R < b[0] || cx - R > b[2] || cy + R < b[1] || cy - R > b[3]) continue;
      const before = out.length;
      for (const s of o.segs) this.circleSeg(cx, cy, r, R, s, out, o);
      if (fromBike && out.length > before) o.touched = true;
    }
  }

  circleSeg(cx, cy, r, R, s, out, obj) {
    const ex = cx - s.ax, ey = cy - s.ay;
    if (ex * s.nx + ey * s.ny <= 0) return; // one-sided: only from the outside
    const t = clamp((ex * s.dx + ey * s.dy) / s.len2, 0, 1);
    const qx = s.ax + s.dx * t, qy = s.ay + s.dy * t;
    const ddx = cx - qx, ddy = cy - qy;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2);
    const nx = d > 1e-6 ? ddx / d : s.nx, ny = d > 1e-6 ? ddy / d : s.ny;
    let svx = 0, svy = 0;
    if (obj) {
      svx = obj.vx - obj.av * (qy - obj.y);
      svy = obj.vy + obj.av * (qx - obj.x);
    }
    out.push({ nx, ny, pen: r - d, qx, qy, svx, svy, obj });
  }

  spawnPoint() {
    const p = this.cp >= 0 ? this.L.checkpoints[this.cp] : this.L.start;
    return [p.x, p.y - WHEEL_R - GEO.wheels[0][1] - 1];
  }

  respawn(first) {
    const [x, y] = this.spawnPoint();
    this.bike.reset(x, y);
    this.ragdoll = null;
    this.crashT = 0;
    for (const o of this.objs) resetObject(o);
    for (const lp of this.loops) lp.phase = 0;
    if (!first) this.events.push({ type: "respawn" });
  }

  crash(kind, ix = 0, iy = 0) {
    const b = this.bike;
    if (b.crashed || this.finished) return;
    b.crashed = true;
    this.crashT = 0;
    this.deaths++;
    b.vx += ix; b.vy += iy;
    this.ragdoll = new Ragdoll(b, ix, iy);
    this.events.push({ type: "crash", kind, x: b.x, y: b.y });
  }

  explode(o) {
    o.alive = false;
    const b = this.bike;
    const cx = o.x, cy = o.y - o.h / 2;
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1;
    this.events.push({ type: "boom", x: cx, y: cy });
    this.crash("boom", (dx / d) * 700, (dy / d) * 700 - 500);
  }

  step(inp) {
    const h = DT, b = this.bike, S = this.stats, L = this.L;
    this.time += h;
    if (!this.started && (inp.gas || inp.brake || inp.back || inp.fwd)) this.started = true;
    if (this.started && !this.finished) this.clock += h;

    for (const o of this.objs) updateObject(o, this.time, h, L.killY);

    // Loops switch halves once the bike has gone over the top, and back once it has left.
    for (const lp of this.loops) {
      const dx = b.x - lp.cx, dy = b.y - lp.cy;
      if (lp.phase === 0 && dx < -lp.r * 0.25 && dy < 0) lp.phase = 1;
      else if (lp.phase === 1 && (Math.abs(dx) > lp.r + 160 || dy > lp.r + 200)) lp.phase = 0;
    }

    // ---- controls
    const control = !b.crashed && !this.finished;
    const gas = control && inp.gas, brake = (control && inp.brake) || this.finished;
    const lean = control ? (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0) : 0;
    const rear = b.wheels[0], front = b.wheels[1];
    const wmax = S.speed / WHEEL_R;
    b.gas = gas ? 1 : 0;
    if (gas && rear.spin < wmax) {
      const k = 1 - 0.55 * clamp(rear.spin / wmax, 0, 1);
      rear.spin = Math.min(wmax, rear.spin + (S.torque / GEO.Iw) * k * h);
    }
    if (brake) {
      // Mostly the back brake: a hard front brake would throw the rider over the bars.
      for (const wh of b.wheels) {
        const k = wh === front ? 0.5 : 1;
        if (wh.spin > 0) wh.spin = Math.max(0, wh.spin - BRAKE * k * h);
        else if (wh.spin < 0) wh.spin = Math.min(0, wh.spin + BRAKE * k * h);
      }
      // Brake drag at the centre of mass, so hard stops don't pitch the bike over.
      const fs = b.forwardSpeed;
      if (b.grounded && fs > 0) {
        const dv = Math.min(fs, 700 * h);
        b.vx -= Math.cos(b.a) * dv; b.vy -= Math.sin(b.a) * dv;
      }
      // Holding brake when stopped backs up slowly.
      if (!this.finished && b.grounded && b.forwardSpeed < 40) {
        rear.spin = Math.max(-wmax * 0.3, rear.spin - (S.torque / GEO.Iw) * 0.4 * h);
      }
    }
    if (!gas && !brake) for (const wh of b.wheels) wh.spin *= 1 - (b.grounded ? 0.6 : 0.3) * h;
    if (lean) {
      const acc = S.lean * (b.grounded ? 0.85 : 1);
      if (lean * b.w < S.spin) b.w += lean * acc * h;
    } else if (!b.grounded) {
      b.w *= 1 - 1.1 * h;
    }
    b.lean += (lean - b.lean) * Math.min(1, h * 12);

    // ---- forces
    b.vy += G * h;
    b.vx *= 1 - 0.03 * h; b.vy *= 1 - 0.03 * h;

    // ---- contacts
    const contacts = this.contacts;
    contacts.length = 0;
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const addCircle = (lx, ly, r, kind, wheel, mu) => {
      const wx = b.x + c * lx - s * ly, wy = b.y + s * lx + c * ly;
      if (wheel) { wheel.x = wx; wheel.y = wy; }
      const start = contacts.length;
      this.collide(wx, wy, r, 2, contacts, true);
      for (let i = start; i < contacts.length; i++) {
        const k = contacts[i];
        k.kind = kind; k.wheel = wheel; k.mu = mu; k.r = r;
        k.rx = wx - k.nx * r - b.x; k.ry = wy - k.ny * r - b.y;
      }
      return contacts.length - start;
    };
    for (const wh of b.wheels) addCircle(wh.lx, wh.ly, WHEEL_R, "wheel", wh, S.grip);
    for (const [lx, ly, r] of GEO.hull) addCircle(lx, ly, r, "hull", null, 0.4);
    let riderHit = false;
    if (!b.crashed) {
      for (const [lx, ly, r] of GEO.rider) {
        const before = contacts.length;
        addCircle(lx, ly, r, "rider", null, 0.5);
        for (let i = before; i < contacts.length; i++) if (contacts[i].pen > -1) riderHit = true;
      }
    }

    const m = GEO.m, I = GEO.I, Iw = GEO.Iw;
    for (const k of contacts) {
      const cn = k.rx * k.ny - k.ry * k.nx;
      const ct = k.rx * k.nx + k.ry * k.ny; // cross(r, t) with t = (-ny, nx)
      k.kn = 1 / (1 / m + (cn * cn) / I);
      k.kt = 1 / (1 / m + (ct * ct) / I + (k.wheel ? (WHEEL_R * WHEEL_R) / Iw : 0));
      k.jn = 0; k.jt = 0;
      k.bias = k.pen > 0.6 ? Math.min(500, (0.25 * (k.pen - 0.6)) / h) : k.pen < 0 ? k.pen / h : 0;
    }
    for (let it = 0; it < 12; it++) {
      for (const k of contacts) {
        // Velocity of the contact point relative to the surface.
        let vx = b.vx - b.w * k.ry - k.svx, vy = b.vy + b.w * k.rx - k.svy;
        if (k.wheel) { vx += k.wheel.spin * k.ny * WHEEL_R; vy -= k.wheel.spin * k.nx * WHEEL_R; }
        const vn = vx * k.nx + vy * k.ny;
        let dj = (k.bias - vn) * k.kn;
        const jn = Math.max(0, k.jn + dj);
        dj = jn - k.jn; k.jn = jn;
        this.applyImpulse(k, dj * k.nx, dj * k.ny);

        vx = b.vx - b.w * k.ry - k.svx; vy = b.vy + b.w * k.rx - k.svy;
        if (k.wheel) { vx += k.wheel.spin * k.ny * WHEEL_R; vy -= k.wheel.spin * k.nx * WHEEL_R; }
        const tx = -k.ny, ty = k.nx;
        const vt = vx * tx + vy * ty;
        const lim = k.mu * k.jn;
        const jt = clamp(k.jt - vt * k.kt, -lim, lim);
        const dt = jt - k.jt; k.jt = jt;
        this.applyImpulse(k, dt * tx, dt * ty);
      }
    }

    // ---- integrate
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    b.x += b.vx * h; b.y += b.vy * h;
    b.a += b.w * h;
    for (const wh of b.wheels) { wh.rot += wh.spin * h; wh.contact = false; }
    let landing = 0;
    for (const k of contacts) {
      if (k.wheel && k.pen > -1.2) {
        k.wheel.contact = true; k.wheel.nx = k.nx; k.wheel.ny = k.ny;
        landing = Math.max(landing, k.jn);
      }
    }
    const wasAir = b.air;
    b.grounded = b.wheels[0].contact || b.wheels[1].contact;

    if (riderHit) this.crash("head");

    // ---- flips: count full turns made in the air, paid out on a clean landing
    if (b.grounded) {
      if (wasAir > 0.2 && !b.crashed) {
        const turns = Math.floor((Math.abs(b.airRot) + 0.55) / (Math.PI * 2));
        if (turns > 0) {
          this.flips += turns;
          if (!this.finished) this.bonus += turns * FLIP_BONUS;
          this.events.push({ type: "flip", n: turns, dir: b.airRot < 0 ? "back" : "front", x: b.x, y: b.y });
        }
        this.events.push({ type: "land", power: clamp(landing / 400, 0, 1) });
      }
      b.air = 0; b.airRot = 0;
    } else {
      b.air += h;
      b.airRot += b.w * h;
    }

    // ---- hazards
    if (!b.crashed) this.hazards();

    // ---- checkpoints, finish, falling out of the world
    if (!b.crashed && !this.finished) {
      const cps = L.checkpoints;
      for (let i = this.cp + 1; i < cps.length; i++) {
        if (b.x >= cps[i].x) { this.cp = i; this.events.push({ type: "checkpoint", i, x: cps[i].x, y: cps[i].y }); }
      }
      if (b.x >= L.finish.x) {
        this.finished = true;
        this.events.push({ type: "finish", x: L.finish.x, y: L.finish.y });
      }
    }
    if (b.y > L.killY) {
      if (!b.crashed) this.crash("fall");
      b.vx *= 0.9; b.vy = Math.min(b.vy, 600);
    }

    if (this.ragdoll) this.ragdoll.step(this, h);
    if (b.crashed) {
      this.crashT += h;
      if (this.crashT > RESPAWN_DELAY) this.respawn(false);
    }
  }

  // The top of the ground straight below (x, y): its height and slope, or null over a pit.
  groundBelow(x, y, reach = 2000) {
    let best = null;
    const gx = Math.floor(x / CELL);
    for (let gy = Math.floor((y - 40) / CELL); gy <= Math.floor((y + reach) / CELL); gy++) {
      const cell = this.grid.get(gx * 100003 + gy);
      if (!cell) continue;
      for (const s of cell) {
        if (s.ny > -0.15) continue;
        const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
        if (x < x0 || x > x1 || x1 - x0 < 1e-6) continue;
        const sy = s.ay + ((x - s.ax) / s.dx) * s.dy;
        if (sy < y - 40) continue;
        if (!best || sy < best.y) best = { y: sy, angle: Math.atan2(s.dy, s.dx) };
      }
      if (best) break;
    }
    for (const o of this.objs) {
      if (!o.segs) continue;
      for (const s of o.segs) {
        if (s.ny > -0.15) continue;
        const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
        if (x < x0 || x > x1) continue;
        const sy = s.ay + ((x - s.ax) / s.dx) * s.dy;
        if (sy < y - 40) continue;
        if (!best || sy < best.y) best = { y: sy, angle: Math.atan2(s.dy, s.dx) };
      }
    }
    return best;
  }

  applyImpulse(k, px, py) {
    const b = this.bike;
    b.vx += px / GEO.m; b.vy += py / GEO.m;
    b.w += (k.rx * py - k.ry * px) / GEO.I;
    if (k.wheel) {
      // The impulse acts on the rim at -n·R from the axle.
      const qx = -k.nx * WHEEL_R, qy = -k.ny * WHEEL_R;
      k.wheel.spin += (qx * py - qy * px) / GEO.Iw;
    }
  }

  // Colliders of the bike as world circles: wheels, hull and (unless crashed) the rider.
  bikeCircles() {
    const b = this.bike, out = [];
    for (const wh of b.wheels) out.push(b.toWorld(wh.lx, wh.ly).concat(WHEEL_R));
    for (const [lx, ly, r] of GEO.hull) out.push(b.toWorld(lx, ly).concat(r));
    if (!b.crashed) for (const [lx, ly, r] of GEO.rider) out.push(b.toWorld(lx, ly).concat(r));
    return out;
  }

  hazards() {
    const circles = this.bikeCircles();
    for (const o of this.objs) {
      if (!o.alive) continue;
      if (o.type === "saw") {
        for (const [x, y, r] of circles) {
          if (Math.hypot(x - o.x, y - o.y) < o.r + r - 4) return this.crash("saw");
        }
      } else if (o.type === "spikes" || o.type === "tnt") {
        const x0 = o.type === "tnt" ? o.x - o.w / 2 : o.x, x1 = o.type === "tnt" ? o.x + o.w / 2 : o.x + o.w;
        const y0 = o.y - o.h + (o.type === "spikes" ? 4 : 0), y1 = o.y;
        for (const [x, y, r] of circles) {
          const qx = clamp(x, x0, x1), qy = clamp(y, y0, y1);
          if (Math.hypot(x - qx, y - qy) < r) {
            if (o.type === "tnt") return this.explode(o);
            return this.crash("spikes");
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ ragdoll

// Rider points in the bike's frame, shared with the renderer's pose.
const RIDER = {
  head: [1, -49], chest: [-4, -37], hip: [-12, -20], knee: [6, -13], foot: [-2, -1], hand: [20, -31],
};

class Ragdoll {
  constructor(b, ix, iy) {
    const names = ["head", "chest", "hip", "knee", "foot", "hand"];
    this.p = names.map((n) => {
      const [lx, ly] = RIDER[n];
      const [x, y] = b.toWorld(lx, ly);
      const rx = x - b.x, ry = y - b.y;
      const vx = b.vx - b.w * ry + ix * 0.4 + (Math.random() - 0.5) * 60;
      const vy = b.vy + b.w * rx + iy * 0.4 - 120;
      return { n, x, y, px: x - vx * DT, py: y - vy * DT, r: n === "head" ? 9 : 6 };
    });
    const L = (i, j) => Math.hypot(this.p[i].x - this.p[j].x, this.p[i].y - this.p[j].y);
    this.links = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [0, 2]].map(([i, j]) => [i, j, L(i, j)]);
    this.tmp = [];
  }

  step(world, h) {
    for (const q of this.p) {
      const vx = (q.x - q.px) * 0.998, vy = (q.y - q.py) * 0.998;
      q.px = q.x; q.py = q.y;
      q.x += vx; q.y += vy + G * h * h;
    }
    for (let it = 0; it < 4; it++) {
      for (const [i, j, len] of this.links) {
        const a = this.p[i], b = this.p[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        const k = ((d - len) / d) * 0.5;
        a.x += dx * k; a.y += dy * k; b.x -= dx * k; b.y -= dy * k;
      }
      for (const q of this.p) {
        const out = this.tmp;
        out.length = 0;
        world.collide(q.x, q.y, q.r, 0, out, false);
        for (const k of out) {
          if (k.pen <= 0) continue;
          q.x += k.nx * k.pen; q.y += k.ny * k.pen;
          // Friction: bleed off sliding along the surface.
          const vx = q.x - q.px, vy = q.y - q.py;
          const vt = -vx * k.ny + vy * k.nx;
          q.px += -k.ny * vt * 0.25; q.py += k.nx * vt * 0.25;
        }
      }
    }
  }
}

if (typeof module !== "undefined") module.exports = { World, Bike, BIKES, GEO, RIDER, DT, G, WHEEL_R, FLIP_BONUS, RESPAWN_DELAY, polySegs, pathPos };
