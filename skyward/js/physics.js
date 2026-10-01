// Movement and collision for the climber. Pure maths with no rendering, so the same code runs
// in the game and in the course checker (tools/verify.mjs).
//
// The world is made of colliders: boxes (turned only around the vertical axis) and upright
// cylinders. Some move along a line, spin, crumble when stood on, or are bouncy, icy or
// conveyor belts. There are also wind volumes (fans, gusts) and zip lines.
// The climber is an upright cylinder: feet at (x, y, z), radius R, height H.

export const P = {
  G: 25,            // gravity, m/s²
  JUMP: 9.2,        // jump speed: about 1.7 m high
  RUN: 6.2,
  SPRINT: 9.2,
  ACC_GROUND: 70,
  ACC_AIR: 18,
  ACC_ICE: 5,
  R: 0.32,
  H: 1.7,
  STEP: 0.45,       // walk up ledges this high without jumping
  COYOTE: 0.12,     // can still jump this long after walking off an edge
  BUFFER: 0.14,     // a jump pressed this early still counts on landing
  BOUNCE: 18,       // bounce pads: about 6.5 m high
  MAX_FALL: 48,
  MANTLE: 1.15,     // grab ledges whose top is up to this far above your feet
  MANTLE_T: 0.3,
  LOWG_Y: 740,      // above this height (space), gravity is weaker
  LOWG: 0.42,
  ZIP_SPEED: 13,
  CELL: 16,
};

// ------------------------------------------------------------------------------ world

export class World {
  constructor(course) {
    this.colliders = [];
    this.dynamic = [];
    this.big = [];
    this.grid = new Map();
    this.volumes = course.volumes || [];
    this.zips = course.zips || [];
    this.time = 0;
    for (const c of course.colliders) this.add(c);
  }

  add(c) {
    c.cos = Math.cos(c.yaw || 0); c.sin = Math.sin(c.yaw || 0);
    c.yaw = c.yaw || 0;
    c.dx = c.dy = c.dz = c.dyaw = 0;
    c.off = false; c.crumbleT = 0; c.downT = 0;
    if (c.move) { c.base = { x: c.x, y: c.y, z: c.z, yaw: c.yaw }; this.dynamic.push(c); }
    if (c.surf === "crumble") this.dynamic.includes(c) || this.dynamic.push(c);
    this.colliders.push(c);
    if (c.move) return;
    const e = extent(c);
    if (e.x1 - e.x0 > 200 || e.z1 - e.z0 > 200) { this.big.push(c); return; }
    const C = P.CELL;
    for (let ix = Math.floor(e.x0 / C); ix <= Math.floor(e.x1 / C); ix++)
      for (let iy = Math.floor(e.y0 / C); iy <= Math.floor(e.y1 / C); iy++)
        for (let iz = Math.floor(e.z0 / C); iz <= Math.floor(e.z1 / C); iz++) {
          const k = ix + "," + iy + "," + iz;
          let cell = this.grid.get(k);
          if (!cell) this.grid.set(k, (cell = []));
          cell.push(c);
        }
  }

