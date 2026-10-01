// Course checker: a robot climber plays every jump on the route (and the hop out to every
// hidden duck) using the game's own physics, and reports any it can't make.
//   node tools/verify.mjs            check everything
//   node tools/verify.mjs 120 160    only route hops 120..160, with details
import { World, Player, P } from "../js/physics.js";
import { buildCourse } from "../js/course.js";

const course = buildCourse();
const world = new World(course);
const C = course.colliders;
const top = (c) => c.y + c.hy;

// The point of c's footprint nearest to (x, z), at least `inset` in from the edge.
function nearestOn(c, x, z, inset) {
  if (c.shape === "cyl") {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), r = Math.max(0, c.r - inset);
    if (d <= r) return [x, z];
    return [c.x + (dx / d) * r, c.z + (dz / d) * r];
  }
  const px = x - c.x, pz = z - c.z;
  let lx = c.cos * px - c.sin * pz, lz = c.sin * px + c.cos * pz;
  lx = Math.max(-Math.max(0, c.hx - inset), Math.min(Math.max(0, c.hx - inset), lx));
  lz = Math.max(-Math.max(0, c.hz - inset), Math.min(Math.max(0, c.hz - inset), lz));
  return [c.x + c.cos * lx + c.sin * lz, c.z - c.sin * lx + c.cos * lz];
}
const inside = (c, x, z, inset) => { const [nx, nz] = nearestOn(c, x, z, inset); return Math.hypot(nx - x, nz - z) < 1e-6; };

function resetWorld(t) {
  world.time = t;
  for (const c of world.dynamic) { c.off = false; c.crumbleT = 0; c.downT = 0; }
  world.update(0);
  for (const c of world.dynamic) { c.dx = c.dy = c.dz = c.dyaw = 0; }
}

