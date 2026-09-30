"use strict";
// Celeste fan game simulation: the climber's physics and every level object. There is no DOM
// code here, so the same file runs in the browser and in the room checker
// (tools/verify.js), which proves each room can be finished.
//
// Units are pixels (the screen is 320×180, tiles are 8 px) and seconds, stepped at a
// fixed 60 Hz. The movement constants and the order of the update follow Celeste's
// released Player.cs (MIT licensed, NoelFB/Celeste), which is where its feel comes from.

const DT = 1 / 60;
const TILE = 8;
const VIEW_W = 320, VIEW_H = 180;
const MAX_DASHES = 1;

const C = {
  // Gravity and falling
  Gravity: 900, MaxFall: 160, FastMaxFall: 240, FastMaxAccel: 300, HalfGravThreshold: 40,
  // Running
  MaxRun: 90, RunAccel: 1000, RunReduce: 400, AirMult: 0.65, DuckFriction: 500,
  // Jumping
  JumpSpeed: -105, JumpHBoost: 40, VarJumpTime: 0.2, JumpGraceTime: 0.1, CeilingVarJumpGrace: 0.05,
  UpwardCornerCorrection: 4, JumpBuffer: 0.08,
  // Walls
  WallJumpCheckDist: 3, WallJumpHSpeed: 130, WallJumpForceTime: 0.16, WallSpeedRetentionTime: 0.06,
  WallSlideStartMax: 20, WallSlideTime: 1.2,
  // Climbing and stamina
  ClimbMaxStamina: 110, ClimbUpCost: 100 / 2.2, ClimbStillCost: 100 / 10, ClimbJumpCost: 110 / 4,
  ClimbTiredThreshold: 20, ClimbUpSpeed: -45, ClimbDownSpeed: 80, ClimbSlipSpeed: 30, ClimbAccel: 900,
  ClimbGrabYMult: 0.2, ClimbHopY: -120, ClimbHopX: 100, ClimbHopForceTime: 0.2, ClimbJumpBoostTime: 0.2,
  ClimbNoMoveTime: 0.1, ClimbCheckDist: 2,
  // Dashing
  DashSpeed: 240, EndDashSpeed: 160, EndDashUpMult: 0.75, DashTime: 0.15, DashCooldown: 0.2,
  DashRefillCooldown: 0.1, DashCornerCorrection: 4, DashFreeze: 0.05, DashBuffer: 0.08,
  DodgeSlideSpeedMult: 1.2,
  // Dash-jump tech (supers, hypers, wallbounces)
  SuperJumpH: 260, DuckSuperJumpXMult: 1.25, DuckSuperJumpYMult: 0.5,
  SuperWallJumpSpeed: -160, SuperWallJumpH: 170, SuperWallJumpVarTime: 0.25, SuperWallJumpForceTime: 0.2,
  // Springs and objects
  SuperBounceSpeed: -185, BounceVarJumpTime: 0.2,
  RefillRespawn: 2.5, RefillFreeze: 0.05, CrumbleDelay: 0.4, CrumbleRespawn: 2, BerryCollectDelay: 0.15,
  // Moving blocks hand you their speed when you jump off them (a "lift boost").
  LiftSpeedGraceTime: 0.16, LiftXCap: 250, LiftYCap: -130,
  // Zip movers: shake, rush to the end (0.5 s), rest, crawl back (2 s), rest.
  ZipShake: 0.1, ZipOutRate: 2, ZipEndWait: 0.5, ZipBackRate: 0.5, ZipStartWait: 0.5,
  // Dream blocks: a dash that touches one within DashAttackTime carries you through it.
  DashAttackTime: 0.3, DreamDashSpeed: 240, DreamDashMinTime: 0.1,
  // Clouds: springy one-way platforms. Move blocks roll where their arrow points, then crash.
  CloudLand: 110, CloudSpring: 400, CloudDamp: 12, CloudSink: 3, CloudRespawn: 2.5,
  MoveSpeed: 60, MoveAccel: 300, MoveShake: 0.15, MoveRespawn: 2.2,
  // Swap blocks switch ends on every dash. Bubbles hold you, then launch you.
  SwapSpeed: 360, SwapAccel: 1440, BoostTime: 0.25, BoostRespawn: 1, RedSpeed: 240,
  // Feathers: fly for 2 s, steering towards where you hold. Bumpers knock you away.
  FlyTime: 2, FlyStartSpeed: 250, FlyTargetSpeed: 140, FlySlowSpeed: 91, FlyAccel: 1000, FlyRotate: 320 * Math.PI / 180,
  FlyEndX: 160, FlyEndMinY: -100, FlyEndMaxY: 60, FeatherRespawn: 3,
  BumperSpeed: 280, BumperRespawn: 0.6, LaunchHold: 0.2,
  DeathTime: 0.55, RespawnTime: 0.4, TransitionTime: 0.4,
};

const ST_NORMAL = 0, ST_CLIMB = 1, ST_DASH = 2, ST_DEAD = 3, ST_RESPAWN = 4, ST_DREAM = 5, ST_BOOST = 6, ST_RED = 7, ST_FLY = 8;
const DIRV = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] };

// Hitboxes relative to the climber's feet (bottom centre). The hurtbox is 2 px shorter so
// spikes feel fair.
const HB = { normal: { l: -4, t: -11, w: 8, h: 11 }, duck: { l: -4, t: -6, w: 8, h: 6 } };
const HURT = { normal: { l: -4, t: -11, w: 8, h: 9 }, duck: { l: -4, t: -4, w: 8, h: 4 } };

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const approach = (v, target, amt) => (v < target ? Math.min(v + amt, target) : Math.max(v - amt, target));
const lerp = (a, b, t) => a + (b - a) * t;
const sineIn = (t) => 1 - Math.cos(t * Math.PI / 2);
// C#'s Math.Round rounds halves to even; match it so sub-pixel movement behaves the same.
const roundEven = (v) => {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------------------- rooms

// Room tiles:
//   #  rock            =  jump-through ledge       ^ v < >  spikes (pointing that way)
//   P  respawn point   s  spring                   o  dash refill crystal
//   %  crumble block   *  strawberry               G  summit flag (end of the chapter)
//   O  pink crystal: refills to two dashes
//   W  winged strawberry: flies away if you dash before touching it
//   D  dream block: solid, but a dash into it carries you through and refills your dash
//   T  touch switch       X  gate block: solid until every switch in the room is touched
//   c  cloud (a run of c is one cloud)   f  pink cloud: breaks after you've used it once
//   b  green bubble: holds you, then dashes you   B  red bubble: flings you until you hit something
//   F  feather: fly for two seconds               U  bumper: knocks you away
//   K  cassette tape (unlocks the chapter's B-side)   H  crystal heart
// `dashes: 2` gives every dash refill in the room two dashes. `water: { speed, delay }` floods
// the room from the bottom once you start moving.
// A room can also have `wind` (px/s, + blows right, - blows left), and moving blocks given in
// tiles: `zips` { x, y, w, h, tx, ty } (zip movers: block, then where it travels to),
// `moves` { x, y, w, h, dir } (move blocks, dir r/l/u/d) and `swaps` { x, y, w, h, tx, ty }.
function buildRoom(def, index, chapterId) {
  const rows = def.rows, h = rows.length, w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`room ${def.id}: row ${i} is ${r.length} wide, expected ${w}`);
  });
  const x0 = def.x * TILE, y0 = def.y * TILE;
  const room = {
    id: def.id, name: def.name || "", index, tx: def.x, ty: def.y, w, h, wind: def.wind || 0,
    x: x0, y: y0, pw: w * TILE, ph: h * TILE,
    grid: [], spawns: [], springs: [], refills: [], berries: [], crumbles: [], goal: null, items: [],
    switches: [], gateOpen: false, hasGate: false,
    crumbleAt: new Int16Array(w * h).fill(-1),
    zips: (def.zips || []).map((z) => {
      const sx = x0 + z.x * TILE, sy = y0 + z.y * TILE;
      return { kind: "zip", x: sx, y: sy, fx: sx, fy: sy, w: z.w * TILE, h: z.h * TILE, sx, sy, ex: x0 + z.tx * TILE, ey: y0 + z.ty * TILE, state: 0, t: 0, at: 0 };
    }),
    moves: (def.moves || []).map((m) => {
      const sx = x0 + m.x * TILE, sy = y0 + m.y * TILE;
      return { kind: "move", x: sx, y: sy, fx: sx, fy: sy, w: m.w * TILE, h: m.h * TILE, sx, sy, dir: m.dir, state: 0, t: 0, speed: 0, gone: false };
    }),
    swaps: (def.swaps || []).map((m) => {
      const sx = x0 + m.x * TILE, sy = y0 + m.y * TILE;
      return { kind: "swap", x: sx, y: sy, fx: sx, fy: sy, w: m.w * TILE, h: m.h * TILE, sx, sy, ex: x0 + m.tx * TILE, ey: y0 + m.ty * TILE, target: 0, speed: 0 };
    }),
    clouds: [], boosters: [], feathers: [], bumpers: [], dashes: def.dashes || MAX_DASHES,
    // A still pool (`level`, in rows) or a flood that rises from below the room.
    water: def.water ? { speed: def.water.speed || 0, delay: def.water.delay || 0, base: def.water.level ? y0 + def.water.level * TILE : y0 + h * TILE + 12, y: 0, t: 0 } : null,
  };
  room.movers = [...room.zips, ...room.moves, ...room.swaps];
  if (room.water) room.water.y = room.water.base;
  for (let y = 0; y < h; y++) {
    const row = rows[y].split("");
    for (let x = 0; x < w; x++) {
      const c = row[x], px = x0 + x * TILE, py = y0 + y * TILE;
      if (c === "P") room.spawns.push({ x: px + 4, y: py + TILE });
      else if (c === "s") room.springs.push({ x: px, y: py, t: 0 });
      else if (c === "o" || c === "O") room.refills.push({ x: px + 4, y: py + 4, respawn: 0, two: c === "O" });
      else if (c === "*" || c === "W") room.berries.push({ id: `${chapterId}/${def.id}:${x},${y}`, hx: px + 4, hy: py + 4, x: px + 4, y: py + 4, state: 0, winged: c === "W" });
      else if (c === "G") room.goal = { x: px, y: py - TILE, w: TILE, h: TILE * 2 };
      else if (c === "K" || c === "H") room.items.push({ kind: c === "K" ? "cassette" : "heart", x: px + 4, y: py + 4, got: false });
      else if (c === "T") room.switches.push({ x: px, y: py, on: false });
      else if (c === "X") { room.hasGate = true; continue; }
      else if (c === "b" || c === "B") room.boosters.push({ x: px + 4, y: py + 4, red: c === "B", respawn: 0 });
      else if (c === "F") room.feathers.push({ x: px + 4, y: py + 4, respawn: 0 });
      else if (c === "U") room.bumpers.push({ x: px + 4, y: py + 4, respawn: 0 });
      else if (c === "c" || c === "f") continue;
      else if (c === "#" || c === "=" || c === "%" || c === "D" || "^v<>".includes(c)) continue;
      else if (c !== ".") throw new Error(`room ${def.id}: unknown tile "${c}" at ${x},${y}`);
      if (c !== "%" && c !== "c" && c !== "f") row[x] = ".";
    }
    room.grid.push(row);
  }
  // Crumble blocks fall as a group: each horizontal run of % is one platform.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (room.grid[y][x] !== "%" || (x > 0 && room.grid[y][x - 1] === "%")) continue;
      let x1 = x;
      while (x1 + 1 < w && room.grid[y][x1 + 1] === "%") x1++;
      const gi = room.crumbles.length;
      room.crumbles.push({ tx0: x, tx1: x1, ty: y, x: x0 + x * TILE, y: y0 + y * TILE, w: (x1 - x + 1) * TILE, h: TILE, state: 0, t: 0 });
      for (let k = x; k <= x1; k++) { room.crumbleAt[y * w + k] = gi; room.grid[y][k] = "."; }
    }
  }
  // Clouds: each horizontal run of c (or f) is one cloud.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = room.grid[y][x];
      if ((c !== "c" && c !== "f") || (x > 0 && room.grid[y][x - 1] === c)) continue;
      let x1 = x;
      while (x1 + 1 < w && room.grid[y][x1 + 1] === c) x1++;
      const cy = y0 + y * TILE;
      room.clouds.push({ x: x0 + x * TILE, y: cy, by: cy, w: (x1 - x + 1) * TILE, fragile: c === "f", d: 0, v: 0, was: false, gone: false, t: 0 });
      for (let k = x; k <= x1; k++) room.grid[y][k] = ".";
    }
  }
  if (!room.spawns.length) throw new Error(`room ${def.id} has no respawn point (P)`);
  return room;
}

