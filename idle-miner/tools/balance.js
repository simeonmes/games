"use strict";
// Balance checker: a bot plays the real simulation (miners walking, elevator trips and all)
// and reports how long each milestone takes. It taps everything without a manager once a
// second like an active player, hires managers as soon as it can, and otherwise buys
// whatever adds the most income per dollar. It opens the next mine as soon as it's allowed
// to and the new mine would start at least twice as rich.
//
//   node idle-miner/tools/balance.js            play 4 hours of game time
//   node idle-miner/tools/balance.js 12         play 12 hours
//   node idle-miner/tools/balance.js 4 --log    print every purchase
//   node idle-miner/tools/balance.js 4 --set=unlockGrow=30,geoPow=0.25   try other numbers

const S = require("../js/sim.js");

const hours = Number(process.argv[2]) || 4;
const log = process.argv.includes("--log");
const DT = 1 / 20;
const setArg = process.argv.find((a) => a.startsWith("--set="));
if (setArg) for (const kv of setArg.slice(6).split(",")) { const [k, v] = kv.split("="); S.ECON[k] = Number(v); }
const brief = process.argv.includes("--brief");

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const m = new S.Mine();
const fmt = (t) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}m${String(Math.floor(t % 60)).padStart(2, "0")}s`;
const money = (v) => (v < 1000 ? v.toFixed(0) : v.toExponential(2));
let clock = 0, mineStart = 0;

function decide() {
  // Managers first, the moment we can afford them.
  const areas = [["elevator", 0], ["warehouse", 0], ...m.shafts.map((s, i) => ["shaft", i])];
  for (const [a, i] of areas) {
    if (!m.areaObj(a, i).manager && m.cash >= m.hireCost(a, i)) {
      m.hire(a, i, rand);
      if (log) console.log(fmt(clock), "hire", a, i);
    }
  }
  for (const [a, i] of areas) m.activate(a, i);

  // Keep the elevator and the warehouse ahead of the miners, like a player would; otherwise
  // buy whatever adds the most ore per dollar.
  const r = m.rates();
  const options = [];
  for (const [a, rate] of [["elevator", r.lift], ["warehouse", r.sell]]) {
    const q = m.quote(a, 0, 1);
    if (q.n && rate < r.mined * 1.15) options.push({ what: a, cost: q.cost, score: Infinity, go: () => m.buy(a, 0, 1) });
  }
  for (const s of m.shafts) {
    const q = m.quote("shaft", s.i, 1);
    if (!q.n) continue;
    const gain = S.shaftStats(s.i, s.level + 1).rate - S.shaftStats(s.i, s.level).rate;
    options.push({ what: `shaft ${s.i}`, cost: q.cost, score: gain / q.cost, go: () => m.buy("shaft", s.i, 1) });
  }
  if (m.shafts.length < S.MAX_SHAFTS) {
    const cost = m.nextUnlockCost();
    options.push({ what: "unlock", cost, score: (2 * S.shaftStats(m.shafts.length, 1).rate) / cost, go: () => m.unlock() });
  }
  options.sort((x, y) => y.score - x.score);
  const best = options[0];
  if (best && best.cost <= m.cash) {
    best.go();
    if (log) console.log(fmt(clock), "buy", best.what, money(best.cost));
    return true;
  }
  return false;
}

const report = [];
let lastShafts = 1, nextPrint = 0;
console.log(`time       mine shafts  income/s   elev  wh   shaft levels`);
const line = (tag) => {
  const r = m.rates();
  console.log(
    `${fmt(clock).padEnd(10)} ${String(m.mineIndex + 1).padStart(3)} ${String(m.shafts.length).padStart(6)}  ${money(m.potential()).padStart(9)}  ${String(m.elevator.level).padStart(5)} ${String(m.warehouse.level).padStart(4)}   ${m.shafts.map((s) => s.level).join(",")}  ${tag || ""}  [mined ${money(r.mined)} lift ${money(r.lift)} sell ${money(r.sell)}]`,
  );
};

for (let n = 1; n <= hours * 3600 / DT; n++) {
  m.step(DT);
  clock = n * DT;
  if (n % Math.round(1 / DT) === 0) {
    for (const s of m.shafts) m.tap("shaft", s.i);
    m.tap("elevator", 0);
    m.tap("warehouse", 0);
    for (let k = 0; k < 40 && decide(); k++);
    if (m.shafts.length !== lastShafts) {
      lastShafts = m.shafts.length;
      if (!brief || m.mineIndex === 0) line(`shaft ${lastShafts} (${fmt(clock - mineStart)} into this mine)`);
    }
    if (m.canPrestige()) {
      const gain = m.geologistsToGain();
      if (1 + (m.geologists + gain) * S.ECON.geoBonus >= 2 * m.mult()) {
        if (!brief) line(`PRESTIGE +${gain} geologists (total ${m.geologists + gain})`);
        report.push({ t: clock, mine: m.mineIndex + 1, len: clock - mineStart, shafts: m.shafts.length });
        m.prestige();
        mineStart = clock;
        lastShafts = 1;
      }
    }
    if (clock >= nextPrint && !brief) { line(); nextPrint += 900; }
  }
  m.events.length = 0;
}
line("end");
console.log("\nmines:", report.map((r) => `#${r.mine} ${fmt(r.len)} (${r.shafts} shafts)`).join("  "));
