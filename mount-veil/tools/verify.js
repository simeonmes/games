"use strict";
// Room checker: proves every room of the chapter can be finished, and every strawberry
// collected, by searching the real game physics for a sequence of inputs.
//
//   node mount-veil/tools/verify.js            check every room of every chapter
//   node mount-veil/tools/verify.js c2         check chapter 2
//   node mount-veil/tools/verify.js c2:3 c3:7  check single rooms
//   node mount-veil/tools/verify.js --json     also write tools/solutions.json (replayable inputs)
//
// It's a best-first search: each step holds one input (run left/right, jump, dash in one of 8
// directions, grab and climb) for a few frames, skips states it has already seen, and heads
// for the goal. Finding a route proves a room is possible; the route isn't meant to be pretty.

const path = require("path");
const fs = require("fs");
const { CHAPTERS, BSIDES = [] } = require("../js/levels.js");
const { Game, ST_DEAD, ST_CLIMB, ST_DREAM, ST_BOOST, ST_FLY } = require("../js/sim.js");

const FRAMES = 4;          // frames each input is held for
const BUDGET = +(process.env.BUDGET || 400000);    // search nodes per goal

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const only = args.filter((a) => !a.startsWith("--"));

const input = (mx, my, jump, press, dash, grab) => ({ mx, my, jump, press, dash, grab });
const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

function actions(g) {
  const p = g.p, out = [];
  // Inside a dream block you can't steer: all that matters is jumping or grabbing on the way out.
  if (p.state === ST_DREAM) {
    return [input(0, 0, false, false, false, false), input(0, 0, true, true, false, false),
      input(1, 0, false, false, false, true), input(-1, 0, false, false, false, true)];
  }
  // In a bubble: pick the launch direction (and optionally launch now with dash).
  // Flying on a feather: steer in any of 8 directions, let go, or dash out.
  if (p.state === ST_FLY) {
    out.push(input(0, 0, false, false, false, false));
    for (const [dx, dy] of DIRS) out.push(input(dx, dy, false, false, false, false));
    if (p.dashes > 0 && p.dashCooldown <= 0) for (const [dx, dy] of DIRS) out.push(input(dx, dy, false, false, true, false));
    return out;
  }
  if (p.state === ST_BOOST) {
    out.push(input(0, 0, false, false, false, false));
    for (const [dx, dy] of DIRS) { out.push(input(dx, dy, false, false, false, false)); out.push(input(dx, dy, false, false, true, false)); }
    return out;
  }
  for (const mx of [-1, 0, 1]) {
    out.push(input(mx, 0, false, false, false, false));
    out.push(input(mx, 0, true, false, false, false));
    out.push(input(mx, 0, true, true, false, false));
    out.push(input(mx, 1, false, false, false, false));
  }
  if (p.dashes > 0 && p.dashCooldown <= 0) {
    for (const [dx, dy] of DIRS) {
      out.push(input(dx, dy, false, false, true, false));
      out.push(input(dx, dy, true, false, true, false));
    }
  }
  const nearWall = g.collideAt(p.x + 3, p.y) || g.collideAt(p.x - 3, p.y);
  if (nearWall || p.state === ST_CLIMB) {
    for (const mx of [-1, 0, 1]) for (const my of [-1, 0, 1]) {
      out.push(input(mx, my, false, false, false, true));
      out.push(input(mx, my, true, true, false, true));
    }
  }
  return out;
}

function run(g, a) {
  // A dash freezes the game for 3 frames and reads its direction afterwards, so dash
  // inputs are held long enough to cover that.
  const frames = a.dash ? FRAMES + 4 : FRAMES;
  for (let f = 0; f < frames; f++) {
    g.step({ mx: a.mx, my: a.my, jump: a.jump, jumpPressed: a.press && f === 0, dashPressed: a.dash && f === 0, grab: a.grab });
    if (g.p.state === ST_DEAD || g.transition || g.done) return f + 1;
  }
  return frames;
}