  // Move the moving parts to time t and count down crumbling ones.
  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const c of this.dynamic) {
      if (c.move) {
        const m = c.move, ox = c.x, oy = c.y, oz = c.z, oyaw = c.yaw;
        if (m.kind === "line") {
          // Ease back and forth between base and base + (ax, ay, az).
          const k = 0.5 - 0.5 * Math.cos(((t / m.period) + (m.phase || 0)) * Math.PI * 2);
          c.x = c.base.x + m.ax * k; c.y = c.base.y + m.ay * k; c.z = c.base.z + m.az * k;
        } else if (m.kind === "spin") {
          c.yaw = c.base.yaw + t * m.rate;
          if (m.cx !== undefined) {
            // Orbit around a centre (a platform on the end of a spinning arm).
            const a = m.a0 + t * m.rate;
            c.x = m.cx + Math.cos(a) * m.radius; c.z = m.cz + Math.sin(a) * m.radius;
          }
        }
        c.dx = c.x - ox; c.dy = c.y - oy; c.dz = c.z - oz; c.dyaw = c.yaw - oyaw;
        c.cos = Math.cos(c.yaw); c.sin = Math.sin(c.yaw);
      }
      if (c.surf === "crumble") {
        if (c.off) { c.downT -= dt; if (c.downT <= 0) { c.off = false; c.crumbleT = 0; } }
        else if (c.crumbleT > 0) { c.crumbleT += dt; if (c.crumbleT > 0.75) { c.off = true; c.downT = 3.5; } }
      }
    }
  }

  // Colliders near a box region.
  query(x0, y0, z0, x1, y1, z1, out = []) {
    out.length = 0;
    const C = P.CELL, seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let ix = Math.floor(x0 / C); ix <= Math.floor(x1 / C); ix++)
      for (let iy = Math.floor(y0 / C); iy <= Math.floor(y1 / C); iy++)
        for (let iz = Math.floor(z0 / C); iz <= Math.floor(z1 / C); iz++) {
          const cell = this.grid.get(ix + "," + iy + "," + iz);
          if (cell) for (const c of cell) if (!seen.has(c)) { seen.add(c); out.push(c); }
        }
    for (const c of this.big) out.push(c);
    for (const c of this.dynamic) if (c.move) out.push(c);
    return out;
  }

  // Distance along a ray to the first collider (for the camera), or maxD.
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    const ex = ox + dx * maxD, ey = oy + dy * maxD, ez = oz + dz * maxD;
    const list = this.query(Math.min(ox, ex), Math.min(oy, ey), Math.min(oz, ez), Math.max(ox, ex), Math.max(oy, ey), Math.max(oz, ez), this._rq || (this._rq = []));
    let best = maxD;
    for (const c of list) {
      if (c.off || c.noCam) continue;
      const d = rayHit(c, ox, oy, oz, dx, dy, dz, best);
      if (d < best) best = d;
    }
    return best;
  }
}

function extent(c) {
  if (c.shape === "cyl") return { x0: c.x - c.r, x1: c.x + c.r, y0: c.y - c.hy, y1: c.y + c.hy, z0: c.z - c.r, z1: c.z + c.r };
  const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz, ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz;
  return { x0: c.x - ex, x1: c.x + ex, y0: c.y - c.hy, y1: c.y + c.hy, z0: c.z - ez, z1: c.z + ez };
}