// ---------------------------------------------------------------------------- the game

class Game {
  // opts: { startRoom, startSpawn, collected: [berry ids], assist, quiet }
  constructor(chapter, opts = {}) {
    this.chapter = chapter;
    this.rooms = chapter.rooms.map((def, i) => buildRoom(def, i, chapter.id));
    this.roomIndex = {};
    this.rooms.forEach((r) => { this.roomIndex[r.id] = r; });
    this.assist = Object.assign({ infiniteStamina: false, airDashes: "default", invincible: false }, opts.assist);
    this.quiet = !!opts.quiet;         // skip events (used by the room checker)
    this.events = [];
    this.collected = new Set(opts.collected || []);
    this.deaths = opts.deaths || 0;
    this.time = opts.time || 0;
    this.done = false;
    this.jumpBuf = 0; this.dashBuf = 0; this.freeze = 0;
    this.transition = null;
    this.trail = [];                   // recent climber positions, for following strawberries
    this.berryChain = 0; this.berryChainT = 0;
    // Things already in the save show as see-through "ghosts" (like collected strawberries).
    this.owned = new Set(opts.owned || []);
    for (const r of this.rooms) for (const it of r.items) it.ghost = this.owned.has(it.kind);
    // A golden strawberry waits at the start of a replayed chapter: carry it to the end
    // without dying. It only counts if it's with you at the finish.
    this.golden = null;
    if (opts.golden) {
      const r0 = this.rooms[0], sp = r0.spawns[0];
      this.golden = { x: sp.x + 14, y: sp.y - 14, hx: sp.x + 14, hy: sp.y - 14, state: 0, room: r0 };
    }
    this.inp = { mx: 0, my: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false };
    this.moveX = 0;
    this.ignoreSolid = null;           // the zip mover currently shoving you (don't collide with it)
    this.passDream = false;            // treat dream blocks as open space (dream dash checks)
    const room = (opts.startRoom && this.roomIndex[opts.startRoom]) || this.rooms[0];
    this.room = room;
    this.spawn = room.spawns[Math.min(opts.startSpawn || 0, room.spawns.length - 1)];
    this.p = this.newPlayer(this.spawn);
    this.resetRoomObjects(room);
    this.syncBerries();
  }

  emit(type, data) { if (!this.quiet) this.events.push(Object.assign({ type }, data)); }

  newPlayer(sp) {
    return {
      x: sp.x, y: sp.y, rx: 0, ry: 0, vx: 0, vy: 0, facing: 1, state: ST_NORMAL,
      onGround: true, ducking: false, dashes: this.room.dashes, stamina: C.ClimbMaxStamina,
      jumpGrace: 0, varJumpTimer: 0, varJumpSpeed: 0, autoJump: false, maxFall: C.MaxFall,
      dashCooldown: 0, dashRefillCooldown: 0, dashPhase: 0, dashWait: 0, dashDirX: 0, dashDirY: 0,
      beforeDashX: 0, beforeDashY: 0, forceMoveX: 0, forceMoveXTimer: 0,
      wallSlideTimer: C.WallSlideTime, wallSlideDir: 0, wallSpeedRetained: 0, wallSpeedRetentionTimer: 0,
      wallBoostDir: 0, wallBoostTimer: 0, hopWaitX: 0, hopWaitXSpeed: 0, climbNoMoveTimer: 0, lastClimbMove: 0,
      deadT: 0, respawnT: 0, safeT: 0, sx: 1, sy: 1, flash: 0,
      liftX: 0, liftY: 0, liftT: 0, dashAttackT: 0, dreamT: 0, boostT: 0, boostCd: 0, booster: null,
      flyT: 0, flyAng: 0, flySpeed: 0, launchT: 0,
      justRespawned: true,   // wind leaves you alone until you first move, as in Celeste
    };
  }

  // ------------------------------------------------------------------ tiles & collision

  roomAtTile(gx, gy) {
    const r = this.room;
    if (gx >= r.tx && gy >= r.ty && gx < r.tx + r.w && gy < r.ty + r.h) return r;
    for (const o of this.rooms) {
      if (gx >= o.tx && gy >= o.ty && gx < o.tx + o.w && gy < o.ty + o.h) return o;
    }
    return null;
  }

  roomAtPoint(px, py) { return this.roomAtTile(Math.floor(px / TILE), Math.floor(py / TILE)); }

  tileAt(gx, gy) {
    const r = this.roomAtTile(gx, gy);
    return r ? r.grid[gy - r.ty][gx - r.tx] : null;
  }

  solidTile(gx, gy) {
    const r = this.roomAtTile(gx, gy);
    // Outside every room is solid rock, except below the current room: that's a pit.
    if (!r) return gy < this.room.ty + this.room.h;
    const lx = gx - r.tx, ly = gy - r.ty, c = r.grid[ly][lx];
    if (c === "#") return true;
    if (c === "D") return !this.passDream;
    if (c === "X") return !r.gateOpen;
    const cg = r.crumbleAt[ly * r.w + lx];
    return cg >= 0 && r.crumbles[cg].state !== 2;
  }

  solidPoint(px, py) { return this.solidTile(Math.floor(px / TILE), Math.floor(py / TILE)); }