function key(g) {
  const p = g.p, r = g.room;
  // Coarse on purpose (2 px, 20 px/s buckets): merging near-identical states keeps the search
  // small. Any route it finds is still replayed through the exact physics, so it's real.
  return [p.x >> 1, p.y >> 1, Math.round(p.vx / 20), Math.round(p.vy / 20), p.state, p.dashes, Math.round(p.stamina / 20),
    p.ducking ? 1 : 0, p.dashPhase, p.varJumpTimer > 0 ? 1 : 0, p.forceMoveXTimer > 0 ? 1 : 0, p.wallBoostTimer > 0 ? 1 : 0,
    r.refills.map((x) => (x.respawn > 0 ? 1 : 0)).join(""), r.crumbles.map((c) => c.state).join(""),
    r.berries.map((b) => b.state).join(""),
    Math.round(p.liftX / 40), Math.round(p.liftY / 40), p.dashAttackT > 0 ? 1 : 0,
    r.zips.map((z) => `${z.state}:${Math.round(z.at * 20)}:${z.state % 2 ? Math.round(z.t * 10) : 0}`).join("/"),
    r.switches.map((w) => (w.on ? 1 : 0)).join(""), r.gateOpen ? 1 : 0,
    Math.round(p.boostT * 20), p.boostCd > 0 ? 1 : 0,
    r.moves.map((m) => `${m.state}:${m.x >> 2},${m.y >> 2}`).join("/"), r.swaps.map((m) => `${m.target}:${m.x >> 2},${m.y >> 2}`).join("/"),
    r.clouds.map((c) => (c.gone ? "g" : `${c.y - c.by}:${Math.round(c.v / 40)}`)).join("/"),
    r.boosters.map((b) => (b.respawn > 0 ? 1 : 0)).join(""),
    p.state === ST_FLY ? `${Math.round(p.flyT * 5)}:${Math.round(p.flyAng / (Math.PI / 8))}:${Math.round(p.flySpeed / 30)}` : "",
    p.launchT > 0 ? 1 : 0, r.feathers.map((f) => (f.respawn > 0 ? 1 : 0)).join(""), r.bumpers.map((b) => (b.respawn > 0 ? 1 : 0)).join(""),
    r.water ? Math.round(r.water.y / 4) : ""].join(",");
}

// Minimal binary heap keyed on .f
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j].f <= a[i].f) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

// goal: { reached(g) -> bool, dist(g) -> px }
function search(g, goal) {
  const start = g.snapshot();
  const seen = new Set([key(g)]);
  const heap = new Heap();
  heap.push({ s: start, f: goal.dist(g), depth: 0, path: null });
  let nodes = 0;
  while (heap.size && nodes < BUDGET) {
    const n = heap.pop();
    nodes++;
    g.restore(n.s);
    for (const a of actions(g)) {
      g.restore(n.s);
      run(g, a);
      if (g.p.state === ST_DEAD) continue;
      const path = { a, prev: n.path };
      if (goal.reached(g)) return { nodes, path: unwind(path) };
      if (g.transition || g.done) continue;       // left for some other room
      if (goal.prune && goal.prune(g)) continue;
      const k = key(g);
      if (seen.has(k)) continue;
      seen.add(k);
      heap.push({ s: g.snapshot(), f: goal.dist(g) + (n.depth + 1) * 2, depth: n.depth + 1, path });
    }
  }
  return { nodes, path: null };
}

function unwind(p) {
  const out = [];
  for (; p; p = p.prev) out.push(p.a);
  return out.reverse();
}

