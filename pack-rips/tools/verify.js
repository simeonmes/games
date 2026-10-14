"use strict";
// Odds checker: opens a large number of every pack in every style with the game's own
// logic and compares what came out with the odds the game shows, the minimum value, the
// maximum pull and the average return.
//
//   node pack-rips/tools/verify.js            200,000 of each pack and style
//   node pack-rips/tools/verify.js 20000      a different number

const fs = require("fs");
const path = require("path");
const { Sim } = require("../js/sim.js");

const win = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "cards.js"), "utf8"))(win);
const sets = Sim.setup(win.PACK_DATA);

const N = Number(process.argv[2]) || 200000;
let failed = 0;
const fail = (msg) => { failed++; console.log("  FAIL " + msg); };
const usd = (v) => "$" + v.toFixed(2);

console.log(`${Object.keys(sets).length} sets, ${Sim.count()} card printings, priced ${win.PACK_DATA.priced}\n`);

for (const pack of Sim.PACKS) {
  const cap = pack.ranges[pack.ranges.length - 1];
  console.log(`${usd(pack.price)} ${pack.name}: ${Sim.poolSize(pack)} cards from ${usd(pack.ranges[0])} to ${usd(cap)}`);
  for (const style of Object.keys(pack.styles)) {
    const o = Sim.odds(pack, style), tag = `${pack.name} ${style}`;
    const seen = o.rows.map(() => 0);
    let total = 0, wins = 0, low = Infinity, high = 0, bonus = 0;
    for (let k = 0; k < N; k++) {
      const pulls = Sim.open(pack, style);
      const p = pulls[0];
      seen[o.rows.findIndex((r) => p.value >= r.lo && p.value <= r.hi && r.color === p.color)]++;
      if (p.value >= pack.price) wins++;
      for (const q of pulls) {
        total += q.value;
        if (q.value < low) low = q.value;
        if (q.value > high) high = q.value;
        if (q.card.p[q.variant] !== q.value) fail(`${tag}: pulled a printing that does not exist`);
      }
      if (pulls.length > 2 || (pulls[1] && !pulls[1].bonus)) fail(`${tag}: pack held more than a card and a bonus card`);
      if (pulls[1]) bonus++;
    }
    const line = o.rows.map((r, k) => `${(100 * r.chance).toFixed(1)}/${(100 * seen[k] / N).toFixed(1)}`).join("  ");
    console.log(`  ${style.padEnd(7)} average ${usd(o.ev).padStart(8)} = ${(100 * o.ev / pack.price).toFixed(0).padStart(3)}% (simulated ${usd(total / N)}), ` +
      `beats the price ${(100 * o.win).toFixed(1)}% (${(100 * wins / N).toFixed(1)}%), max pull ${usd(o.max)}   shown/simulated %: ${line}`);
    if (low < o.min) fail(`${tag}: pulled a card under the minimum value`);
    if (high > cap) fail(`${tag}: pulled a card over the maximum pull`);
    if (Math.abs(o.rows.reduce((s, r) => s + r.chance, 0) - 1) > 1e-9) fail(`${tag}: chances do not add up to 100%`);
    // Rare expensive cards make the average noisy, so it only has to land within 10%.
    if (Math.abs(total / N - o.ev) > o.ev * 0.1) fail(`${tag}: simulated average is more than 10% off the calculated one`);
    if (Math.abs(bonus / N - Sim.BONUS_CHANCE) > 0.005) fail(`${tag}: bonus cards are off their odds`);
    o.rows.forEach((r, k) => {
      if (Math.abs(seen[k] / N - r.chance) > Math.max(0.003, r.chance * 0.15)) fail(`${tag}: ${usd(r.lo)} to ${usd(r.hi)} is off its odds`);
    });
  }
}

console.log(failed ? `\n${failed} problem(s)` : "\nEvery pack matches its odds.");
process.exit(failed ? 1 : 0);