  collideRect(l, t, w, h) {
    const x0 = Math.floor(l / TILE), x1 = Math.floor((l + w - 1) / TILE);
    const y0 = Math.floor(t / TILE), y1 = Math.floor((t + h - 1) / TILE);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) if (this.solidTile(gx, gy)) return true;
    for (const z of this.room.movers) {
      if (z !== this.ignoreSolid && !z.gone && l < z.x + z.w && z.x < l + w && t < z.y + z.h && z.y < t + h) return true;
    }
    return false;
  }

  // Does the rectangle touch a dream block?
  dreamRect(l, t, w, h) {
    const x0 = Math.floor(l / TILE), x1 = Math.floor((l + w - 1) / TILE);
    const y0 = Math.floor(t / TILE), y1 = Math.floor((t + h - 1) / TILE);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) if (this.tileAt(gx, gy) === "D") return true;
    return false;
  }
  dreamAt(x, y, b = this.box()) { return this.dreamRect(x + b.l, y + b.t, b.w, b.h); }
  solidNoDreamAt(x, y) {
    this.passDream = true;
    const hit = this.collideAt(x, y);
    this.passDream = false;
    return hit;
  }

  box() { return this.p.ducking ? HB.duck : HB.normal; }
  collideAt(x, y, b = this.box()) { return this.collideRect(x + b.l, y + b.t, b.w, b.h); }

  // A jump-through ledge whose top is exactly at the climber's feet.
  jumpThruAt(x, y) {
    for (const c of this.room.clouds) if (!c.gone && c.y === y && x + 4 > c.x && x - 4 < c.x + c.w) return true;
    if (y % TILE !== 0) return false;
    const gy = y / TILE, x0 = Math.floor((x - 4) / TILE), x1 = Math.floor((x + 3) / TILE);
    for (let gx = x0; gx <= x1; gx++) if (this.tileAt(gx, gy) === "=") return true;
    return false;
  }

  hitbox() {
    const p = this.p, b = this.box();
    return { x: p.x + b.l, y: p.y + b.t, w: b.w, h: b.h };
  }

  // Celeste won't let you climb or wall-jump off the invisible edge of a room.
  boundsCheck(dir, dist) {
    const p = this.p, r = this.room;
    return p.x - 4 + dir * dist >= r.x && p.x + 4 + dir * dist <= r.x + r.pw;
  }

  // ------------------------------------------------------------------ movement

  moveH(amount) {
    const p = this.p;
    p.rx += amount;
    let m = roundEven(p.rx);
    p.rx -= m;
    const s = sign(m);
    while (m !== 0) {
      if (this.collideAt(p.x + s, p.y)) { p.rx = 0; this.onCollideH(); return true; }
      p.x += s;
      m -= s;
    }
    return false;
  }

  moveV(amount) {
    const p = this.p;
    p.ry += amount;
    let m = roundEven(p.ry);
    p.ry -= m;
    const s = sign(m);
    while (m !== 0) {
      if (this.collideAt(p.x, p.y + s) || (s > 0 && this.jumpThruAt(p.x, p.y))) { p.ry = 0; this.onCollideV(); return true; }
      p.y += s;
      m -= s;
    }
    return false;
  }

  onCollideH() {
    const p = this.p;
    if (p.state === ST_RED) { p.vx = 0; this.redEnd(); return; }
    if (p.state === ST_FLY) { p.vx = 0; return; }
    if (this.dreamDashCheck(sign(p.vx), 0)) { this.setState(ST_DREAM); return; }
    if (p.state === ST_DASH) {
      // Dashing into a low gap ducks you under it; clipping a ledge lip pushes you round it.
      if (p.onGround && !this.collideAt(p.x + sign(p.vx), p.y, HB.duck)) { p.ducking = true; return; }
      if (p.vy === 0 && p.vx !== 0) {
        for (let i = 1; i <= C.DashCornerCorrection; i++) {
          for (const j of [1, -1]) {
            if (!this.collideAt(p.x + sign(p.vx), p.y + i * j)) { p.y += i * j; p.x += sign(p.vx); return; }
          }
        }
      }
    }
    // Wall speed retention: bump a wall, and if it ends within 0.06 s you keep your speed.
    if (p.wallSpeedRetentionTimer <= 0) { p.wallSpeedRetained = p.vx; p.wallSpeedRetentionTimer = C.WallSpeedRetentionTime; }
    p.vx = 0;
  }

  onCollideV() {
    const p = this.p;
    if (p.state === ST_RED) { p.vy = 0; this.redEnd(); return; }
    if (p.state === ST_FLY) { p.vy = 0; return; }
    if (this.dreamDashCheck(0, sign(p.vy))) { this.setState(ST_DREAM); return; }
    if (p.vy < 0) {
      // Upward corner correction: a head that clips a corner by up to 4 px slides round it.
      const n = p.state === ST_DASH ? C.DashCornerCorrection : C.UpwardCornerCorrection;
      if (p.vx <= 0) for (let i = 1; i <= n; i++) if (!this.collideAt(p.x - i, p.y - 1)) { p.x -= i; p.y -= 1; return; }
      if (p.vx >= 0) for (let i = 1; i <= n; i++) if (!this.collideAt(p.x + i, p.y - 1)) { p.x += i; p.y -= 1; return; }
      if (p.varJumpTimer < C.VarJumpTime - C.CeilingVarJumpGrace) p.varJumpTimer = 0;
    } else if (p.vy > 0) {
      // A down-diagonal dash into the floor turns horizontal and speeds up (an "ultra").
      if (p.state === ST_DASH && p.dashDirX !== 0 && p.dashDirY > 0) {
        p.dashDirX = sign(p.dashDirX); p.dashDirY = 0;
        p.vy = 0; p.vx *= C.DodgeSlideSpeedMult; p.ducking = true;
      }
      if (p.state !== ST_CLIMB) {
        const squish = Math.min(p.vy / C.FastMaxFall, 1);
        p.sx = lerp(1, 1.6, squish); p.sy = lerp(1, 0.4, squish);
        if (p.vy > 40) this.emit("land", { x: p.x, y: p.y, power: squish });
      }
    }
    p.vy = 0;
  }

  // ------------------------------------------------------------------ helpers

  canUnDuck() { return !this.p.ducking || !this.collideAt(this.p.x, this.p.y, HB.normal); }
  isTired() {
    const p = this.p;
    return (p.wallBoostTimer > 0 ? p.stamina + C.ClimbJumpCost : p.stamina) < C.ClimbTiredThreshold;
  }
  climbCheck(dir, yAdd = 0) {
    return this.boundsCheck(dir, C.ClimbCheckDist) && this.collideAt(this.p.x + dir * C.ClimbCheckDist, this.p.y + yAdd);
  }
  wallJumpCheck(dir) {
    return this.boundsCheck(dir, C.WallJumpCheckDist) && this.collideAt(this.p.x + dir * C.WallJumpCheckDist, this.p.y);
  }
  canDash() { return this.dashBuf > 0 && this.p.dashCooldown <= 0 && this.p.dashes > 0; }
  // Hands above the top of the wall: you're about to climb over it.
  slipCheck(addY = 0) {
    const p = this.p, top = p.y + this.box().t;
    const px = p.facing > 0 ? p.x + 4 : p.x - 5, py = top + 4 + addY;
    return !this.solidPoint(px, py) && !this.solidPoint(px, py - 4 + addY);
  }
  aim() {
    let x = this.inp.mx, y = this.inp.my;
    if (!x && !y) return { x: this.p.facing, y: 0 };
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
  squash(x, y) { this.p.sx = x; this.p.sy = y; }
  // The speed of whatever moving block you were on, capped: added to every jump.
  liftBoost() {
    const p = this.p;
    let x = p.liftX, y = p.liftY;
    if (Math.abs(x) > C.LiftXCap) x = C.LiftXCap * sign(x);
    if (y > 0) y = 0; else if (y < C.LiftYCap) y = C.LiftYCap;
    return { x, y };
  }
  addLift() {
    const p = this.p, lb = this.liftBoost();
    p.vx += lb.x; p.vy += lb.y;
  }

  // ------------------------------------------------------------------ jumps

  jump() {
    const p = this.p;
    this.jumpBuf = 0;
    p.jumpGrace = 0; p.varJumpTimer = C.VarJumpTime; p.autoJump = false;
    p.wallSlideTimer = C.WallSlideTime; p.wallBoostTimer = 0;
    p.vx += C.JumpHBoost * this.moveX;
    p.vy = C.JumpSpeed;
    this.addLift();
    p.varJumpSpeed = p.vy;
    this.squash(0.6, 1.4);
    this.emit("jump", { x: p.x, y: p.y });
  }

  wallJump(dir) {
    const p = this.p;
    p.ducking = false;
    this.jumpBuf = 0;
    p.jumpGrace = 0; p.varJumpTimer = C.VarJumpTime; p.autoJump = false;
    p.wallSlideTimer = C.WallSlideTime; p.wallBoostTimer = 0;
    if (this.moveX !== 0) { p.forceMoveX = dir; p.forceMoveXTimer = C.WallJumpForceTime; }
    p.vx = C.WallJumpHSpeed * dir;
    p.vy = C.JumpSpeed;
    this.addLift();
    p.varJumpSpeed = p.vy;
    this.squash(0.6, 1.4);
    this.emit("wallJump", { x: p.x - dir * 4, y: p.y - 5, dir });
  }

  climbJump() {
    const p = this.p;
    if (!p.onGround) p.stamina -= C.ClimbJumpCost;
    this.jump();
    // Turn it into a wall jump within 0.2 s and you get the stamina back.
    if (this.moveX === 0) { p.wallBoostDir = -p.facing; p.wallBoostTimer = C.ClimbJumpBoostTime; }
  }

  superJump() {
    const p = this.p;
    this.jumpBuf = 0;
    p.jumpGrace = 0; p.varJumpTimer = C.VarJumpTime; p.autoJump = false;
    p.wallSlideTimer = C.WallSlideTime; p.wallBoostTimer = 0;
    p.vx = C.SuperJumpH * p.facing;
    p.vy = C.JumpSpeed;
    if (p.ducking) {
      // A hyper: dashing down-diagonally into the ground, then jumping.
      p.ducking = false;
      p.vx *= C.DuckSuperJumpXMult; p.vy *= C.DuckSuperJumpYMult;
    }
    this.addLift();
    p.varJumpSpeed = p.vy;
    this.squash(0.6, 1.4);
    this.emit("jump", { x: p.x, y: p.y, big: true });
  }

  superWallJump(dir) {
    const p = this.p;
    p.ducking = false;
    this.jumpBuf = 0;
    p.jumpGrace = 0; p.varJumpTimer = C.SuperWallJumpVarTime; p.autoJump = false;
    p.wallSlideTimer = C.WallSlideTime; p.wallBoostTimer = 0;
    p.vx = C.SuperWallJumpH * dir;
    p.vy = C.SuperWallJumpSpeed;
    this.addLift();
    p.varJumpSpeed = p.vy;
    p.forceMoveX = dir; p.forceMoveXTimer = C.SuperWallJumpForceTime;
    this.squash(0.6, 1.4);
    this.emit("wallJump", { x: p.x - dir * 4, y: p.y - 5, dir, big: true });
  }

  superBounce(fromY) {
    const p = this.p;
    if (!this.collideAt(p.x, fromY)) p.y = fromY;
    p.ry = 0;
    p.autoJump = true;
    p.varJumpTimer = C.BounceVarJumpTime;
    p.vy = p.varJumpSpeed = C.SuperBounceSpeed;
    p.ducking = false;
    this.setState(ST_NORMAL);
    p.dashes = Math.max(p.dashes, this.room.dashes);
    p.stamina = C.ClimbMaxStamina;
    this.squash(0.6, 1.4);
  }

  // ------------------------------------------------------------------ states

  setState(ns) {
    const p = this.p;
    if (ns === p.state) return;
    p.state = ns;
    if (ns === ST_CLIMB) this.climbBegin();
    else if (ns === ST_DASH) this.dashBegin();
    else if (ns === ST_DREAM) this.dreamBegin();
  }

  startDash() {
    this.p.dashes = Math.max(0, this.p.dashes - 1);
    this.dashBuf = 0;
    this.onDash();
    return ST_DASH;
  }

  // Anything that reacts to a dash: winged strawberries take fright, swap blocks switch ends.
  onDash() {
    for (const b of this.room.berries) {
      if (b.winged && b.state === 0) { b.state = 3; b.flyT = this.time; this.emit("berryFly", { x: b.hx, y: b.hy }); }
    }
    for (const m of this.room.swaps) { m.target ^= 1; m.speed = 0; }
    if (this.room.swaps.length) this.emit("swap", {});
  }

  // ------------------------------------------------------------------ bubbles

  enterBoost(bo) {
    const p = this.p;
    p.state = ST_BOOST;
    p.booster = bo;
    p.boostT = C.BoostTime;
    p.vx = 0; p.vy = 0; p.rx = 0; p.ry = 0;
    p.ducking = false;
    p.dashes = Math.max(p.dashes, this.room.dashes);
    p.stamina = C.ClimbMaxStamina;
    if (!this.collideAt(bo.x, bo.y + 5)) { p.x = bo.x; p.y = bo.y + 5; }
    this.emit("boostIn", { x: bo.x, y: bo.y, red: bo.red });
  }

  // Held in the bubble for a moment (or until you press dash), then launched the way you aim.
  boostUpdate() {
    const p = this.p;
    p.boostT -= DT;
    if (this.dashBuf <= 0 && p.boostT > 0) return;
    this.dashBuf = 0;
    const bo = p.booster;
    bo.respawn = C.BoostRespawn;
    p.boostCd = 0.2;
    this.onDash();
    if (!bo.red) {
      // A green bubble gives you a free dash.
      p.state = ST_DASH;
      this.dashBegin();
      return;
    }
    const a = this.aim();
    p.state = ST_RED;
    p.dashDirX = a.x; p.dashDirY = a.y;
    if (a.x) p.facing = sign(a.x);
    p.vx = a.x * C.RedSpeed; p.vy = a.y * C.RedSpeed;
    this.emit("redLaunch", { x: p.x, y: p.y - 6 });
  }

  // ------------------------------------------------------------------ feathers and bumpers

  enterFly() {
    const p = this.p;
    if (p.state === ST_FLY) { p.flyT = C.FlyTime; return; }
    const moving = Math.hypot(p.vx, p.vy) > 1;
    const a = this.inp.mx || this.inp.my ? this.aim() : moving ? { x: p.vx, y: p.vy } : { x: 0, y: -1 };
    p.state = ST_FLY;
    p.flyT = C.FlyTime;
    p.flyAng = Math.atan2(a.y, a.x);
    p.flySpeed = C.FlyStartSpeed;
    p.ducking = false;
    p.dashes = Math.max(p.dashes, this.room.dashes);
    p.stamina = C.ClimbMaxStamina;
    this.emit("flyIn", { x: p.x, y: p.y - 6 });
  }

  // Flying: you turn towards where you're holding (at most 320°/s) and cruise; let go and you
  // slow down. When the feather runs out you keep a little of the speed. Dashing ends it early.
  flyUpdate() {
    const p = this.p, inp = this.inp;
    if (this.canDash()) return this.startDash();
    p.flyT -= DT;
    if (p.flyT <= 0) {
      p.vx = Math.max(-C.FlyEndX, Math.min(C.FlyEndX, p.vx));
      p.vy = Math.max(C.FlyEndMinY, Math.min(C.FlyEndMaxY, p.vy));
      this.emit("flyOut", { x: p.x, y: p.y - 6 });
      return ST_NORMAL;
    }
    const steer = inp.mx || inp.my;
    if (steer) {
      const a = this.aim(), want = Math.atan2(a.y, a.x);
      let d = want - p.flyAng;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.flyAng += Math.max(-C.FlyRotate * DT, Math.min(C.FlyRotate * DT, d));
    }
    p.flySpeed = approach(p.flySpeed, steer ? C.FlyTargetSpeed : C.FlySlowSpeed, C.FlyAccel * DT);
    p.vx = Math.cos(p.flyAng) * p.flySpeed;
    p.vy = Math.sin(p.flyAng) * p.flySpeed;
    if (p.vx) p.facing = sign(p.vx);
    return ST_FLY;
  }

  // A bumper throws you straight away from its centre (snapped to up or sideways when
  // close), refilling your dash, like Celeste's ExplodeLaunch.
  bump(b) {
    const p = this.p;
    let dx = p.x - b.x, dy = p.y - 5.5 - b.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) { dx = 0; dy = -1; } else { dx /= len; dy /= len; }
    if (dy <= -0.7) { dx = 0; dy = -1; }
    else if (dy <= 0.65 && dy >= -0.55) { dy = 0; dx = sign(dx) || 1; }
    p.vx = C.BumperSpeed * dx; p.vy = C.BumperSpeed * dy;
    if (p.vy <= 50) { p.vy = Math.min(-150, p.vy); p.autoJump = true; }
    if (p.vx && this.inp.mx === sign(p.vx)) p.vx *= 1.2;
    if (p.state !== ST_NORMAL) p.state = ST_NORMAL;
    p.varJumpTimer = 0;
    p.dashes = Math.max(p.dashes, this.room.dashes);
    p.stamina = C.ClimbMaxStamina;
    p.dashCooldown = 0.2;
    p.launchT = C.LaunchHold;
    this.freeze = C.RefillFreeze;
    b.respawn = C.BumperRespawn;
    this.emit("bump", { x: b.x, y: b.y });
  }

  redEnd() {
    const p = this.p;
    p.state = ST_NORMAL;
    if (p.vy < 0) p.vy *= C.EndDashUpMult;
    this.emit("redEnd", { x: p.x, y: p.y - 6 });
  }

  normalUpdate() {
    const p = this.p, inp = this.inp, moveX = this.moveX;

    // Grab a wall
    if (inp.grab && !this.isTired() && !p.ducking && p.vy >= 0 && sign(p.vx) !== -p.facing && this.climbCheck(p.facing)) {
      p.ducking = false;
      return ST_CLIMB;
    }
    if (this.canDash()) return this.startDash();

    // Ducking
    if (p.ducking) {
      if (p.onGround && inp.my !== 1 && this.canUnDuck()) p.ducking = false;
    } else if (p.onGround && inp.my === 1 && p.vy >= 0) {
      p.ducking = true;
      this.squash(1.4, 0.6);
    }

    // Running: over max speed and still holding that way, bleed speed off slowly (RunReduce);
    // otherwise approach the target speed quickly. This is what lets supers and hypers carry.
    if (p.ducking && p.onGround) {
      p.vx = approach(p.vx, 0, C.DuckFriction * DT);
    } else {
      const mult = p.onGround ? 1 : C.AirMult;
      // Just after a bumper launch, keep the speed unless you steer against it.
      if (p.launchT > 0 && moveX !== -sign(p.vx)) { /* hold */ }
      else if (Math.abs(p.vx) > C.MaxRun && sign(p.vx) === moveX) p.vx = approach(p.vx, C.MaxRun * moveX, C.RunReduce * mult * DT);
      else p.vx = approach(p.vx, C.MaxRun * moveX, C.RunAccel * mult * DT);
    }

    // Falling, fast-falling and wall sliding
    if (inp.my === 1 && p.vy >= C.MaxFall) p.maxFall = approach(p.maxFall, C.FastMaxFall, C.FastMaxAccel * DT);
    else p.maxFall = approach(p.maxFall, C.MaxFall, C.FastMaxAccel * DT);
    if (!p.onGround) {
      let max = p.maxFall;
      if ((moveX === p.facing || (moveX === 0 && inp.grab)) && inp.my !== 1) {
        if (p.vy >= 0 && p.wallSlideTimer > 0 && this.boundsCheck(p.facing, 1) && this.collideAt(p.x + p.facing, p.y) && this.canUnDuck()) {
          p.ducking = false;
          p.wallSlideDir = p.facing;
        }
        if (p.wallSlideDir !== 0) max = lerp(C.MaxFall, C.WallSlideStartMax, p.wallSlideTimer / C.WallSlideTime);
      }
      // Half gravity at the top of a held jump: the floaty apex.
      const mult = Math.abs(p.vy) < C.HalfGravThreshold && (inp.jump || p.autoJump) ? 0.5 : 1;
      p.vy = approach(p.vy, max, C.Gravity * mult * DT);
    }

    // Variable jump height: holding jump keeps the launch speed for up to 0.2 s.
    if (p.varJumpTimer > 0) {
      if (p.autoJump || inp.jump) p.vy = Math.min(p.vy, p.varJumpSpeed);
      else p.varJumpTimer = 0;
    }

    // Jumping (coyote time comes from jumpGrace), then wall jumps and climb jumps.
    if (this.jumpBuf > 0) {
      if (p.jumpGrace > 0) this.jump();
      else if (this.canUnDuck()) {
        if (this.wallJumpCheck(1)) {
          if (p.facing === 1 && inp.grab && p.stamina > 0) this.climbJump(); else this.wallJump(-1);
        } else if (this.wallJumpCheck(-1)) {
          if (p.facing === -1 && inp.grab && p.stamina > 0) this.climbJump(); else this.wallJump(1);
        }
      }
    }
    return ST_NORMAL;
  }

  climbBegin() {
    const p = this.p;
    p.autoJump = false;
    p.vx = 0;
    p.vy *= C.ClimbGrabYMult;
    p.wallSlideTimer = C.WallSlideTime;
    p.climbNoMoveTimer = C.ClimbNoMoveTime;
    p.wallBoostTimer = 0;
    p.lastClimbMove = 0;
    for (let i = 0; i < C.ClimbCheckDist; i++) {
      if (!this.collideAt(p.x + p.facing, p.y)) p.x += p.facing; else break;
    }
    this.emit("grab", { x: p.x + p.facing * 4, y: p.y - 6 });
  }

  climbHop() {
    const p = this.p;
    if (this.collideAt(p.x + p.facing, p.y)) { p.hopWaitX = p.facing; p.hopWaitXSpeed = p.facing * C.ClimbHopX; }
    else { p.hopWaitX = 0; p.vx = p.facing * C.ClimbHopX; }
    p.vy = Math.min(p.vy, C.ClimbHopY);
    p.forceMoveX = 0;
    p.forceMoveXTimer = C.ClimbHopForceTime;
  }

  climbUpdate() {
    const p = this.p, inp = this.inp;
    p.climbNoMoveTimer -= DT;
    if (p.onGround) p.stamina = C.ClimbMaxStamina;

    if (this.jumpBuf > 0 && this.canUnDuck()) {
      if (this.moveX === -p.facing) this.wallJump(-p.facing); else this.climbJump();
      return ST_NORMAL;
    }
    if (this.canDash()) return this.startDash();
    if (!inp.grab) return ST_NORMAL;

    // The wall ended: climbing up over the top hops you onto it.
    if (!this.collideAt(p.x + p.facing, p.y)) {
      if (p.vy < 0) this.climbHop();
      return ST_NORMAL;
    }

    let target = 0, trySlip = false;
    if (p.climbNoMoveTimer <= 0) {
      if (inp.my === -1) {
        target = C.ClimbUpSpeed;
        if (this.collideAt(p.x, p.y - 1)) {
          if (p.vy < 0) p.vy = 0;
          target = 0; trySlip = true;
        } else if (this.slipCheck()) {
          this.climbHop();
          return ST_NORMAL;
        }
      } else if (inp.my === 1) {
        target = C.ClimbDownSpeed;
        if (p.onGround) { if (p.vy > 0) p.vy = 0; target = 0; }
      } else {
        trySlip = true;
      }
    } else {
      trySlip = true;
    }
    p.lastClimbMove = sign(target);
    // Hanging with your hands above the top slowly slips you down.
    if (trySlip && this.slipCheck()) target = C.ClimbSlipSpeed;
    p.vy = approach(p.vy, target, C.ClimbAccel * DT);
    if (inp.my !== 1 && p.vy > 0 && !this.collideAt(p.x + p.facing, p.y + 1)) p.vy = 0;

    if (p.climbNoMoveTimer <= 0) {
      if (p.lastClimbMove === -1) p.stamina -= C.ClimbUpCost * DT;
      else if (p.lastClimbMove === 0) p.stamina -= C.ClimbStillCost * DT;
    }
    if (p.stamina <= 0) return ST_NORMAL;
    return ST_CLIMB;
  }

  dashBegin() {
    const p = this.p;
    this.freeze = C.DashFreeze;
    p.dashCooldown = C.DashCooldown;
    p.dashRefillCooldown = C.DashRefillCooldown;
    p.wallSlideTimer = C.WallSlideTime;
    p.beforeDashX = p.vx; p.beforeDashY = p.vy;
    p.vx = 0; p.vy = 0;
    p.dashDirX = 0; p.dashDirY = 0;
    p.dashAttackT = C.DashAttackTime;
    if (!p.onGround && p.ducking && this.canUnDuck()) p.ducking = false;
    p.dashPhase = 0;
  }

  // ------------------------------------------------------------------ dream blocks

  // A dash (or the moment just after one) that bumps a dream block in the direction you
  // dashed takes you inside. If the block's edge is lined with rock, it nudges you up to
  // 4 px onto the dream block, like Celeste's DreamDashCheck.
  dreamDashCheck(dx, dy) {
    const p = this.p;
    if (p.dashAttackT <= 0 || (p.state !== ST_DASH && p.state !== ST_NORMAL)) return false;
    if (!((dx !== 0 && dx === sign(p.dashDirX)) || (dy !== 0 && dy === sign(p.dashDirY)))) return false;
    const nx = p.x + dx, ny = p.y + dy;
    if (!this.dreamAt(nx, ny)) return false;
    if (!this.solidNoDreamAt(nx, ny)) return true;
    for (let i = 1; i <= 4; i++) {
      for (const s of [-1, 1]) {
        const ox = dx ? 0 : i * s, oy = dx ? i * s : 0;
        if (this.dreamAt(nx + ox, ny + oy) && !this.solidNoDreamAt(nx + ox, ny + oy)) { p.x += ox; p.y += oy; return true; }
      }
    }
    return false;
  }

  dreamBegin() {
    const p = this.p;
    p.vx = p.dashDirX * C.DreamDashSpeed;
    p.vy = p.dashDirY * C.DreamDashSpeed;
    p.rx = 0; p.ry = 0;
    p.stamina = C.ClimbMaxStamina;
    p.dreamT = C.DreamDashMinTime;
    p.dashAttackT = 0;
    this.emit("dreamIn", { x: p.x, y: p.y - 6 });
  }

  // Inside a dream block you fly straight at dash speed, ignoring everything. Coming out
  // refills your dash; press jump as you leave for a jump. Coming out into rock is fatal.
  dreamUpdate() {
    const p = this.p;
    p.rx += p.vx * DT; p.ry += p.vy * DT;
    const mx = roundEven(p.rx), my = roundEven(p.ry);
    p.rx -= mx; p.ry -= my;
    p.x += mx; p.y += my;
    p.dreamT -= DT;
    if (this.dreamAt(p.x, p.y)) return ST_DREAM;
    if (this.solidNoDreamAt(p.x, p.y)) {
      if (this.assist.invincible) {
        // Assist: bounce back the way you came instead.
        p.vx = -p.vx; p.vy = -p.vy; p.dashDirX = -p.dashDirX; p.dashDirY = -p.dashDirY;
        return ST_DREAM;
      }
      this.die();
      return ST_DEAD;
    }
    if (p.dreamT > 0) return ST_DREAM;
    this.freeze = C.RefillFreeze;
    p.dashes = Math.max(p.dashes, this.room.dashes);
    p.flash = 0.1;
    this.emit("dreamOut", { x: p.x, y: p.y - 6 });
    if (this.jumpBuf > 0 && p.dashDirX !== 0) this.jump();
    else p.autoJump = true;
    // Holding grab toward a wall as you come out catches it.
    if (this.inp.grab && this.moveX !== 0 && this.climbCheck(this.moveX)) { p.facing = this.moveX; return ST_CLIMB; }
    return ST_NORMAL;
  }

  dashUpdate() {
    const p = this.p;
    if (p.dashDirY === 0 && this.canUnDuck() && this.jumpBuf > 0 && p.jumpGrace > 0) {
      this.superJump();
      return ST_NORMAL;
    }
    if (this.jumpBuf > 0 && this.canUnDuck()) {
      const up = p.dashDirX === 0 && p.dashDirY === -1;
      if (this.wallJumpCheck(1)) { if (up) this.superWallJump(-1); else this.wallJump(-1); return ST_NORMAL; }
      if (this.wallJumpCheck(-1)) { if (up) this.superWallJump(1); else this.wallJump(1); return ST_NORMAL; }
    }
    return ST_DASH;
  }

  // Celeste's dash coroutine: one frame of nothing, then the dash speed for DashTime, then
  // the dash settles to EndDashSpeed (less when going up).
  dashRoutine() {
    const p = this.p;
    if (p.dashPhase === 0) { p.dashPhase = 1; return; }
    if (p.dashPhase === 1) {
      const a = this.aim();
      let nx = a.x * C.DashSpeed;
      const ny = a.y * C.DashSpeed;
      if (sign(p.beforeDashX) === sign(nx) && Math.abs(p.beforeDashX) > Math.abs(nx)) nx = p.beforeDashX;
      p.vx = nx; p.vy = ny;
      p.dashDirX = a.x; p.dashDirY = a.y;
      if (p.dashDirX !== 0) p.facing = sign(p.dashDirX);
      p.dashWait = C.DashTime;
      p.dashPhase = 2;
      this.squash(1 + Math.abs(a.x) * 0.4 - Math.abs(a.y) * 0.3, 1 + Math.abs(a.y) * 0.4 - Math.abs(a.x) * 0.3);
      this.emit("dash", { x: p.x, y: p.y - 6, dx: a.x, dy: a.y });
      return;
    }
    if (p.dashWait > 0) { p.dashWait -= DT; return; }
    if (p.dashDirY <= 0) { p.vx = p.dashDirX * C.EndDashSpeed; p.vy = p.dashDirY * C.EndDashSpeed; }
    if (p.vy < 0) p.vy *= C.EndDashUpMult;
    p.state = ST_NORMAL;
  }

  // ------------------------------------------------------------------ frame

  // inp: { mx, my (-1/0/1), jump (held), jumpPressed, dashPressed, grab (held) }
  step(inp) {
    this.inp = inp;
    // Input buffers keep a press alive for 0.08 s, even through freeze frames.
    if (inp.jumpPressed) this.jumpBuf = C.JumpBuffer; else if (this.jumpBuf > 0) this.jumpBuf -= DT;
    if (inp.dashPressed) this.dashBuf = C.DashBuffer; else if (this.dashBuf > 0) this.dashBuf -= DT;
    if (this.freeze > 0) { this.freeze -= DT; return; }
    if (this.done) return;
    if (this.transition) {
      this.transition.t += DT;
      if (this.transition.t >= C.TransitionTime) this.transition = null;
      return;
    }
    this.time += DT;
    const p = this.p;
    if (p.state === ST_DEAD) {
      p.deadT -= DT;
      if (p.deadT <= 0) this.respawn();
      return;
    }
    if (p.state === ST_RESPAWN) {
      p.respawnT -= DT;
      if (p.respawnT <= 0) p.state = ST_NORMAL;
      return;
    }
    this.updateObjects();
    if (p.state === ST_DEAD) return;     // crushed by a zip mover
    this.updatePlayer();
    if (p.state === ST_DEAD) return;
    this.interact();
    if (p.state === ST_DEAD || this.done) return;
    this.checkBounds();
    if (this.assist.infiniteStamina) p.stamina = C.ClimbMaxStamina;
    if (this.assist.airDashes === "infinite" && p.state !== ST_DASH) p.dashes = Math.max(p.dashes, this.room.dashes);
  }

  updatePlayer() {
    const p = this.p, inp = this.inp;
    if (inp.mx || inp.my || inp.jump || inp.jumpPressed || inp.dashPressed || inp.grab) p.justRespawned = false;
    p.flash = Math.max(0, p.flash - DT);
    p.sx = approach(p.sx, 1, 1.75 * DT);
    p.sy = approach(p.sy, 1, 1.75 * DT);

    p.onGround = p.vy >= 0 && (this.collideAt(p.x, p.y + 1) || this.jumpThruAt(p.x, p.y));
    if (p.onGround) {
      p.jumpGrace = C.JumpGraceTime;
      if (p.state !== ST_CLIMB) { p.autoJump = false; p.stamina = C.ClimbMaxStamina; p.wallSlideTimer = C.WallSlideTime; }
    } else if (p.jumpGrace > 0) {
      p.jumpGrace -= DT;
    }
    if (p.dashRefillCooldown > 0) p.dashRefillCooldown -= DT;
    else if (p.onGround && p.dashes < this.room.dashes) { p.dashes = this.room.dashes; p.flash = 0.1; }
    if (p.varJumpTimer > 0) p.varJumpTimer -= DT;
    if (p.dashCooldown > 0) p.dashCooldown -= DT;
    if (p.dashAttackT > 0) p.dashAttackT -= DT;
    if (p.liftT > 0 && (p.liftT -= DT) <= 0) { p.liftX = 0; p.liftY = 0; }

    if (p.forceMoveXTimer > 0) { p.forceMoveXTimer -= DT; this.moveX = p.forceMoveX; }
    else this.moveX = inp.mx;

    if (p.wallBoostTimer > 0) {
      p.wallBoostTimer -= DT;
      if (this.moveX === p.wallBoostDir) {
        p.vx = C.WallJumpHSpeed * this.moveX;
        p.stamina += C.ClimbJumpCost;
        p.wallBoostTimer = 0;
      }
    }
    if (p.hopWaitX !== 0) {
      if (sign(p.vx) === -p.hopWaitX || p.vy > 0) p.hopWaitX = 0;
      else if (!this.collideAt(p.x + p.hopWaitX, p.y)) { p.vx = p.hopWaitXSpeed; p.hopWaitX = 0; }
    }
    if (p.wallSpeedRetentionTimer > 0) {
      if (sign(p.vx) === -sign(p.wallSpeedRetained)) p.wallSpeedRetentionTimer = 0;
      else if (!this.collideAt(p.x + sign(p.wallSpeedRetained), p.y)) { p.vx = p.wallSpeedRetained; p.wallSpeedRetentionTimer = 0; }
      else p.wallSpeedRetentionTimer -= DT;
    }
    if (p.wallSlideDir !== 0) { p.wallSlideTimer = Math.max(p.wallSlideTimer - DT, 0); p.wallSlideDir = 0; }
    if (this.moveX !== 0 && p.state !== ST_CLIMB && p.state !== ST_DREAM) p.facing = this.moveX;

    if (p.boostCd > 0) p.boostCd -= DT;
    if (p.launchT > 0) p.launchT -= DT;
    if (p.state === ST_FLY) {
      const ns = this.flyUpdate();
      if (ns === ST_FLY) {
        this.moveH(p.vx * DT);
        this.moveV(p.vy * DT);
        return;
      }
      this.setState(ns);
      if (p.state === ST_DASH) { this.dashRoutine(); this.moveH(p.vx * DT); this.moveV(p.vy * DT); return; }
    }
    if (p.state === ST_DREAM) {
      const ns = this.dreamUpdate();
      if (ns !== ST_DEAD) this.setState(ns);
      return;
    }
    if (p.state === ST_BOOST) {
      this.boostUpdate();
      if (p.state === ST_BOOST) return;
      if (p.state === ST_DASH) { this.dashRoutine(); return; }
    }
    if (p.state === ST_RED) {
      // A red bubble's fling goes straight until it hits something; you can dash out of it.
      if (this.canDash()) { this.setState(this.startDash()); }
      else {
        this.moveH(p.vx * DT);
        if (p.state === ST_RED) this.moveV(p.vy * DT);
        return;
      }
    }
    const before = p.state;
    let ns;
    if (p.state === ST_NORMAL) ns = this.normalUpdate();
    else if (p.state === ST_CLIMB) ns = this.climbUpdate();
    else ns = this.dashUpdate();
    this.setState(ns);
    if (p.state === ST_DASH) this.dashRoutine();
    if (before === ST_CLIMB && p.state !== ST_CLIMB) this.emit("letGo", {});

    this.moveH(p.vx * DT);
    if (p.state === ST_DREAM) return;
    this.moveV(p.vy * DT);
    if (p.state === ST_DREAM) return;
    this.windMove();
  }

  // Wind pushes you along without changing your speed (like Celeste's WindMover). It can't
  // push you off a wall you're backed against, doesn't move you while climbing, and ducking
  // on the ground holds you in place.
  windMove() {
    const p = this.p, w = this.room.wind;
    if (!w || p.state === ST_CLIMB || p.justRespawned) return;
    const dir = Math.sign(w);
    if (this.collideAt(p.x - dir * 3, p.y)) return;
    let amt = w * DT;
    if (p.ducking && p.onGround) amt = 0;
    p.rx += amt;
    let m = roundEven(p.rx);
    p.rx -= m;
    const s = sign(m);
    while (m !== 0) {
      if (this.collideAt(p.x + s, p.y)) { p.rx = 0; break; }
      p.x += s;
      m -= s;
    }
  }

  // ------------------------------------------------------------------ level objects

  resetRoomObjects(room) {
    if (room.water) { room.water.y = room.water.base; room.water.t = 0; }
    for (const f of room.feathers) f.respawn = 0;
    for (const b of room.bumpers) b.respawn = 0;
    for (const r of room.refills) r.respawn = 0;
    for (const c of room.crumbles) { c.state = 0; c.t = 0; }
    for (const s of room.springs) s.t = 0;
    for (const z of room.zips) { z.x = z.fx = z.sx; z.y = z.fy = z.sy; z.state = 0; z.t = 0; z.at = 0; }
    for (const m of room.moves) { m.x = m.fx = m.sx; m.y = m.fy = m.sy; m.state = 0; m.t = 0; m.speed = 0; m.gone = false; }
    for (const m of room.swaps) { m.x = m.fx = m.sx; m.y = m.fy = m.sy; m.target = 0; m.speed = 0; }
    for (const c of room.clouds) { c.y = c.by; c.d = 0; c.v = 0; c.was = false; c.gone = false; c.t = 0; }
    for (const bo of room.boosters) bo.respawn = 0;
    // Switches stay pressed once the gate has opened; before that, dying resets them.
    if (!room.gateOpen) for (const s of room.switches) s.on = false;
    for (const b of room.berries) if (b.state === 3) b.state = 0;
  }

  syncBerries() {
    for (const room of this.rooms) {
      for (const b of room.berries) {
        b.ghost = this.collected.has(b.id);
        if (b.state === 1) continue;
        b.state = 0; b.x = b.hx; b.y = b.hy;
      }
    }
  }

  // ------------------------------------------------------------------ zip movers

  // Standing on it, or climbing its side.
  ridingZip(z) {
    const p = this.p;
    if (p.state === ST_DEAD || p.state === ST_RESPAWN || p.state === ST_DREAM) return false;
    const b = this.box(), l = p.x + b.l, t = p.y + b.t;
    if (p.y === z.y && l < z.x + z.w && z.x < l + b.w) return true;
    if (p.state === ST_CLIMB) {
      const wl = l + p.facing;
      return wl < z.x + z.w && z.x < wl + b.w && t < z.y + z.h && z.y < t + b.h;
    }
    return false;
  }

  updateMovers() {
    this.updateZips();
    const p = this.p;
    const w = this.room.water;
    if (w && w.speed && !p.justRespawned) {
      if (w.t < w.delay) w.t += DT;
      else w.y = Math.max(this.room.y - 16, w.y - w.speed * DT);
    }
    for (const m of this.room.moves) {
      if (m.state === 0) {
        if (this.ridingZip(m)) { m.state = 1; m.t = C.MoveShake; m.speed = 0; this.emit("moveStart", { x: m.x + m.w / 2, y: m.y + m.h / 2 }); }
      } else if (m.state === 1) {
        if (m.t > 0) { m.t -= DT; continue; }
        m.speed = approach(m.speed, C.MoveSpeed, C.MoveAccel * DT);
        const [dx, dy] = DIRV[m.dir];
        const nfx = m.fx + dx * m.speed * DT, nfy = m.fy + dy * m.speed * DT;
        this.ignoreSolid = m;
        const hit = this.collideRect(Math.round(nfx), Math.round(nfy), m.w, m.h);
        this.ignoreSolid = null;
        if (hit) {
          m.state = 2; m.gone = true; m.t = C.MoveRespawn;
          this.emit("moveBreak", { x: m.x, y: m.y, w: m.w, h: m.h });
        } else this.moveZipTo(m, nfx, nfy);
      } else if ((m.t -= DT) <= 0 && !overlap(this.hitbox(), { x: m.sx, y: m.sy, w: m.w, h: m.h })) {
        m.x = m.fx = m.sx; m.y = m.fy = m.sy; m.state = 0; m.gone = false; m.speed = 0;
        this.emit("moveBack", { x: m.x, y: m.y, w: m.w, h: m.h });
      }
    }
    for (const m of this.room.swaps) {
      const tx = m.target ? m.ex : m.sx, ty = m.target ? m.ey : m.sy;
      const dist = Math.hypot(tx - m.fx, ty - m.fy);
      if (dist === 0) continue;
      m.speed = approach(m.speed, C.SwapSpeed, C.SwapAccel * DT);
      const step = Math.min(dist, m.speed * DT);
      this.moveZipTo(m, m.fx + (tx - m.fx) / dist * step, m.fy + (ty - m.fy) / dist * step);
      if (step >= dist) { m.speed = 0; this.emit("swapStop", { x: m.x + m.w / 2, y: m.y + m.h / 2 }); }
    }
    for (const c of this.room.clouds) {
      if (c.gone) {
        if ((c.t -= DT) <= 0 && !overlap(this.hitbox(), { x: c.x, y: c.by - 4, w: c.w, h: 10 })) {
          c.gone = false; c.d = 0; c.v = 0; c.y = c.by; c.was = false;
          this.emit("cloudBack", { x: c.x + c.w / 2, y: c.y });
        }
        continue;
      }
      const riding = p.state !== ST_DEAD && p.state !== ST_RESPAWN && p.state !== ST_DREAM && p.vy >= 0 &&
        p.y === c.y && p.x + 4 > c.x && p.x - 4 < c.x + c.w;
      if (riding && !c.was) c.v = Math.max(c.v, C.CloudLand);
      if (!riding && c.was && c.fragile) {
        c.gone = true; c.t = C.CloudRespawn; c.was = false;
        this.emit("cloudBreak", { x: c.x, y: c.y, w: c.w });
        continue;
      }
      c.was = riding;
      c.v += (-(c.d - (riding ? C.CloudSink : 0)) * C.CloudSpring - c.v * C.CloudDamp) * DT;
      c.d += c.v * DT;
      const ny = c.by + Math.round(c.d), dy = ny - c.y;
      if (!dy) continue;
      c.y = ny;
      if (riding) {
        this.shove(0, dy, false);
        p.liftX = 0; p.liftY = c.v; p.liftT = C.LiftSpeedGraceTime;
      }
    }
  }

  updateZips() {
    for (const z of this.room.zips) {
      if (z.state === 0) {
        if (this.ridingZip(z)) { z.state = 1; z.t = C.ZipShake; this.emit("zipStart", { x: z.x + z.w / 2, y: z.y + z.h / 2 }); }
      } else if (z.state === 1) {
        if ((z.t -= DT) <= 0) { z.state = 2; z.at = 0; }
      } else if (z.state === 2) {
        z.at = approach(z.at, 1, C.ZipOutRate * DT);
        const k = sineIn(z.at);
        this.moveZipTo(z, lerp(z.sx, z.ex, k), lerp(z.sy, z.ey, k));
        if (z.at >= 1) { z.state = 3; z.t = C.ZipEndWait; this.emit("zipStop", { x: z.x + z.w / 2, y: z.y + z.h / 2 }); }
      } else if (z.state === 3) {
        if ((z.t -= DT) <= 0) { z.state = 4; z.at = 0; }
      } else if (z.state === 4) {
        z.at = approach(z.at, 1, C.ZipBackRate * DT);
        const k = sineIn(z.at);
        this.moveZipTo(z, lerp(z.ex, z.sx, k), lerp(z.ey, z.sy, k));
        if (z.at >= 1) { z.state = 5; z.t = C.ZipStartWait; }
      } else if ((z.t -= DT) <= 0) {
        z.state = 0;
      }
    }
  }

  moveZipTo(z, fx, fy) {
    const lx = (fx - z.fx) / DT, ly = (fy - z.fy) / DT;
    z.fx = fx; z.fy = fy;
    const dx = Math.round(fx) - z.x, dy = Math.round(fy) - z.y;
    if (dx) this.moveSolid(z, dx, 0, lx, ly);
    if (dy) this.moveSolid(z, 0, dy, lx, ly);
  }

  // Move a solid block along one axis (Celeste's Solid.MoveHExact / MoveVExact): anything it
  // runs into is shoved out of the way and crushed if there's no room; anything riding it
  // comes along. Either way you pick up its speed for your next jump.
  moveSolid(z, dx, dy, lx, ly) {
    const p = this.p;
    const riding = this.ridingZip(z);
    z.x += dx; z.y += dy;
    if (p.state === ST_DEAD || p.state === ST_RESPAWN || p.state === ST_DREAM) return;
    this.ignoreSolid = z;
    const hb = this.hitbox();
    let moved = false;
    if (overlap(hb, z)) {
      const amt = dx > 0 ? z.x + z.w - hb.x : dx < 0 ? z.x - (hb.x + hb.w) : dy > 0 ? z.y + z.h - hb.y : z.y - (hb.y + hb.h);
      if (!this.shove(dx ? amt : 0, dy ? amt : 0, true)) { this.ignoreSolid = null; this.die(); return; }
      moved = true;
    } else if (riding) {
      this.shove(dx, dy, false);
      moved = true;
    }
    this.ignoreSolid = null;
    if (moved) { p.liftX = lx; p.liftY = ly; p.liftT = C.LiftSpeedGraceTime; }
  }

  // Move the climber a whole number of pixels. Returns false if a wall stops a push that
  // mustn't be stopped (a squish) and there's no small wiggle out of it.
  shove(dx, dy, squish) {
    const p = this.p;
    for (const [amt, ax] of [[dx, 1], [dy, 0]]) {
      const s = sign(amt);
      for (let m = amt; m !== 0; m -= s) {
        const nx = p.x + (ax ? s : 0), ny = p.y + (ax ? 0 : s);
        if (this.collideAt(nx, ny)) {
          if (!squish) break;
          this.ignoreSolid = null;
          return this.wiggle();
        }
        p.x = nx; p.y = ny;
      }
      if (ax && s) p.rx = 0;
      if (!ax && s) p.ry = 0;
    }
    return true;
  }

  wiggle() {
    const p = this.p;
    for (let d = 1; d <= 3; d++) {
      for (const [ox, oy] of [[0, -d], [d, 0], [-d, 0], [0, d]]) {
        if (!this.collideAt(p.x + ox, p.y + oy)) { p.x += ox; p.y += oy; return true; }
      }
    }
    return false;
  }

  updateObjects() {
    this.updateMovers();
    const room = this.room, p = this.p;
    if (p.state === ST_DEAD) return;
    for (const r of room.refills) if (r.respawn > 0 && (r.respawn -= DT) <= 0) this.emit("refillBack", { x: r.x, y: r.y });
    for (const s of room.springs) if (s.t > 0) s.t -= DT;
    const hb = this.hitbox();
    for (const c of room.crumbles) {
      if (c.state === 0) {
        const onTop = p.onGround && p.y === c.y && p.x + 4 > c.x && p.x - 4 < c.x + c.w;
        // Holding onto its side counts too: probe the column of pixels just past your hand.
        const wx = p.facing > 0 ? p.x + 4 : p.x - 5;
        const climbing = p.state === ST_CLIMB && wx >= c.x && wx < c.x + c.w && p.y - 11 < c.y + c.h && p.y > c.y;
        if (onTop || climbing) { c.state = 1; c.t = C.CrumbleDelay; this.emit("crumble", { x: c.x + c.w / 2, y: c.y }); }
      } else if (c.state === 1) {
        if ((c.t -= DT) <= 0) { c.state = 2; c.t = C.CrumbleRespawn; this.emit("crumbled", { x: c.x, y: c.y, w: c.w }); }
      } else if ((c.t -= DT) <= 0 && !overlap(hb, c)) {
        c.state = 0; c.t = 0;
      }
    }
    // The climber's trail, for strawberries following along behind.
    this.trail.unshift({ x: p.x, y: p.y - 6 });
    if (this.trail.length > 90) this.trail.pop();
  }

  interact() {
    const p = this.p, room = this.room, hb = this.hitbox();

    // Spikes kill only when you move into them.
    if (!this.assist.invincible) {
      const hurt = p.ducking ? HURT.duck : HURT.normal;
      const hl = p.x + hurt.l, ht = p.y + hurt.t;
      const x0 = Math.floor(hl / TILE), x1 = Math.floor((hl + hurt.w - 1) / TILE);
      const y0 = Math.floor(ht / TILE), y1 = Math.floor((ht + hurt.h - 1) / TILE);
      const hr = { x: hl, y: ht, w: hurt.w, h: hurt.h };
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const c = this.tileAt(gx, gy);
        if (!c || !"^v<>".includes(c)) continue;
        const X = gx * TILE, Y = gy * TILE;
        let r, into;
        if (c === "^") { r = { x: X, y: Y + 5, w: 8, h: 3 }; into = p.vy >= 0; }
        else if (c === "v") { r = { x: X, y: Y, w: 8, h: 3 }; into = p.vy <= 0; }
        else if (c === ">") { r = { x: X, y: Y, w: 3, h: 8 }; into = p.vx <= 0; }
        else { r = { x: X + 5, y: Y, w: 3, h: 8 }; into = p.vx >= 0; }
        if (into && overlap(hr, r)) { this.die(); return; }
      }
    }

    for (const s of room.springs) {
      const r = { x: s.x, y: s.y + 2, w: 8, h: 6 };
      if (p.vy >= 0 && overlap(hb, r)) {
        this.superBounce(s.y + 2);
        s.t = 0.25;
        this.emit("spring", { x: s.x + 4, y: s.y + 2 });
      }
    }

    for (const r of room.refills) {
      if (r.respawn > 0) continue;
      const rr = { x: r.x - 4, y: r.y - 4, w: 8, h: 8 };
      const max = r.two ? 2 : this.room.dashes;
      if (overlap(hb, rr) && (p.dashes < max || p.stamina < C.ClimbTiredThreshold)) {
        p.dashes = Math.max(p.dashes, max);
        p.stamina = C.ClimbMaxStamina;
        p.flash = 0.2;
        r.respawn = C.RefillRespawn;
        this.freeze = C.RefillFreeze;
        this.emit("refill", { x: r.x, y: r.y, two: r.two });
      }
    }

    // Strawberries: touch one and it follows you; it only counts once you stand on safe
    // ground. Die first and it flies home.
    for (const b of room.berries) {
      if (b.state !== 0) continue;
      if (overlap(hb, { x: b.hx - 5, y: b.hy - 5, w: 10, h: 10 })) {
        b.state = 1;
        this.emit("berryTouch", { x: b.hx, y: b.hy, ghost: b.ghost });
      }
    }
    for (const f of room.feathers) {
      if (f.respawn > 0) { f.respawn -= DT; continue; }
      if (p.state !== ST_DREAM && overlap(hb, { x: f.x - 6, y: f.y - 6, w: 12, h: 12 })) { f.respawn = C.FeatherRespawn; this.enterFly(); }
    }
    for (const b of room.bumpers) {
      if (b.respawn > 0) { b.respawn -= DT; continue; }
      if (p.state !== ST_DREAM && p.state !== ST_BOOST && overlap(hb, { x: b.x - 8, y: b.y - 8, w: 16, h: 16 })) { this.bump(b); break; }
    }
    if (room.water && !this.assist.invincible && p.y - 3 > room.water.y) { this.die(); return; }

    for (const bo of room.boosters) {
      if (bo.respawn > 0) { if (p.state !== ST_BOOST || p.booster !== bo) bo.respawn -= DT; continue; }
      if (p.state === ST_BOOST || p.state === ST_RED || p.boostCd > 0) continue;
      if (overlap(hb, { x: bo.x - 7, y: bo.y - 7, w: 14, h: 14 })) { this.enterBoost(bo); break; }
    }

    for (const s of room.switches) {
      if (s.on || !overlap(hb, { x: s.x, y: s.y, w: TILE, h: TILE })) continue;
      s.on = true;
      const left = room.switches.filter((o) => !o.on).length;
      this.emit("switch", { x: s.x + 4, y: s.y + 4, left });
      if (!left && room.hasGate) { room.gateOpen = true; this.emit("gate", {}); }
    }

    const following = this.following();
    const safe = p.onGround && p.state !== ST_DASH && !this.onCrumble();
    this.berryChainT = Math.max(0, this.berryChainT - DT);
    if (!this.berryChainT) this.berryChain = 0;
    if (following.length && safe) {
      p.safeT += DT;
      if (p.safeT >= C.BerryCollectDelay) {
        const b = following[0];
        b.state = 2;
        const isNew = !this.collected.has(b.id);
        this.collected.add(b.id);
        this.berryChain++;
        this.berryChainT = 0.6;
        p.safeT = 0;
        this.emit("berry", { x: b.x, y: b.y, id: b.id, chain: this.berryChain, isNew, ghost: b.ghost });
      }
    } else {
      p.safeT = 0;
    }

    for (const it of room.items) {
      if (it.got || !overlap(hb, { x: it.x - 6, y: it.y - 6, w: 12, h: 12 })) continue;
      it.got = true;
      this.emit(it.kind, { x: it.x, y: it.y, ghost: it.ghost });
    }
    const gb = this.golden;
    if (gb && gb.state === 0 && gb.room === room && overlap(hb, { x: gb.hx - 5, y: gb.hy - 5, w: 10, h: 10 })) {
      gb.state = 1;
      this.emit("goldenTouch", { x: gb.hx, y: gb.hy });
    }

    if (room.goal && overlap(hb, room.goal)) {
      this.done = true;
      if (gb && gb.state === 1) { gb.state = 2; this.emit("golden", { x: p.x, y: p.y - 10 }); }
      this.emit("complete", { x: room.goal.x, y: room.goal.y });
    }
  }

  following() {
    const out = [];
    for (const room of this.rooms) for (const b of room.berries) if (b.state === 1) out.push(b);
    return out;
  }

  onCrumble() {
    const p = this.p;
    for (const c of this.room.crumbles) {
      if (c.state !== 2 && p.y === c.y && p.x + 4 > c.x && p.x - 4 < c.x + c.w) return true;
    }
    return false;
  }

  totalBerries() { return this.rooms.reduce((n, r) => n + r.berries.length, 0); }

  // ------------------------------------------------------------------ rooms, death

  checkBounds() {
    const p = this.p, r = this.room;
    const cx = p.x, cy = p.y - 6;
    if (cx >= r.x && cx < r.x + r.pw && cy >= r.y && cy < r.y + r.ph) return;
    const next = this.roomAtPoint(cx, cy);
    if (next && next !== r) { this.enterRoom(next, cy < r.y ? "up" : cy >= r.y + r.ph ? "down" : "side"); return; }
    if (p.y - 11 > r.y + r.ph) {
      if (this.assist.invincible) {
        // Assist: pits bounce you back up instead of killing you.
        p.y = r.y + r.ph;
        this.superBounce(p.y);
        p.vy = -330;
        return;
      }
      this.die();
    }
  }

  enterRoom(next, dir) {
    const p = this.p;
    if (dir === "up") {
      // Moving up into a room gives you a jump's worth of lift so you can reach the ledge.
      p.vx = 0;
      if (p.state === ST_DASH || p.state === ST_RED || p.state === ST_BOOST) p.state = ST_NORMAL;
      p.vy = p.varJumpSpeed = C.JumpSpeed;
      p.autoJump = true;
      p.varJumpTimer = C.VarJumpTime;
      p.dashCooldown = 0.2;
    } else if (dir === "down") {
      if (p.state === ST_DASH || p.state === ST_RED || p.state === ST_BOOST) p.state = ST_NORMAL;
      p.vy = Math.max(0, p.vy);
      p.autoJump = false;
      p.varJumpTimer = 0;
    }
    if (p.state === ST_RED || p.state === ST_BOOST) p.state = ST_NORMAL;
    const from = this.room;
    this.room = next;
    this.resetRoomObjects(next);
    let best = next.spawns[0], bd = Infinity;
    for (const s of next.spawns) {
      const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    this.spawn = best;
    this.transition = { from, to: next, t: 0, dir };
    this.emit("room", { from: from.id, to: next.id, spawn: next.spawns.indexOf(best) });
  }

  die() {
    const p = this.p;
    if (p.state === ST_DEAD) return;
    p.state = ST_DEAD;
    p.deadT = C.DeathTime;
    this.deaths++;
    this.emit("death", { x: p.x, y: p.y - 6, dashes: p.dashes });
    if (this.golden && this.golden.state === 1) this.emit("goldenLost", {});
    for (const b of this.following()) { b.state = 0; b.x = b.hx; b.y = b.hy; }
  }

  respawn() {
    const sp = this.spawn, old = this.p;
    this.resetRoomObjects(this.room);
    const p = this.newPlayer(sp);
    // Face into the room.
    p.facing = sp.x < this.room.x + this.room.pw / 2 ? 1 : -1;
    p.state = ST_RESPAWN;
    p.respawnT = C.RespawnTime;
    this.p = p;
    this.trail.length = 0;
    this.emit("respawn", { x: sp.x, y: sp.y - 6, from: { x: old.x, y: old.y - 6 } });
  }

  // ------------------------------------------------------------------ checker support

  snapshot() {
    const r = this.room;
    return {
      p: Object.assign({}, this.p), room: r, jb: this.jumpBuf, db: this.dashBuf, fr: this.freeze,
      ref: r.refills.map((x) => x.respawn), cr: r.crumbles.map((c) => [c.state, c.t]),
      br: r.berries.map((b) => b.state), done: this.done, tr: this.transition,
      it: r.items.map((i) => i.got),
      zp: r.zips.map((z) => [z.x, z.y, z.fx, z.fy, z.state, z.t, z.at]),
      sw: r.switches.map((s) => s.on), go: r.gateOpen,
      mv: r.moves.map((m) => [m.x, m.y, m.fx, m.fy, m.state, m.t, m.speed, m.gone]),
      sp: r.swaps.map((m) => [m.x, m.y, m.fx, m.fy, m.target, m.speed]),
      cl: r.clouds.map((c) => [c.y, c.d, c.v, c.was, c.gone, c.t]),
      bo: r.boosters.map((b) => b.respawn),
      fe: r.feathers.map((f) => f.respawn), bu: r.bumpers.map((b) => b.respawn),
      wa: r.water ? [r.water.y, r.water.t] : null,
    };
  }

  restore(s) {
    this.p = Object.assign({}, s.p);
    this.room = s.room;
    this.jumpBuf = s.jb; this.dashBuf = s.db; this.freeze = s.fr;
    s.room.refills.forEach((x, i) => { x.respawn = s.ref[i]; });
    s.room.crumbles.forEach((c, i) => { c.state = s.cr[i][0]; c.t = s.cr[i][1]; });
    s.room.berries.forEach((b, i) => { b.state = s.br[i]; });
    s.room.items.forEach((x, i) => { x.got = s.it[i]; });
    s.room.zips.forEach((z, i) => { [z.x, z.y, z.fx, z.fy, z.state, z.t, z.at] = s.zp[i]; });
    s.room.switches.forEach((w, i) => { w.on = s.sw[i]; });
    s.room.gateOpen = s.go;
    s.room.moves.forEach((m, i) => { [m.x, m.y, m.fx, m.fy, m.state, m.t, m.speed, m.gone] = s.mv[i]; });
    s.room.swaps.forEach((m, i) => { [m.x, m.y, m.fx, m.fy, m.target, m.speed] = s.sp[i]; });
    s.room.clouds.forEach((c, i) => { [c.y, c.d, c.v, c.was, c.gone, c.t] = s.cl[i]; });
    s.room.boosters.forEach((b, i) => { b.respawn = s.bo[i]; });
    s.room.feathers.forEach((f, i) => { f.respawn = s.fe[i]; });
    s.room.bumpers.forEach((b, i) => { b.respawn = s.bu[i]; });
    if (s.wa) { s.room.water.y = s.wa[0]; s.room.water.t = s.wa[1]; }
    this.done = s.done;
    this.transition = s.tr;
  }
}

if (typeof module !== "undefined") module.exports = { Game, C, DT, TILE, VIEW_W, VIEW_H, ST_NORMAL, ST_CLIMB, ST_DASH, ST_DEAD, ST_RESPAWN, ST_DREAM, ST_BOOST, ST_RED, ST_FLY, MAX_DASHES, HB };
