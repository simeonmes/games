"use strict";
// Odds checker: opens a large number of packs of every set with the game's own logic and
// compares what came out with the configured odds, the average pull value and the play price.
//
//   node pack-rips/tools/verify.js            200,000 packs per set
//   node pack-rips/tools/verify.js 20000      a different number of packs

const fs = require("fs");
const path = require("path");
const { Sim } = require("../js/sim.js");

global.window = {};
const dir = path.join(__dirname, "..", "js", "sets");
for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) new Function("window", fs.readFileSync(path.join(dir, f), "utf8"))(global.window);
const SETS = global.window.PACK_SETS;

const N = Number(process.argv[2]) || 200000;
let failed = 0;
const fail = (msg) => { failed++; console.log("  FAIL " + msg); };

for (const id of Object.keys(Sim.PACKS)) {
  const set = SETS[id];
  if (!set) { fail(`${id}: no data file, run tools/fetch-sets.mjs`); continue; }
  const ev = Sim.expectedValue(set), price = Sim.packPrice(set), size = Sim.packSize(set);
  const seen = {};
  let total = 0, best = 0, profit = 0;
  for (let k = 0; k < N; k++) {
    const pulls = Sim.openPack(set);
    if (pulls.length !== size) fail(`${id}: pack had ${pulls.length} cards, expected ${size}`);
    let v = 0;
    const inPack = new Set();
    for (const p of pulls) {
      v += p.value;
      if (p.variant !== "r") inPack.add(p.pool); // reverse-holo slots are not part of the odds
      if (!set.cards[p.i]) fail(`${id}: pulled a card that does not exist`);
    }
    for (const pool of inPack) seen[pool] = (seen[pool] || 0) + 1;
    total += v;
    if (v > best) best = v;
    if (v >= price) profit++;
  }
  console.log(`${id} ${set.name}: ${size} cards, play price $${price.toFixed(2)}, average pull $${ev.toFixed(2)} (simulated $${(total / N).toFixed(2)}), ` +
    `${(100 * profit / N).toFixed(1)}% of packs beat the price, best pack $${best.toFixed(2)}`);
  if (Math.abs(total / N - ev) > ev * 0.05) fail(`${id}: simulated average is more than 5% off the calculated one`);
  for (const row of Sim.oddsTable(set)) {
    const got = (seen[row.pool] || 0) / N;
    const line = `  ${Sim.label(row.pool).padEnd(26)} 1 in ${(1 / row.chance).toFixed(1).padStart(6)}   simulated 1 in ${(got ? 1 / got : Infinity).toFixed(1).padStart(6)}   ${String(row.count).padStart(3)} cards, avg $${row.avg.toFixed(2)}, best ${set.cards[row.best].name}`;
    console.log(line);
    if (row.chance < 0.9 && Math.abs(got - row.chance) > Math.max(0.002, row.chance * 0.15)) fail(`${id}: ${row.pool} is off its configured odds`);
  }
}

console.log(failed ? `\n${failed} problem(s)` : "\nAll sets match their odds.");
process.exit(failed ? 1 : 0);
