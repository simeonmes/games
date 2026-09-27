"use strict";
// Room checker: proves every room of the chapter can be finished, and every strawberry
// collected, by searching the real game physics for a sequence of inputs.
//
//   node mount-veil/tools/verify.js            check every room
//   node mount-veil/tools/verify.js 3 7        check rooms 3 and 7
//   node mount-veil/tools/verify.js --json     also write tools/solutions.json (replayable inputs)
//
// It's a best-first search: each step holds one input (run left/right, jump, dash in one of 8
// directions, grab and climb) for a few frames, skips states it has already seen, and heads
// for the goal. Finding a route proves a room is possible; the route isn't meant to be pretty.

const path = require("path");
const fs = require("fs");
const { CHAPTER } = require("../js/levels.js");
const { Game, ST_DEAD, ST_CLIMB, ST_DASH } = require("../js/sim.js");

const FRAMES = 4;          // frames each input is held for
const BUDGET = +(process.env.BUDGET || 400000);    // search nodes per goal

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const only = args.filter((a) => !a.startsWith("--"));

const input = (mx, my, jump, press, dash, grab) => ({ mx, my, jump, press, dash, grab });
const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

function actions(g) {
  const p = g.p, out = [];
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
  for (let f = 0; f < FRAMES; f++) {
    g.step({ mx: a.mx, my: a.my, jump: a.jump, jumpPressed: a.press && f === 0, dashPressed: a.dash && f === 0, grab: a.grab });
    if (g.p.state === ST_DEAD || g.transition || g.done) return f + 1;
  }
  return FRAMES;
}

function key(g) {
  const p = g.p, r = g.room;
  // Coarse on purpose (2 px, 20 px/s buckets): merging near-identical states keeps the search
  // small. Any route it finds is still replayed through the exact physics, so it's real.
  return [p.x >> 1, p.y >> 1, Math.round(p.vx / 20), Math.round(p.vy / 20), p.state, p.dashes, Math.round(p.stamina / 20),
    p.ducking ? 1 : 0, p.dashPhase, p.varJumpTimer > 0 ? 1 : 0, p.forceMoveXTimer > 0 ? 1 : 0, p.wallBoostTimer > 0 ? 1 : 0,
    r.refills.map((x) => (x.respawn > 0 ? 1 : 0)).join(""), r.crumbles.map((c) => c.state).join(""),
    r.berries.map((b) => b.state).join("")].join(",");
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

function fresh(roomId) {
  const g = new Game(CHAPTER, { startRoom: roomId, quiet: true });
  g.p.state = 0;
  for (let i = 0; i < 10; i++) g.step({ mx: 0, my: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false });
  return g;
}

const solutions = {};
let failures = 0;
const t0 = Date.now();
CHAPTER.rooms.forEach((def, i) => {
  if (only.length && !only.includes(def.id)) return;
  const next = CHAPTER.rooms[i + 1];
  let g = fresh(def.id);
  const room = g.room;
  const goal = next
    ? { reached: (g) => g.room.id === next.id, dist: airMap(g, room, doorTiles(room, g.roomIndex[next.id])) }
    : { reached: (g) => g.done, dist: airMap(g, room, [[room.goal.x / 8, room.goal.y / 8 + 1]]) };
  const t = Date.now();
  const res = search(g, goal);
  const ok = !!res.path;
  if (!ok) failures++;
  const frames = ok ? res.path.length * FRAMES : 0;
  console.log(`room ${def.id.padStart(2)} ${def.name.padEnd(18)} ${ok ? "OK  " : "FAIL"} ${ok ? `${(frames / 60).toFixed(1)}s route` : ""} (${res.nodes} states, ${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (ok) solutions[def.id] = res.path;

  room.berries.forEach((b, bi) => {
    g = fresh(def.id);
    const berry = g.room.berries[bi];
    const toBerry = airMap(g, g.room, [[Math.floor(berry.hx / 8), Math.floor(berry.hy / 8)]]);
    // Once it's following you, head for safe ground (air above rock or a ledge, not spikes).
    const safe = [];
    const R = g.room;
    for (let y = 0; y < R.h - 1; y++) for (let x = 0; x < R.w; x++) {
      const t = R.grid[y][x], below = R.grid[y + 1][x];
      if (t === "." && (below === "#" || below === "=")) safe.push([R.tx + x, R.ty + y]);
    }
    const toSafe = airMap(g, R, safe);
    const bgoal = { reached: () => berry.state === 2, dist: (g) => (berry.state === 1 ? toSafe(g) : 400 + toBerry(g)) };
    const br = search(g, bgoal);
    if (!br.path) failures++;
    console.log(`         strawberry ${b.id.padEnd(10)} ${br.path ? "OK  " : "FAIL"} (${br.nodes} states)`);
  });
});
console.log(`${failures ? `${failures} problem(s)` : "Every room and strawberry is reachable"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (wantJson) fs.writeFileSync(path.join(__dirname, "solutions.json"), JSON.stringify(solutions));
process.exit(failures ? 1 : 0);
