"use strict";
// Mount Veil simulation: the climber's physics and every level object. There is no DOM
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
  DeathTime: 0.55, RespawnTime: 0.4, TransitionTime: 0.4,
};

const ST_NORMAL = 0, ST_CLIMB = 1, ST_DASH = 2, ST_DEAD = 3, ST_RESPAWN = 4;

// Hitboxes relative to the climber's feet (bottom centre). The hurtbox is 2 px shorter so
// spikes feel fair.
const HB = { normal: { l: -4, t: -11, w: 8, h: 11 }, duck: { l: -4, t: -6, w: 8, h: 6 } };
const HURT = { normal: { l: -4, t: -11, w: 8, h: 9 }, duck: { l: -4, t: -4, w: 8, h: 4 } };

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const approach = (v, target, amt) => (v < target ? Math.min(v + amt, target) : Math.max(v - amt, target));
const lerp = (a, b, t) => a + (b - a) * t;
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
function buildRoom(def, index) {
  const rows = def.rows, h = rows.length, w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`room ${def.id}: row ${i} is ${r.length} wide, expected ${w}`);
  });
  const x0 = def.x * TILE, y0 = def.y * TILE;
  const room = {
    id: def.id, name: def.name || "", index, tx: def.x, ty: def.y, w, h,
    x: x0, y: y0, pw: w * TILE, ph: h * TILE,
    grid: [], spawns: [], springs: [], refills: [], berries: [], crumbles: [], goal: null,
    crumbleAt: new Int16Array(w * h).fill(-1),
  };
  for (let y = 0; y < h; y++) {
    const row = rows[y].split("");
    for (let x = 0; x < w; x++) {
      const c = row[x], px = x0 + x * TILE, py = y0 + y * TILE;
      if (c === "P") room.spawns.push({ x: px + 4, y: py + TILE });
      else if (c === "s") room.springs.push({ x: px, y: py, t: 0 });
      else if (c === "o") room.refills.push({ x: px + 4, y: py + 4, respawn: 0 });
      else if (c === "*") room.berries.push({ id: `${def.id}:${x},${y}`, hx: px + 4, hy: py + 4, x: px + 4, y: py + 4, state: 0 });
      else if (c === "G") room.goal = { x: px, y: py - TILE, w: TILE, h: TILE * 2 };
      else if (c === "#" || c === "=" || c === "%" || "^v<>".includes(c)) continue;
      else if (c !== ".") throw new Error(`room ${def.id}: unknown tile "${c}" at ${x},${y}`);
      if (c !== "%") row[x] = ".";
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
  if (!room.spawns.length) throw new Error(`room ${def.id} has no respawn point (P)`);
  return room;
}

// ---------------------------------------------------------------------------- the game

class Game {
  // opts: { startRoom, startSpawn, collected: [berry ids], assist, quiet }
  constructor(chapter, opts = {}) {
    this.chapter = chapter;
    this.rooms = chapter.rooms.map(buildRoom);
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
    this.inp = { mx: 0, my: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false };
    this.moveX = 0;
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
      onGround: true, ducking: false, dashes: MAX_DASHES, stamina: C.ClimbMaxStamina,
      jumpGrace: 0, varJumpTimer: 0, varJumpSpeed: 0, autoJump: false, maxFall: C.MaxFall,
      dashCooldown: 0, dashRefillCooldown: 0, dashPhase: 0, dashWait: 0, dashDirX: 0, dashDirY: 0,
      beforeDashX: 0, beforeDashY: 0, forceMoveX: 0, forceMoveXTimer: 0,
      wallSlideTimer: C.WallSlideTime, wallSlideDir: 0, wallSpeedRetained: 0, wallSpeedRetentionTimer: 0,
      wallBoostDir: 0, wallBoostTimer: 0, hopWaitX: 0, hopWaitXSpeed: 0, climbNoMoveTimer: 0, lastClimbMove: 0,
      deadT: 0, respawnT: 0, safeT: 0, sx: 1, sy: 1, flash: 0,
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
    const lx = gx - r.tx, ly = gy - r.ty;
    if (r.grid[ly][lx] === "#") return true;
    const cg = r.crumbleAt[ly * r.w + lx];
    return cg >= 0 && r.crumbles[cg].state !== 2;
  }

  solidPoint(px, py) { return this.solidTile(Math.floor(px / TILE), Math.floor(py / TILE)); }

  collideRect(l, t, w, h) {
    const x0 = Math.floor(l / TILE), x1 = Math.floor((l + w - 1) / TILE);
    const y0 = Math.floor(t / TILE), y1 = Math.floor((t + h - 1) / TILE);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) if (this.solidTile(gx, gy)) return true;
    return false;
  }

  box() { return this.p.ducking ? HB.duck : HB.normal; }
  collideAt(x, y, b = this.box()) { return this.collideRect(x + b.l, y + b.t, b.w, b.h); }

  // A jump-through ledge whose top is exactly at the climber's feet.
  jumpThruAt(x, y) {
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

  // ------------------------------------------------------------------ jumps

  jump() {
    const p = this.p;
    this.jumpBuf = 0;
    p.jumpGrace = 0; p.varJumpTimer = C.VarJumpTime; p.autoJump = false;
    p.wallSlideTimer = C.WallSlideTime; p.wallBoostTimer = 0;
    p.vx += C.JumpHBoost * this.moveX;
    p.vy = C.JumpSpeed;
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
    p.dashes = MAX_DASHES;
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
  }

  startDash() {
    this.p.dashes = Math.max(0, this.p.dashes - 1);
    this.dashBuf = 0;
    return ST_DASH;
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
      if (Math.abs(p.vx) > C.MaxRun && sign(p.vx) === moveX) p.vx = approach(p.vx, C.MaxRun * moveX, C.RunReduce * mult * DT);
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
    if (!p.onGround && p.ducking && this.canUnDuck()) p.ducking = false;
    p.dashPhase = 0;
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
    this.updatePlayer();
    if (p.state === ST_DEAD) return;
    this.interact();
    if (p.state === ST_DEAD || this.done) return;
    this.checkBounds();
    if (this.assist.infiniteStamina) p.stamina = C.ClimbMaxStamina;
    if (this.assist.airDashes === "infinite" && p.state !== ST_DASH) p.dashes = MAX_DASHES;
  }

  updatePlayer() {
    const p = this.p, inp = this.inp;
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
    else if (p.onGround && p.dashes < MAX_DASHES) { p.dashes = MAX_DASHES; p.flash = 0.1; }
    if (p.varJumpTimer > 0) p.varJumpTimer -= DT;
    if (p.dashCooldown > 0) p.dashCooldown -= DT;

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
    if (this.moveX !== 0 && p.state !== ST_CLIMB) p.facing = this.moveX;

    const before = p.state;
    let ns;
    if (p.state === ST_NORMAL) ns = this.normalUpdate();
    else if (p.state === ST_CLIMB) ns = this.climbUpdate();
    else ns = this.dashUpdate();
    this.setState(ns);
    if (p.state === ST_DASH) this.dashRoutine();
    if (before === ST_CLIMB && p.state !== ST_CLIMB) this.emit("letGo", {});

    this.moveH(p.vx * DT);
    this.moveV(p.vy * DT);
  }

  // ------------------------------------------------------------------ level objects

  resetRoomObjects(room) {
    for (const r of room.refills) r.respawn = 0;
    for (const c of room.crumbles) { c.state = 0; c.t = 0; }
    for (const s of room.springs) s.t = 0;
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

  updateObjects() {
    const room = this.room, p = this.p;
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
      if (overlap(hb, rr) && (p.dashes < MAX_DASHES || p.stamina < C.ClimbTiredThreshold)) {
        p.dashes = MAX_DASHES;
        p.stamina = C.ClimbMaxStamina;
        p.flash = 0.2;
        r.respawn = C.RefillRespawn;
        this.freeze = C.RefillFreeze;
        this.emit("refill", { x: r.x, y: r.y });
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

    if (room.goal && overlap(hb, room.goal)) {
      this.done = true;
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
      if (p.state === ST_DASH) p.state = ST_NORMAL;
      p.vy = p.varJumpSpeed = C.JumpSpeed;
      p.autoJump = true;
      p.varJumpTimer = C.VarJumpTime;
      p.dashCooldown = 0.2;
    } else if (dir === "down") {
      if (p.state === ST_DASH) p.state = ST_NORMAL;
      p.vy = Math.max(0, p.vy);
      p.autoJump = false;
      p.varJumpTimer = 0;
    }
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
    };
  }

  restore(s) {
    this.p = Object.assign({}, s.p);
    this.room = s.room;
    this.jumpBuf = s.jb; this.dashBuf = s.db; this.freeze = s.fr;
    s.room.refills.forEach((x, i) => { x.respawn = s.ref[i]; });
    s.room.crumbles.forEach((c, i) => { c.state = s.cr[i][0]; c.t = s.cr[i][1]; });
    s.room.berries.forEach((b, i) => { b.state = s.br[i]; });
    this.done = s.done;
    this.transition = s.tr;
  }
}

if (typeof module !== "undefined") module.exports = { Game, C, DT, TILE, VIEW_W, VIEW_H, ST_NORMAL, ST_CLIMB, ST_DASH, ST_DEAD, ST_RESPAWN, MAX_DASHES, HB };
