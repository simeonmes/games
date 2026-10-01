"use strict";
// Autopilot: holds the gas and leans to keep the bike's wheels parallel to the ground,
// lining up in the air for where it will land. The level checker uses it to prove each
// level can be finished, and the title screen uses it for the ride in the background.
// In a level's "watch" hints (moving saws) it looks ahead by riding a copy of the world a
// few seconds forward, and brakes to wait if going now would end in a crash.

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Follow the bike's flight (ignoring spin) until it meets the ground; return that ground.
function predictLanding(world) {
  const b = world.bike;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const G_ = 1150;
  for (let i = 0; i < 80; i++) {
    const g = world.groundBelow(x, y, 60);
    if (g && y > g.y - 40) return g;
    vy += G_ * 0.03;
    x += vx * 0.03; y += vy * 0.03;
  }
  return world.groundBelow(x, y);
}

// Ride a copy of the world flat out for `horizon` seconds; does it end in a crash?
function crashesAhead(world, horizon) {
  const w = world.clone();
  const t0 = w.time;
  while (w.time - t0 < horizon) {
    w.step(autopilot(w, true));
    if (w.bike.crashed) return true;
    if (w.finished) return false;
  }
  return false;
}

// In a timed section: brake and wait whenever riding on now would end in a crash.
function shouldWait(world) {
  if (world._apT !== undefined && world.time - world._apT < 0.08) return world._apWait;
  world._apT = world.time;
  world._apWait = crashesAhead(world, 3.2);
  return world._apWait;
}

function autopilot(world, noLook) {
  const b = world.bike;
  const inp = { gas: true, brake: false, back: false, fwd: false };
  for (const h of world.L.hints || []) {
    if (b.x < h.x0 || b.x > h.x1) continue;
    if (h.watch && !noLook && shouldWait(world)) { inp.gas = false; inp.brake = true; }
  }

  let target;
  if (b.grounded) {
    let nx = 0, ny = 0;
    for (const w of b.wheels) if (w.contact) { nx += w.nx; ny += w.ny; }
    target = Math.atan2(nx, -ny);
    if (b.wheels[0].contact && b.wheels[1].contact) target = b.a;
    // One wheel down: bring the other one down too.
    else if (b.wheels[0].contact) target += 0.15;
    else target -= 0.15;
  } else {
    const g = predictLanding(world);
    target = g ? g.angle : 0;
  }
  const err = wrapAngle(b.a - target);
  const u = err + b.w * 0.22;
  if (u > 0.08) inp.back = true;
  else if (u < -0.08) inp.fwd = true;
  return inp;
}

if (typeof module !== "undefined") module.exports = { autopilot, wrapAngle };