// Distance through open air (in tiles, 8 directions, ignoring gravity) from every tile of the
// room to the target tiles. A better guide than straight-line distance: it follows the
// room's shape round walls and up shafts.
function airMap(g, room, targets) {
  const x0 = room.tx - 1, y0 = room.ty - 1, w = room.w + 2, h = room.h + 2;
  const d = new Float32Array(w * h).fill(1e9);
  const open = (gx, gy) => {
    const t = g.tileAt(gx, gy);
    return t !== null ? t !== "#" : gy >= room.ty + room.h;
  };
  const q = [];
  for (const [gx, gy] of targets) {
    const i = (gy - y0) * w + (gx - x0);
    if (gx < x0 || gy < y0 || gx >= x0 + w || gy >= y0 + h || !open(gx, gy)) continue;
    d[i] = 0; q.push(i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], cx = i % w, cy = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx, nd = d[i] + (dx && dy ? 1.41 : 1);
      if (nd < d[ni] && open(nx + x0, ny + y0)) { d[ni] = nd; q.push(ni); }
    }
  }
  return (g) => {
    const cx = Math.floor(g.p.x / 8) - x0, cy = Math.floor((g.p.y - 6) / 8) - y0;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return 1e6;
    return d[cy * w + cx] * 8;
  };
}

// The target tiles: cells of the next room just outside this one.
function doorTiles(room, next) {
  const out = [];
  for (let gy = room.ty - 1; gy <= room.ty + room.h; gy++) {
    for (let gx = room.tx - 1; gx <= room.tx + room.w; gx++) {
      const inside = gx >= room.tx && gy >= room.ty && gx < room.tx + room.w && gy < room.ty + room.h;
      const inNext = gx >= next.tx && gy >= next.ty && gx < next.tx + next.w && gy < next.ty + next.h;
      if (!inside && inNext) out.push([gx, gy]);
    }
  }
  return out;
}

function distToRect(g, r) {
  const x = g.p.x, y = g.p.y - 6;
  const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
  const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
  return dx + dy;
}

let CHAPTER = null;
function fresh(roomId) {
  const g = new Game(CHAPTER, { startRoom: roomId, quiet: true });
  g.p.state = 0;
  for (let i = 0; i < 10; i++) g.step({ mx: 0, my: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false });
  return g;
}

// Replay a route and note which of the room's moving parts it relied on.
function used(roomId, route) {
  const g = fresh(roomId), room = g.room, zips = new Set(), moved = new Set(), clouded = new Set();
  let dreams = 0, swapped = 0, bubbles = 0, flights = 0, bumps = 0;
  for (const a of route) {
    const frames = a.dash ? FRAMES + 4 : FRAMES;
    for (let f = 0; f < frames; f++) {
      const was = g.p.state;
      g.step({ mx: a.mx, my: a.my, jump: a.jump, jumpPressed: a.press && f === 0, dashPressed: a.dash && f === 0, grab: a.grab });
      room.zips.forEach((z, i) => { if (z.state) zips.add(i); });
      if (g.p.state === ST_DREAM && was !== ST_DREAM) dreams++;
      if (g.p.state === ST_BOOST && was !== ST_BOOST) bubbles++;
      if (g.p.state === ST_FLY && was !== ST_FLY) flights++;
      if (g.p.launchT > 0 && !g._lt) bumps++;
      g._lt = g.p.launchT > 0;
      room.moves.forEach((m, i) => { if (m.state) moved.add(i); });
      room.clouds.forEach((c, i) => { if (c.was) clouded.add(i); });
      if (room.swaps.some((m) => m.speed > 0) && !g._sw) swapped++;
      g._sw = room.swaps.some((m) => m.speed > 0);
    }
  }
  const out = [];
  if (room.zips.length) out.push(`zips ${zips.size}/${room.zips.length}`);
  if (room.grid.some((r) => r.includes("D"))) out.push(`dreams ${dreams}`);
  if (room.switches.length) out.push(`gate ${room.gateOpen ? "open" : "shut"}`);
  if (room.moves.length) out.push(`moves ${moved.size}/${room.moves.length}`);
  if (room.swaps.length) out.push(`swaps ${swapped}`);
  if (room.boosters.length) out.push(`bubbles ${bubbles}`);
  if (room.clouds.length) out.push(`clouds ${clouded.size}/${room.clouds.length}`);
  if (room.feathers.length) out.push(`feathers ${flights}`);
  if (room.bumpers.length) out.push(`bumps ${bumps}`);
  if (room.water) out.push("water");
  return out.length ? "  [" + out.join(", ") + "]" : "";
}

