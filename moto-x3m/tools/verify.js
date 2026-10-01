"use strict";
// Level checker: rides every level with the autopilot on the starting bike and reports the
// finishing time, crashes and where they happened. A level passes if the autopilot reaches
// the finish without crashing, which proves it can be done with the slowest bike.
//
//   node moto-x3m/tools/verify.js              check every level
//   node moto-x3m/tools/verify.js 3 7          check levels 3 and 7
//   node moto-x3m/tools/verify.js --bike=fox   ride a different bike
//   node moto-x3m/tools/verify.js --near       how close the bike came to each saw, spike and TNT
//   node moto-x3m/tools/verify.js --jumps      every jump: take-off, landing, air time
//   node moto-x3m/tools/verify.js --trace      the bike's path every half second

const { LEVELS } = require("../js/levels.js");
const { World, BIKES, DT } = require("../js/sim.js");
const { autopilot } = require("../js/autopilot.js");

const args = process.argv.slice(2);
const trace = args.includes("--trace");
const bikeArg = args.find((a) => a.startsWith("--bike="));
const bike = bikeArg ? BIKES.find((b) => b.id === bikeArg.slice(7)) : BIKES[0];
const only = args.filter((a) => !a.startsWith("--")).map(Number);

let failed = 0;
LEVELS.forEach((L, i) => {
  const n = i + 1;
  if (only.length && !only.includes(n)) return;
  const w = new World(L, bike);
  const crashes = [];
  const near = new Map(); // hazard -> closest the bike came (px between surfaces)
  let steps = 0;
  const maxSteps = 180 / DT;
  while (!w.finished && steps < maxSteps) {
    w.step(autopilot(w));
    steps++;
    for (const e of w.events) if (e.type === "crash") crashes.push(`${e.kind}@${Math.round(e.x)},${Math.round(e.y)}`);
    w.events.length = 0;
    if (args.includes("--jumps")) {
      const b = w.bike;
      if (!b.grounded && !w.jump && !b.crashed) w.jump = { x: b.x, y: b.y, v: b.speed, t: w.clock };
      if ((b.grounded || b.crashed) && w.jump) {
        if (w.clock - w.jump.t > 0.25) console.log(`   jump x=${w.jump.x.toFixed(0)} v=${w.jump.v.toFixed(0)} -> x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} air=${(w.clock - w.jump.t).toFixed(2)} v=${b.speed.toFixed(0)}${b.crashed ? " CRASH" : ""}`);
        w.jump = null;
      }
    }
    if (trace && steps % 60 === 0) {
      const b = w.bike;
      console.log(`   t=${w.clock.toFixed(1)} x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} a=${b.a.toFixed(2)} v=${b.speed.toFixed(0)} g=${b.grounded ? 1 : 0}`);
    }
    if (!w.bike.crashed) {
      for (const o of w.objs) {
        if (!["saw", "tnt", "spikes"].includes(o.type) || !o.alive) continue;
        for (const [x, y, r] of w.bikeCircles()) {
          let d;
          if (o.type === "saw") d = Math.hypot(x - o.x, y - o.y) - o.r - r;
          else {
            const x0 = o.type === "tnt" ? o.x - o.w / 2 : o.x, x1 = o.type === "tnt" ? o.x + o.w / 2 : o.x + o.w;
            const qx = Math.max(x0, Math.min(x1, x)), qy = Math.max(o.y - o.h, Math.min(o.y, y));
            d = Math.hypot(x - qx, y - qy) - r;
          }
          const k = `${o.type}@${Math.round(o.bx)}`;
          if (!near.has(k) || d < near.get(k)) near.set(k, d);
        }
      }
    }
    if (crashes.length > 25) break;
  }
  const ok = w.finished && crashes.length === 0;
  if (!ok) failed++;
  const t = w.clock;
  const [s3, s2] = L.stars;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${String(n).padStart(2)} ${L.name.padEnd(20)} ` +
    `${w.finished ? t.toFixed(2) + "s" : "DNF   "} crashes=${crashes.length} stars=${s3}/${s2}` +
    (w.finished && t > s3 ? "  (autopilot slower than 3-star time)" : "") +
    (crashes.length ? "\n     " + crashes.slice(0, 8).join("  ") : "")
  );
  if (args.includes("--near") && near.size) {
    console.log("     closest: " + [...near].map(([k, d]) => `${k}:${Math.round(d)}`).join("  "));
  }
});
process.exit(failed ? 1 : 0);