// Try the jump from A to B once, starting at world time t. Returns true if we land on B (or further along).
function attempt(A, B, t, sprint, log) {
  resetWorld(t);
  const [tx0, tz0] = nearestOn(B, A.x, A.z, 0.45);
  let [sx, sz] = nearestOn(A, tx0, tz0, 0.3);
  // Take a run-up of up to 2.5 m, if there's room.
  const bx = sx - tx0, bz = sz - tz0, bl = Math.hypot(bx, bz) || 1;
  for (let k = 25; k > 0; k--) {
    const cx = sx + (bx / bl) * 0.1 * k, cz = sz + (bz / bl) * 0.1 * k;
    if (inside(A, cx, cz, 0.3)) { sx = cx; sz = cz; break; }
  }
  const p = new Player(world, sx, top(A) + 0.001, sz);
  p.ground = A;
  const fans = course.volumes.filter((v) => v.fan);
  const bFan = fans.find((v) => Math.abs(v.y0 - (top(B) - 0.2)) < 0.01 && B.x > v.x0 && B.x < v.x1 && B.z > v.z0 && B.z < v.z1);
  const dt = 1 / 120;
  let jumped = false;
  for (let i = 0; i < 120 * 7; i++) {
    world.update(dt);
    let [tx, tz] = nearestOn(B, p.x, p.z, 0.45);
    // Over the target already: steer for its middle, to stop overshooting.
    if (Math.hypot(tx - p.x, tz - p.z) < 0.6) {
      const k = Math.min(1, 0.3 + Math.hypot(p.vx, p.vz) * 0.08);
      [tx, tz] = nearestOn(B, p.x + (B.x - p.x) * k, p.z + (B.z - p.z) * k, 0.45);
      if (Math.hypot(B.x - p.x, B.z - p.z) < 0.25) { tx = p.x; tz = p.z; }
    }
    let dx = tx - p.x, dz = tz - p.z;
    // Ride an updraft until above the target.
    const fan = fans.find((v) => p.x > v.x0 && p.x < v.x1 && p.z > v.z0 && p.z < v.z1 && p.y < top(B) + 1.5 && p.y > v.y0 - 1 && p.y < v.y1);
    if (fan && !p.zip) { dx = (fan.x0 + fan.x1) / 2 - p.x; dz = (fan.z0 + fan.z1) / 2 - p.z; }
    const d = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    if (d > 0.05) { mx = dx / d; mz = dz / d; }
    if (!p.ground && !fan && !p.zip && !p.mantle) {
      // In the air, steer like a player: aim to arrive over the target as you come down.
      const g = p.y > P.LOWG_Y ? P.G * P.LOWG : P.G;
      const disc = p.vy * p.vy + 2 * g * (p.y - top(B));
      const tl = disc > 0 ? Math.max(0.12, (p.vy + Math.sqrt(disc)) / g) : 0;
      if (tl > 0) {
        const wx = dx / tl - p.vx, wz = dz / tl - p.vz, wl = Math.hypot(wx, wz);
        if (wl < 0.4) { mx = mz = 0; } else { mx = wx / wl; mz = wz / wl; }
      }
    }
    let jumpPressed = false;
    if (p.ground === A && !fan) {
      const ax = p.x + mx * 0.15 + p.vx * 0.03, az = p.z + mz * 0.15 + p.vz * 0.03;
      if (!inside(A, ax, az, -P.R * 0.5) || (top(B) - top(A) > P.STEP && d < 0.9)) { jumpPressed = true; jumped = true; }
    } else if (!p.ground && !jumped && p.airT < 0.08 && !fan) { jumpPressed = true; jumped = true; }
    p.step({ mx, mz, jump: jumpPressed, jumpPressed, sprint }, dt);
    if (process.env.TRACE && log && i % 6 === 0) log.push(`\n  ${i} p ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} v ${p.vx.toFixed(1)},${p.vy.toFixed(1)},${p.vz.toFixed(1)} T ${tx.toFixed(2)},${tz.toFixed(2)} g ${p.ground && p.ground.id} ${p.events.map((e) => e.type)}`);
    if (p.events.some((e) => e.type === "bounce" && e.c === B)) return true;
    p.events.length = 0;
    if (bFan && p.x > bFan.x0 && p.x < bFan.x1 && p.z > bFan.z0 && p.z < bFan.z1 && p.y > bFan.y0 && p.y < bFan.y0 + 3) return true;
    const g = p.ground;
    if (g === B || (g && g.route !== undefined && B.route !== undefined && g.route > B.route)) return true;
    if (g && g !== A && g !== B && top(g) < top(B) - 0.6) { if (log) log.push(`landed on #${g.id} instead`); return false; }
    if (p.y < Math.min(top(A), top(B)) - 6) { if (log) log.push(`fell (jumped=${jumped})`); return false; }
  }
  if (log) log.push(`timed out at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  return false;
}

function hop(A, B, log) {
  const moving = A.move || B.move;
  const period = moving ? (A.move || B.move).period || (2 * Math.PI) / Math.abs((A.move || B.move).rate) : 1;
  const tries = moving ? 16 : 1;
  for (let k = 0; k < tries; k++) {
    if (attempt(A, B, (period * k) / tries, false)) return { ok: true, easy: true };
    if (attempt(A, B, (period * k) / tries, true, k === tries - 1 ? log : null)) return { ok: true, easy: false };
  }
  return { ok: false };
}

const [from, to] = process.argv.slice(2).map(Number);
const route = course.route.map((id) => C[id]);
let fails = 0, hard = 0;
const lo = Number.isFinite(from) ? from : 0, hi = Number.isFinite(to) ? to : route.length - 2;
for (let i = lo; i <= Math.min(hi, route.length - 2); i++) {
  const A = route[i], B = route[i + 1], log = [];
  const r = hop(A, B, log);
  if (!r.ok) { fails++; console.log(`FAIL hop ${i}->${i + 1} (#${A.id} ${A.m || A.shape} top ${top(A).toFixed(1)} -> #${B.id} ${B.m || B.shape} top ${top(B).toFixed(1)}, dist ${Math.hypot(B.x - A.x, B.z - A.z).toFixed(1)}) ${log.join("; ")}`); }
  else if (!r.easy) hard++;
}
if (!Number.isFinite(from)) {
  for (const d of course.ducks) {
    const A = C[d.from], B = C[d.c], log = [];
    if (!hop(A, B, log).ok) { fails++; console.log(`FAIL duck at ${d.y.toFixed(0)} m from #${A.id}: ${log.join("; ")}`); }
  }
  // Nothing on the route should be buried inside something else.
  let buried = 0;
  for (const id of course.route) {
    const c = C[id];
    const p = new Player(world, c.x, top(c) + 0.01, c.z);
    if (!c.move && p.blocked(c.x, top(c) + 0.02, c.z)) { buried++; if (buried < 10) console.log(`blocked standing spot on #${id} at ${top(c).toFixed(1)}`); }
  }
  console.log(`buried spots: ${buried}`);
  // Fan updrafts shouldn't blow through other parts of the route.
  for (const v of course.volumes) for (const id of course.route) {
    const c = C[id], t = top(c);
    if (c.x > v.x0 - 1 && c.x < v.x1 + 1 && c.z > v.z0 - 1 && c.z < v.z1 + 1 && t > v.y0 + 0.5 && t < v.y1 - 0.5 && !v.wind) console.log(`route piece #${id} at ${t.toFixed(1)} sits in the air stream at ${v.y0.toFixed(0)}`);
  }
}
console.log(`${route.length - 1} hops checked, ${fails} failed, ${hard} need sprint. Top at ${course.top.y} m.`);
process.exit(fails ? 1 : 0);