const solutions = {};
let failures = 0;
const t0 = Date.now();
for (CHAPTER of CHAPTERS.concat(BSIDES)) CHAPTER.rooms.forEach((def, i) => {
  const tag = `${CHAPTER.id}:${def.id}`;
  if (only.length && !only.includes(CHAPTER.id) && !only.includes(tag)) return;
  const next = CHAPTER.rooms[i + 1];
  let g = fresh(def.id);
  const room = g.room;
  const goal = next
    ? { reached: (g) => g.room.id === next.id, dist: airMap(g, room, doorTiles(room, g.roomIndex[next.id])) }
    : { reached: (g) => g.done, dist: airMap(g, room, [[room.goal.x / 8, room.goal.y / 8 + 1]]) };
  if (room.hasGate) {
    // A gate room: head for the switches still unlit, then for the door once the gate opens.
    const toDoor = goal.dist, toSwitch = room.switches.map((s) => airMap(g, room, [[s.x / 8, s.y / 8]]));
    goal.dist = (g) => {
      if (g.room.gateOpen) return toDoor(g);
      let near = 1e6, left = 0;
      g.room.switches.forEach((s, i) => { if (!s.on) { left++; near = Math.min(near, toSwitch[i](g)); } });
      return 500 * left + near;
    };
  }
  const t = Date.now();
  const res = search(g, goal);
  const ok = !!res.path;
  if (!ok) failures++;
  const frames = ok ? res.path.reduce((n, a) => n + (a.dash ? FRAMES + 4 : FRAMES), 0) : 0;
  console.log(`${tag.padEnd(6)} ${def.name.padEnd(18)} ${ok ? "OK  " : "FAIL"} ${ok ? `${(frames / 60).toFixed(1)}s route` : ""} (${res.nodes} states, ${((Date.now() - t) / 1000).toFixed(1)}s)${ok ? used(def.id, res.path) : ""}`);
  if (ok) solutions[tag] = res.path;

  room.berries.forEach((b, bi) => {
    g = fresh(def.id);
    const berry = g.room.berries[bi];
    const toBerry = airMap(g, g.room, [[Math.floor(berry.hx / 8), Math.floor(berry.hy / 8)]]);
    // Once it's following you, head for safe ground (air above rock or a ledge, not spikes).
    const safe = [];
    const R = g.room;
    for (let y = 0; y < R.h - 1; y++) for (let x = 0; x < R.w; x++) {
      const t = R.grid[y][x], below = R.grid[y + 1][x];
      if (t === "." && "#=DX".includes(below)) safe.push([R.tx + x, R.ty + y]);
    }
    const toSafe = airMap(g, R, safe);
    // A winged strawberry that has flown off is gone until you die, so stop exploring there.
    const bgoal = { reached: () => berry.state === 2, dist: (g) => (berry.state === 1 ? toSafe(g) : 400 + toBerry(g)), prune: () => berry.state === 3 };
    const br = search(g, bgoal);
    if (!br.path) failures++;
    console.log(`         strawberry ${b.id.padEnd(10)} ${br.path ? "OK  " : "FAIL"} (${br.nodes} states)`);
  });

  // Cassettes and crystal hearts: touching one is enough.
  room.items.forEach((it0, ii) => {
    g = fresh(def.id);
    const it = g.room.items[ii];
    const toIt = airMap(g, g.room, [[Math.floor(it.x / 8), Math.floor(it.y / 8)]]);
    const r = search(g, { reached: () => it.got, dist: toIt });
    if (!r.path) failures++;
    console.log(`         ${it.kind.padEnd(10)} ${`${Math.floor((it.x - g.room.x) / 8)},${Math.floor((it.y - g.room.y) / 8)}`.padEnd(10)} ${r.path ? "OK  " : "FAIL"} (${r.nodes} states)`);
  });
});
console.log(`${failures ? `${failures} problem(s)` : "Every room and strawberry is reachable"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (wantJson) fs.writeFileSync(path.join(__dirname, "solutions.json"), JSON.stringify(solutions));
process.exit(failures ? 1 : 0);