function rayHit(c, ox, oy, oz, dx, dy, dz, maxD) {
  let tmin = 0, tmax = maxD;
  if (c.shape === "cyl") {
    // Slab in y, circle in xz.
    const px = ox - c.x, pz = oz - c.z;
    const a = dx * dx + dz * dz, b = 2 * (px * dx + pz * dz), cc = px * px + pz * pz - c.r * c.r;
    if (a < 1e-9) { if (cc > 0) return Infinity; }
    else {
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return Infinity;
      const s = Math.sqrt(disc);
      tmin = Math.max(tmin, (-b - s) / (2 * a)); tmax = Math.min(tmax, (-b + s) / (2 * a));
    }
    const s0 = slab(oy - c.y, dy, c.hy);
    tmin = Math.max(tmin, s0[0]); tmax = Math.min(tmax, s0[1]);
    return tmin <= tmax ? tmin : Infinity;
  }
  // Into the box's own frame.
  const px = ox - c.x, pz = oz - c.z;
  const lx = c.cos * px - c.sin * pz, lz = c.sin * px + c.cos * pz;
  const ldx = c.cos * dx - c.sin * dz, ldz = c.sin * dx + c.cos * dz;
  for (const [o, d, h] of [[lx, ldx, c.hx], [oy - c.y, dy, c.hy], [lz, ldz, c.hz]]) {
    const s = slab(o, d, h);
    tmin = Math.max(tmin, s[0]); tmax = Math.min(tmax, s[1]);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

function slab(o, d, h) {
  if (Math.abs(d) < 1e-9) return Math.abs(o) <= h ? [-Infinity, Infinity] : [Infinity, -Infinity];
  const a = (-h - o) / d, b = (h - o) / d;
  return a < b ? [a, b] : [b, a];
}

// ------------------------------------------------------------------------------ the climber

export class Player {
  constructor(world, x, y, z) {
    this.world = world;
    this.reset(x, y, z);
  }

  reset(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.ground = null;
    this.airT = 0;
    this.buffer = 0;
    this.mantle = null;
    this.zip = null;
    this.zipCool = 0;
    this.facing = 0;
    this.events = [];
    this.wall = null;
    this.near = [];
  }

  // inp: { mx, mz } world-space move direction (length 0..1), jump (held), jumpPressed, sprint.
  step(inp, dt) {
    const w = this.world;
    if (inp.jumpPressed) this.buffer = P.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);
    this.zipCool = Math.max(0, this.zipCool - dt);

    if (this.zip) return this.stepZip(inp, dt);
    if (this.mantle) return this.stepMantle(dt);

    // Ride whatever we're standing on.
    const g = this.ground;
    if (g && (g.dx || g.dy || g.dz || g.dyaw)) {
      if (g.dyaw) {
        const px = this.x - g.x, pz = this.z - g.z, c = Math.cos(-g.dyaw), s = Math.sin(-g.dyaw);
        this.x = g.x + px * c - pz * s; this.z = g.z + px * s + pz * c;
        this.facing -= g.dyaw;
      }
      this.x += g.dx; this.y += g.dy; this.z += g.dz;
    }
    if (g && g.surf === "conveyor") { this.x += g.conv[0] * dt; this.z += g.conv[1] * dt; }
    if (g && g.surf === "crumble" && g.crumbleT === 0) { g.crumbleT = 0.0001; this.events.push({ type: "crumble", c: g }); }

    // Running.
    const speed = inp.sprint ? P.SPRINT : P.RUN;
    const tx = inp.mx * speed, tz = inp.mz * speed;
    const moving = inp.mx * inp.mx + inp.mz * inp.mz > 0.01;
    if (g || moving) {
      const acc = g ? (g.surf === "ice" ? P.ACC_ICE : P.ACC_GROUND) : P.ACC_AIR;
      let ddx = tx - this.vx, ddz = tz - this.vz;
      // In the air, never slow below your current speed in the direction you're steering.
      if (!g) {
        const cur = Math.hypot(this.vx, this.vz), want = Math.hypot(tx, tz);
        if (cur > want && want > 0) { const k = cur / want; ddx = tx * k - this.vx; ddz = tz * k - this.vz; }
      }
      const d = Math.hypot(ddx, ddz), m = acc * dt;
      if (d > m) { ddx *= m / d; ddz *= m / d; }
      this.vx += ddx; this.vz += ddz;
    }
    if (moving) this.facing = Math.atan2(inp.mx, inp.mz);

    // Jumping.
    if (this.buffer > 0 && (g || this.airT < P.COYOTE) && this.vy <= 0.5) {
      this.vy = P.JUMP;
      this.buffer = 0;
      this.airT = P.COYOTE;
      this.ground = null;
      this.events.push({ type: "jump" });
    }

    // Gravity and wind.
    const grav = this.y > P.LOWG_Y ? P.G * P.LOWG : P.G;
    this.vy = Math.max(-P.MAX_FALL, this.vy - grav * dt);
    for (const v of w.volumes) {
      if (this.x > v.x0 && this.x < v.x1 && this.y > v.y0 && this.y < v.y1 && this.z > v.z0 && this.z < v.z1) {
        const k = v.gust ? Math.max(0, Math.sin(w.time * v.gust)) : 1;
        this.vx += v.fx * k * dt; this.vy += v.fy * k * dt; this.vz += v.fz * k * dt;
        if (v.fy > 0 && this.vy > v.maxUp) this.vy = v.maxUp;
        if (v.fy > 0) { this.ground = null; this.airT = P.COYOTE; }
      }
    }

    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.collide(dt);

    if (this.ground) this.airT = 0; else this.airT += dt;
    if (!this.ground) this.tryMantle(inp, dt);
    if (!this.ground && this.zipCool <= 0) this.tryZip();
  }

  collide(dt) {
    const w = this.world, R = P.R, H = P.H;
    const was = this.ground;
    this.ground = null;
    this.wall = null;
    const near = w.query(this.x - 2, this.y - 2, this.z - 2, this.x + 2, this.y + H + 2, this.z + 2, this.near);
    for (let it = 0; it < 3; it++) {
      let any = false;
      for (const c of near) {
        if (c.off || c.ghost) continue;
        const top = c.y + c.hy, bot = c.y - c.hy;
        if (this.y >= top || this.y + H <= bot) continue;
        // Horizontal overlap, in the collider's frame.
        let nx, nz, pen, inside;
        const px = this.x - c.x, pz = this.z - c.z;
        if (c.shape === "cyl") {
          const d = Math.hypot(px, pz);
          if (d >= c.r + R) continue;
          pen = c.r + R - d;
          inside = d < c.r;
          nx = d > 1e-6 ? px / d : 1; nz = d > 1e-6 ? pz / d : 0;
        } else {
          const lx = c.cos * px - c.sin * pz, lz = c.sin * px + c.cos * pz;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
          const ddx = lx - qx, ddz = lz - qz, d2 = ddx * ddx + ddz * ddz;
          if (d2 >= R * R) continue;
          let lnx, lnz;
          inside = d2 <= 1e-12;
          if (!inside) { const d = Math.sqrt(d2); pen = R - d; lnx = ddx / d; lnz = ddz / d; }
          else {
            const ex = c.hx - Math.abs(lx), ez = c.hz - Math.abs(lz);
            if (ex < ez) { pen = ex + R; lnx = Math.sign(lx) || 1; lnz = 0; } else { pen = ez + R; lnx = 0; lnz = Math.sign(lz) || 1; }
          }
          // Back to world space.
          nx = c.cos * lnx + c.sin * lnz; nz = -c.sin * lnx + c.cos * lnz;
        }
        const up = top - this.y, down = this.y + H - bot;
        const stepUp = was ? P.STEP : Math.max(0.2, -this.vy * dt + 0.08);
        if (this.vy <= 0.5 && up <= stepUp) {
          this.y = top;
          if (!was || was !== c) {
            if (this.vy < -2) this.events.push({ type: "land", v: -this.vy, c });
          }
          if (c.surf === "bounce") { this.vy = P.BOUNCE; this.events.push({ type: "bounce", c }); this.airT = P.COYOTE; continue; }
          if (this.vy < 0) this.vy = 0;
          this.ground = c;
          any = true;
        } else if (this.vy > 0 && down <= 0.3 + this.vy * dt && (inside || pen > R * 0.75)) {
          // Head bonk (only when you're really underneath it, not just clipping the edge).
          this.y = bot - H;
          this.vy = 0;
          any = true;
        } else {
          this.x += nx * pen; this.z += nz * pen;
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) { this.vx -= vn * nx; this.vz -= vn * nz; }
          this.wall = { c, nx, nz };
          any = true;
        }
      }
      if (!any) break;
    }
  }

  // Grab a ledge in front of you and pull yourself up onto it.
  tryMantle(inp, dt) {
    const wl = this.wall;
    if (!wl || this.vy > 6) return;
    const c = wl.c;
    if (c.surf === "bounce" || c.noGrab) return;
    const into = -(inp.mx * wl.nx + inp.mz * wl.nz);
    if (into < 0.4) return;
    const top = c.y + c.hy, rise = top - this.y;
    if (rise <= 0.05 || rise > P.MANTLE) return;
    // Land a little way in from the edge, if there's room to stand there.
    const tx = this.x - wl.nx * (P.R + 0.25), tz = this.z - wl.nz * (P.R + 0.25);
    if (!this.standable(c, tx, tz) || this.blocked(tx, top + 0.02, tz)) return;
    this.mantle = { t: 0, x0: this.x, y0: this.y, z0: this.z, x1: tx, y1: top, z1: tz, c };
    this.vx = this.vy = this.vz = 0;
    this.events.push({ type: "mantle" });
  }

  standable(c, x, z) {
    const px = x - c.x, pz = z - c.z;
    if (c.shape === "cyl") return Math.hypot(px, pz) < c.r + P.R * 0.6;
    const lx = c.cos * px - c.sin * pz, lz = c.sin * px + c.cos * pz;
    return Math.abs(lx) < c.hx + P.R * 0.6 && Math.abs(lz) < c.hz + P.R * 0.6;
  }

  // Is there anything solid where the climber would stand at (x, y, z)?
  blocked(x, y, z) {
    const R = P.R * 0.9;
    for (const c of this.world.query(x - 1, y, z - 1, x + 1, y + P.H, z + 1, this._bq || (this._bq = []))) {
      if (c.off || c.ghost) continue;
      if (y + 0.01 >= c.y + c.hy || y + P.H <= c.y - c.hy) continue;
      const px = x - c.x, pz = z - c.z;
      if (c.shape === "cyl") { if (Math.hypot(px, pz) < c.r + R) return true; continue; }
      const lx = c.cos * px - c.sin * pz, lz = c.sin * px + c.cos * pz;
      const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
      if ((lx - qx) ** 2 + (lz - qz) ** 2 < R * R) return true;
    }
    return false;
  }

  stepMantle(dt) {
    const m = this.mantle;
    m.t += dt / P.MANTLE_T;
    const k = Math.min(1, m.t);
    // Up first, then forward.
    const ku = Math.min(1, k * 1.6), kf = Math.max(0, (k - 0.35) / 0.65);
    const c = m.c;
    if (c.dx || c.dy || c.dz) { m.x1 += c.dx; m.y1 += c.dy; m.z1 += c.dz; m.x0 += c.dx; m.y0 += c.dy; m.z0 += c.dz; }
    this.x = m.x0 + (m.x1 - m.x0) * kf;
    this.y = m.y0 + (m.y1 - m.y0) * ku;
    this.z = m.z0 + (m.z1 - m.z0) * kf;
    if (k >= 1) {
      this.mantle = null;
      this.vx = this.vy = this.vz = 0;
      this.y = m.y1 + 0.01;
      this.collide(dt);
      if (!this.ground && !m.c.off) this.ground = m.c;
    }
  }

  // Catch a zip line when your hands pass close to it.
  tryZip() {
    if (this.vy > 3) return;
    const hx = this.x, hy = this.y + 2.0, hz = this.z;
    for (const zp of this.world.zips) {
      const ax = zp.a[0], ay = zp.a[1], az = zp.a[2], bx = zp.b[0] - ax, by = zp.b[1] - ay, bz = zp.b[2] - az;
      const L2 = bx * bx + by * by + bz * bz;
      let s = ((hx - ax) * bx + (hy - ay) * by + (hz - az) * bz) / L2;
      if (s < 0 || s > 0.9) continue;
      const cx = ax + bx * s, cy = ay + by * s, cz = az + bz * s;
      if ((hx - cx) ** 2 + (hy - cy) ** 2 + (hz - cz) ** 2 < 0.9 * 0.9) {
        this.zip = { zp, s, L: Math.sqrt(L2) };
        this.vx = this.vy = this.vz = 0;
        this.events.push({ type: "zipOn" });
        return;
      }
    }
  }

  stepZip(inp, dt) {
    const z = this.zip, zp = z.zp;
    z.s += (P.ZIP_SPEED * dt) / z.L;
    const bx = zp.b[0] - zp.a[0], by = zp.b[1] - zp.a[1], bz = zp.b[2] - zp.a[2];
    const s = Math.min(1, z.s);
    this.x = zp.a[0] + bx * s; this.y = zp.a[1] + by * s - 2.0; this.z = zp.a[2] + bz * s;
    this.facing = Math.atan2(bx, bz);
    if (z.s >= 1 || this.buffer > 0) {
      const k = P.ZIP_SPEED / z.L;
      this.vx = bx * k * 0.7; this.vz = bz * k * 0.7; this.vy = this.buffer > 0 ? P.JUMP * 0.8 : 0;
      this.buffer = 0;
      this.zip = null;
      this.zipCool = 0.6;
      this.events.push({ type: "zipOff" });
    }
  }
}
