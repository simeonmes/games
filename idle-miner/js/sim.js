"use strict";
// The mine: economy numbers, upgrade costs and stats, and the step-by-step simulation of the
// miners, the elevator and the warehouse transporters. Runs in the browser and in Node (the
// balance checker in tools/ plays it with a bot).
//
// Money flows one way: miners dig ore into each shaft's crate, the elevator collects the
// crates and brings the ore to the surface pile, and transporters carry it to the warehouse
// where it's sold. Ore is counted in "raw" dollars; the geologist bonus is applied when it
// sells, and the UI multiplies by the same bonus wherever it shows ore so the numbers match.

// ------------------------------------------------------------------ layout (world units)

const W = 400; // world width
const SURF = 280; // sky + surface, above the first shaft
const SHAFT_H = 140;
const MAX_SHAFTS = 30;
const ELEV_X = 18, ELEV_W = 66; // elevator column
const CAGE_H = 64;
const CRATE_X = 104; // left edge of each shaft's crate
const FACE_X = 372; // rock face the miners dig at
const GROUND_Y = 214; // where people stand on the surface
const STASH_X = 112; // surface ore pile next to the headframe
const DOCK_X = 296; // warehouse door

const shaftTop = (i) => SURF + i * SHAFT_H;
const shaftFloor = (i) => shaftTop(i) + 116;
const cageTopY = () => GROUND_Y - CAGE_H; // cage resting at the surface
const cageStopY = (i) => shaftFloor(i) - CAGE_H;
const worldHeight = (n) => shaftTop(Math.min(n + 1, MAX_SHAFTS)) + 60;

// ------------------------------------------------------------------ economy

const SHAFT_MAX = 400;
const AREA_MAX = 2400;
const SHAFT_MS = [10, 25, 50, 100, 150, 200, 250, 300, 350, 400]; // each doubles output
const AREA_MS = [10, 25, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400];

const passed = (ms, L) => { let n = 0; for (const m of ms) if (L >= m) n++; return n; };

const ECON = {
  shaftBase: 0.8, // $/s of shaft 1 at level 1
  shaftGrow: 9, // each deeper shaft's ore is worth this much more
  shaftCost: 6, // first upgrade of shaft 1
  shaftCostDepth: 12, // deeper shafts' upgrades cost this much more each (faster than their ore value grows)
  shaftCostGrow: 1.12, // per level
  unlock: 400, // shaft 2
  unlockGrow: 40, // each next shaft
  elevLoad: 6,
  elevLoadGrow: 1.098,
  elevCost: 7,
  elevCostGrow: 1.11,
  whLoad: 4,
  whLoadGrow: 1.098,
  whCost: 7,
  whCostGrow: 1.11,
  mgrShaft: 30, // shaft 1 manager; deeper shafts cost more
  mgrShaftGrow: 13,
  mgrElev: 60,
  mgrWh: 90,
  geoUnit: 1e6, // lifetime earnings for the first geologist
  geoPow: 0.25, // geologists grow with lifetime earnings to this power
  geoBonus: 0.1, // +10% income each
  prestigeShafts: 5, // unlock this many shafts to open the next mine
};

// Shaft i at level L.
function shaftStats(i, L) {
  const c = passed(SHAFT_MS, L);
  return {
    workers: Math.min(6, 1 + passed(SHAFT_MS.slice(0, 5), L)),
    rate: ECON.shaftBase * Math.pow(ECON.shaftGrow, i) * L * Math.pow(2, c), // raw $/s
    walk: 85 * (1 + 0.14 * Math.min(c, 6)),
    dig: 1.8 / (1 + 0.1 * Math.min(c, 6)),
  };
}
const shaftCost = (i, L) => ECON.shaftCost * Math.pow(ECON.shaftCostDepth, i) * Math.pow(ECON.shaftCostGrow, L - 1);
const unlockCost = (i) => ECON.unlock * Math.pow(ECON.unlockGrow, i - 1);

function elevStats(L) {
  const c = passed(AREA_MS, L);
  return {
    load: ECON.elevLoad * L * Math.pow(ECON.elevLoadGrow, L - 1) * Math.pow(1.5, c),
    speed: 95 * Math.pow(1 + (L - 1) / 30, 0.5), // world units / s
    loadTime: 0.6 / (1 + 0.15 * c),
  };
}
const elevCost = (L) => ECON.elevCost * Math.pow(ECON.elevCostGrow, L - 1);

function whStats(L) {
  const c = passed(AREA_MS, L);
  return {
    workers: Math.min(5, 1 + passed(AREA_MS.slice(0, 4), L)),
    load: ECON.whLoad * L * Math.pow(ECON.whLoadGrow, L - 1) * Math.pow(1.5, c),
    walk: 64 * Math.pow(1 + (L - 1) / 25, 0.45),
    loadTime: 0.6 / (1 + 0.15 * c),
  };
}
const whCost = (L) => ECON.whCost * Math.pow(ECON.whCostGrow, L - 1);

// Cost of n levels starting from level L, with a per-level cost function that grows by r.
function bulkCost(costFn, r, L, n) {
  return costFn(L) * (Math.pow(r, n) - 1) / (r - 1);
}
// How many levels (up to cap) `cash` buys from level L.
function maxAffordable(costFn, r, L, cash, cap) {
  const c0 = costFn(L);
  if (cash < c0) return 0;
  const n = Math.floor(Math.log(cash * (r - 1) / c0 + 1) / Math.log(r));
  return Math.max(0, Math.min(cap - L, n));
}

// Analytic throughput in raw $/s, used for idle earnings, the HUD and the bot.
function elevRate(L, nShafts, boost = 1, loadBoost = 1) {
  const s = elevStats(L);
  const depth = cageStopY(nShafts - 1) - cageTopY();
  const trip = (2 * depth) / (s.speed * boost) + (nShafts * s.loadTime + 0.5) / boost;
  return (s.load * loadBoost) / trip;
}
function whRate(L, boost = 1, loadBoost = 1) {
  const s = whStats(L);
  const trip = (2 * (DOCK_X - STASH_X - 20)) / (s.walk * boost) + (s.loadTime + 0.3) / boost;
  return (s.workers * s.load * loadBoost) / trip;
}

const geologistsFor = (lifetime) => Math.floor(Math.pow(lifetime / ECON.geoUnit, ECON.geoPow) * 10);

// ------------------------------------------------------------------ cosmetics

const ORES = [
  ["Coal", "#2b2b2f", "#55555c"], ["Copper", "#b8642e", "#e89a5d"], ["Iron", "#7d6a5c", "#b3a196"],
  ["Tin", "#9aa4ab", "#d4dde3"], ["Silver", "#bcc6d0", "#f2f6fa"], ["Gold", "#e3a91b", "#ffe27a"],
  ["Jade", "#2f9e6a", "#7de0b0"], ["Ruby", "#c0233d", "#ff6f86"], ["Amethyst", "#7a3fbf", "#c69bff"],
  ["Sapphire", "#2554c7", "#7fa6ff"], ["Emerald", "#14915a", "#58f0a6"], ["Topaz", "#e07b16", "#ffc06b"],
  ["Platinum", "#a7b6c2", "#ffffff"], ["Opal", "#7fc9d6", "#ffe0f4"], ["Diamond", "#8fe8ff", "#ffffff"],
];
const oreFor = (i) => ORES[i % ORES.length];

const MINES = [
  { name: "Old Coal Mine", rock: "#3b2a1e", deep: "#1a120c", sky: ["#6fb6ff", "#c9e8ff"] },
  { name: "Copper Canyon", rock: "#4a2b1a", deep: "#1e0f08", sky: ["#ff9e6b", "#ffe0b8"] },
  { name: "Frostpeak Mine", rock: "#2e3a4a", deep: "#101721", sky: ["#9fc4e8", "#eef6ff"] },
  { name: "Desert Gold Mine", rock: "#5a4220", deep: "#21170a", sky: ["#ffb85c", "#fff1c4"] },
  { name: "Jungle Ruby Mine", rock: "#2e3a22", deep: "#10160b", sky: ["#5fc79a", "#d8ffe9"] },
  { name: "Volcano Mine", rock: "#3a1c18", deep: "#170807", sky: ["#5b2433", "#ff8a4c"] },
  { name: "Crystal Caverns", rock: "#2a2448", deep: "#0e0b1e", sky: ["#4a3b8f", "#c5b8ff"] },
  { name: "Moon Mine", rock: "#3a3a44", deep: "#121218", sky: ["#05060f", "#2a2f55"] },
];
const mineFor = (k) => MINES[k % MINES.length];
const mineName = (k) => mineFor(k).name + (k >= MINES.length ? " " + ["", "II", "III", "IV", "V", "VI"][Math.min(5, Math.floor(k / MINES.length))] : "");

// ------------------------------------------------------------------ managers

const RARITY = [
  { name: "Junior", mult: 2, cut: 0.2, time: 60, odds: 0.62 },
  { name: "Senior", mult: 3, cut: 0.35, time: 120, odds: 0.3 },
  { name: "Executive", mult: 5, cut: 0.5, time: 180, odds: 0.08 },
];
const COOLDOWN = 300;
const ABILITIES = {
  shaft: ["rush", "cut"],
  elevator: ["rush", "load", "cut"],
  warehouse: ["rush", "load", "cut"],
};
const FIRST = ["Bo", "Gus", "Ida", "Max", "Rita", "Sal", "Tom", "Vera", "Jo", "Nell", "Ozzy", "Pip", "Rex", "Dot", "Hank", "Lou", "Mae", "Ned", "Ada", "Cyd"];
const LAST = ["Shovel", "Boulder", "Pickett", "Quarry", "Cobble", "Nugget", "Flint", "Granite", "Dusty", "Hardhat", "Lode", "Seam", "Tunnel", "Ingot", "Ore"];

function abilityText(a, r) {
  const R = RARITY[r];
  if (a === "rush") return `Everything ×${R.mult} faster for ${R.time}s`;
  if (a === "load") return `×${R.mult} load for ${R.time}s`;
  return `Upgrades ${Math.round(R.cut * 100)}% cheaper for ${R.time}s`;
}
const abilityName = (a) => (a === "rush" ? "Rush" : a === "load" ? "Big Load" : "Bargain");

function rollManager(area, rand = Math.random) {
  let x = rand(), r = 0;
  while (r < RARITY.length - 1 && x > RARITY[r].odds) { x -= RARITY[r].odds; r++; }
  const list = ABILITIES[area];
  return {
    name: FIRST[Math.floor(rand() * FIRST.length)] + " " + LAST[Math.floor(rand() * LAST.length)],
    rarity: r,
    ability: list[Math.floor(rand() * list.length)],
    look: Math.floor(rand() * 1000),
    active: 0, // seconds of ability left
    cool: 0, // seconds until it can be used again
  };
}
const mgrCost = (area, i) =>
  area === "shaft" ? ECON.mgrShaft * Math.pow(ECON.mgrShaftGrow, i) : area === "elevator" ? ECON.mgrElev : ECON.mgrWh;

// Multipliers from a manager's running ability.
const rushOf = (m) => (m && m.active > 0 && m.ability === "rush" ? RARITY[m.rarity].mult : 1);
const loadOf = (m) => (m && m.active > 0 && m.ability === "load" ? RARITY[m.rarity].mult : 1);
const cutOf = (m) => (m && m.active > 0 && m.ability === "cut" ? 1 - RARITY[m.rarity].cut : 1);

// ------------------------------------------------------------------ the mine

function makeShaft(i, level = 1) {
  return { i, level, stored: 0, manager: null, workers: [], tap: false };
}

class Mine {
  constructor(save) {
    this.cash = 0;
    this.mineIndex = 0; // which mine (prestige count)
    this.geologists = 0;
    this.lifetime = 0; // earned over all mines (drives geologists)
    this.runEarned = 0;
    this.shafts = [makeShaft(0)];
    this.elevator = { level: 1, manager: null, y: cageTopY(), carry: 0, state: "top", target: 0, t: 0, tap: false };
    this.warehouse = { level: 1, manager: null, workers: [], tap: false };
    this.stash = 0; // ore on the surface pile
    this.time = 0;
    this.events = []; // {type, ...} for sound and effects; the caller drains it
    if (save) this.load(save);
    this.syncWorkers();
  }

  // ---- saves
  toSave() {
    const m = (x) => (x ? { name: x.name, rarity: x.rarity, ability: x.ability, look: x.look, active: x.active, cool: x.cool } : null);
    return {
      cash: this.cash, mineIndex: this.mineIndex, geologists: this.geologists, lifetime: this.lifetime, runEarned: this.runEarned,
      stash: this.stash,
      shafts: this.shafts.map((s) => ({ level: s.level, stored: s.stored, manager: m(s.manager) })),
      elevator: { level: this.elevator.level, manager: m(this.elevator.manager), carry: this.elevator.carry },
      warehouse: { level: this.warehouse.level, manager: m(this.warehouse.manager) },
    };
  }
  load(s) {
    const num = (v, d = 0) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d);
    const lvl = (v, max) => Math.max(1, Math.min(max, Math.floor(num(v, 1))));
    const mgr = (x, area) => {
      if (!x || typeof x !== "object") return null;
      return {
        name: String(x.name || "Manager").slice(0, 30),
        rarity: Math.max(0, Math.min(2, Math.floor(num(x.rarity)))),
        ability: ABILITIES[area].includes(x.ability) ? x.ability : ABILITIES[area][0],
        look: Math.floor(num(x.look)), active: num(x.active), cool: num(x.cool),
      };
    };
    this.cash = num(s.cash);
    this.mineIndex = Math.floor(num(s.mineIndex));
    this.geologists = Math.floor(num(s.geologists));
    this.lifetime = num(s.lifetime);
    this.runEarned = num(s.runEarned);
    this.stash = num(s.stash);
    if (Array.isArray(s.shafts) && s.shafts.length) {
      this.shafts = s.shafts.slice(0, MAX_SHAFTS).map((x, i) => {
        const sh = makeShaft(i, lvl(x && x.level, SHAFT_MAX));
        sh.stored = num(x && x.stored);
        sh.manager = mgr(x && x.manager, "shaft");
        return sh;
      });
    }
    if (s.elevator) {
      this.elevator.level = lvl(s.elevator.level, AREA_MAX);
      this.elevator.manager = mgr(s.elevator.manager, "elevator");
      this.stash += num(s.elevator.carry); // whatever was in the cage lands on the pile
    }
    if (s.warehouse) {
      this.warehouse.level = lvl(s.warehouse.level, AREA_MAX);
      this.warehouse.manager = mgr(s.warehouse.manager, "warehouse");
    }
  }

  // ---- derived numbers
  mult() { return 1 + this.geologists * ECON.geoBonus; }
  shaftRate(s) { return shaftStats(s.i, s.level).rate * rushOf(s.manager); }
  rates(onlyManaged = false) {
    let mined = 0;
    for (const s of this.shafts) if (!onlyManaged || s.manager) mined += this.shaftRate(s);
    const e = this.elevator, w = this.warehouse;
    const lift = onlyManaged && !e.manager ? 0 : elevRate(e.level, this.shafts.length, rushOf(e.manager), loadOf(e.manager));
    const sell = onlyManaged && !w.manager ? 0 : whRate(w.level, rushOf(w.manager), loadOf(w.manager));
    return { mined, lift, sell, income: Math.min(mined, lift, sell) * this.mult() };
  }
  // Income per second with no boosts running, everything managed or not.
  potential() {
    let mined = 0;
    for (const s of this.shafts) mined += shaftStats(s.i, s.level).rate;
    return Math.min(mined, elevRate(this.elevator.level, this.shafts.length), whRate(this.warehouse.level)) * this.mult();
  }
  idleRate() {
    let mined = 0;
    for (const s of this.shafts) if (s.manager) mined += shaftStats(s.i, s.level).rate;
    const e = this.elevator, w = this.warehouse;
    if (!e.manager || !w.manager) return 0;
    return Math.min(mined, elevRate(e.level, this.shafts.length), whRate(w.level)) * this.mult();
  }

  // ---- shopping. area is "shaft" | "elevator" | "warehouse"; i is the shaft index.
  upgradeInfo(area, i) {
    if (area === "shaft") {
      const s = this.shafts[i];
      return { level: s.level, max: SHAFT_MAX, r: ECON.shaftCostGrow, cost: (L) => shaftCost(i, L) * cutOf(s.manager) };
    }
    const a = area === "elevator" ? this.elevator : this.warehouse;
    const base = area === "elevator" ? elevCost : whCost;
    const r = area === "elevator" ? ECON.elevCostGrow : ECON.whCostGrow;
    return { level: a.level, max: AREA_MAX, r, cost: (L) => base(L) * cutOf(a.manager) };
  }
  // n = number of levels, or "max". Returns {n, cost} (n may be 0).
  quote(area, i, n) {
    const u = this.upgradeInfo(area, i);
    if (u.level >= u.max) return { n: 0, cost: 0, maxed: true };
    if (n === "max") {
      const k = Math.max(1, maxAffordable(u.cost, u.r, u.level, this.cash, u.max));
      return { n: k, cost: bulkCost(u.cost, u.r, u.level, k) };
    }
    const k = Math.min(n, u.max - u.level);
    return { n: k, cost: bulkCost(u.cost, u.r, u.level, k) };
  }
  buy(area, i, n) {
    const q = this.quote(area, i, n);
    if (!q.n || q.cost > this.cash * (1 + 1e-9)) return false;
    this.cash = Math.max(0, this.cash - q.cost);
    const target = area === "shaft" ? this.shafts[i] : area === "elevator" ? this.elevator : this.warehouse;
    const before = area === "shaft" ? shaftStats(i, target.level).workers : area === "warehouse" ? whStats(target.level).workers : 0;
    target.level += q.n;
    this.syncWorkers();
    const after = area === "shaft" ? shaftStats(i, target.level).workers : area === "warehouse" ? whStats(target.level).workers : 0;
    this.events.push({ type: "upgrade", area, i, newWorker: after > before });
    return true;
  }
  nextUnlockCost() { return this.shafts.length < MAX_SHAFTS ? unlockCost(this.shafts.length) : Infinity; }
  unlock() {
    const c = this.nextUnlockCost();
    if (this.cash < c) return false;
    this.cash -= c;
    this.shafts.push(makeShaft(this.shafts.length));
    this.syncWorkers();
    this.events.push({ type: "unlock", i: this.shafts.length - 1 });
    return true;
  }
  areaObj(area, i) { return area === "shaft" ? this.shafts[i] : area === "elevator" ? this.elevator : this.warehouse; }
  hireCost(area, i) { return mgrCost(area, i); }
  hire(area, i, rand) {
    const c = this.hireCost(area, i);
    if (this.cash < c) return false;
    this.cash -= c;
    this.areaObj(area, i).manager = rollManager(area, rand);
    this.events.push({ type: "hire", area, i });
    return true;
  }
  activate(area, i) {
    const m = this.areaObj(area, i).manager;
    if (!m || m.active > 0 || m.cool > 0) return false;
    m.active = RARITY[m.rarity].time;
    m.cool = m.active + COOLDOWN;
    this.events.push({ type: "ability", area, i });
    return true;
  }
  // Ask everyone without a manager to do one round of work.
  tap(area, i) {
    const a = this.areaObj(area, i);
    if (!a || a.manager) return false;
    a.tap = true;
    return true;
  }

  // ---- prestige
  geologistsToGain() { return Math.max(0, geologistsFor(this.lifetime) - this.geologists); }
  canPrestige() { return this.shafts.length >= ECON.prestigeShafts && this.geologistsToGain() > 0; }
  prestige() {
    if (!this.canPrestige()) return false;
    const keep = { mineIndex: this.mineIndex + 1, geologists: this.geologists + this.geologistsToGain(), lifetime: this.lifetime };
    const fresh = new Mine();
    Object.assign(this, fresh, keep, { events: [] });
    this.syncWorkers();
    return true;
  }

  // ---- simulation
  syncWorkers() {
    for (const s of this.shafts) {
      const n = shaftStats(s.i, s.level).workers;
      while (s.workers.length < n) {
        const k = s.workers.length;
        s.workers.push({ k, x: CRATE_X + 50 + k * 4, state: "idle", t: 0, carry: 0, face: FACE_X - 16 - k * 13, phase: k * 0.37 });
      }
    }
    const w = this.warehouse, n = whStats(w.level).workers;
    while (w.workers.length < n) {
      const k = w.workers.length;
      w.workers.push({ k, x: DOCK_X - 6 - k * 6, state: "idle", t: 0, carry: 0 });
    }
  }

  sell(amount) {
    if (amount <= 0) return;
    const v = amount * this.mult();
    this.cash += v;
    this.runEarned += v;
    this.lifetime += v;
    this.events.push({ type: "sell", value: v });
  }

  step(dt) {
    this.time += dt;
    const tick = (m) => { if (m) { m.active = Math.max(0, m.active - dt); m.cool = Math.max(0, m.cool - dt); } };
    for (const s of this.shafts) { tick(s.manager); this.stepShaft(s, dt); }
    tick(this.elevator.manager);
    this.stepElevator(dt);
    tick(this.warehouse.manager);
    this.stepWarehouse(dt);
  }

  stepShaft(s, dt) {
    const st = shaftStats(s.i, s.level), boost = rushOf(s.manager);
    const go = !!s.manager || s.tap;
    for (const w of s.workers) {
      if (w.state === "idle") {
        if (go) { w.state = "walk"; w.x = CRATE_X + 50; }
        continue;
      }
      const start = CRATE_X + 50;
      if (w.state === "walk") {
        w.x += st.walk * boost * dt;
        if (w.x >= w.face) { w.x = w.face; w.state = "dig"; w.t = 0; }
      } else if (w.state === "dig") {
        w.t += dt * boost;
        if (w.t >= st.dig) {
          // Load for one round, so each worker's share of the shaft's rate comes out right.
          const cycle = (2 * (w.face - start)) / st.walk + st.dig;
          w.carry = (st.rate * cycle) / st.workers;
          w.state = "back";
          this.events.push({ type: "dug", i: s.i });
        }
      } else if (w.state === "back") {
        w.x -= st.walk * boost * dt;
        if (w.x <= start) {
          w.x = start;
          s.stored += w.carry;
          w.carry = 0;
          w.state = s.manager ? "walk" : "idle";
        }
      }
    }
    s.tap = false;
  }

  stepElevator(dt) {
    const e = this.elevator, st = elevStats(e.level);
    const boost = rushOf(e.manager), cap = st.load * loadOf(e.manager);
    const n = this.shafts.length;
    if (e.state === "top") {
      if (e.manager || e.tap) { e.state = "down"; e.target = 0; }
    } else if (e.state === "down") {
      const ty = cageStopY(e.target);
      e.y = Math.min(ty, e.y + st.speed * boost * dt);
      if (e.y >= ty) { e.state = "load"; e.t = 0; }
    } else if (e.state === "load") {
      const s = this.shafts[e.target];
      e.t += dt * boost;
      if (e.t >= (s.stored > 0 ? st.loadTime : 0.05)) {
        const take = Math.min(s.stored, cap - e.carry);
        s.stored -= take;
        e.carry += take;
        if (take > 0) this.events.push({ type: "collect", i: e.target });
        if (e.carry >= cap * 0.999 || e.target >= n - 1) e.state = "up";
        else { e.target++; e.state = "down"; }
      }
    } else if (e.state === "up") {
      e.y = Math.max(cageTopY(), e.y - st.speed * boost * dt);
      if (e.y <= cageTopY()) { e.state = "unload"; e.t = 0; }
    } else if (e.state === "unload") {
      e.t += dt * boost;
      if (e.t >= 0.5) {
        this.stash += e.carry;
        e.carry = 0;
        e.state = "top";
      }
    }
    e.tap = false;
  }

  stepWarehouse(dt) {
    const w = this.warehouse, st = whStats(w.level);
    const boost = rushOf(w.manager), cap = st.load * loadOf(w.manager);
    const go = !!w.manager || w.tap;
    const pile = STASH_X + 26;
    let delay = 0;
    for (const p of w.workers) {
      if (p.state === "idle") {
        // Managed transporters leave the dock a little apart so they don't walk in a clump.
        if (go && (p.t -= dt) <= 0) { p.state = "walk"; p.t = w.manager ? delay : 0; }
        delay += 0.6;
        continue;
      }
      if (p.state === "walk") {
        if (p.t > 0) { p.t -= dt; continue; }
        p.x -= st.walk * boost * dt;
        if (p.x <= pile + p.k * 3) { p.x = pile + p.k * 3; p.state = "load"; p.t = 0; }
      } else if (p.state === "load") {
        p.t += dt * boost;
        if (p.t >= st.loadTime) {
          const take = Math.min(this.stash, cap);
          this.stash -= take;
          p.carry = take;
          p.state = "back";
        }
      } else if (p.state === "back") {
        p.x += st.walk * boost * dt;
        const dock = DOCK_X - 6 - p.k * 6;
        if (p.x >= dock) {
          p.x = dock;
          this.sell(p.carry);
          p.carry = 0;
          p.state = w.manager ? "walk" : "idle";
          p.t = 0;
        }
      }
    }
    w.tap = false;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    Mine, ECON, W, SURF, SHAFT_H, MAX_SHAFTS, SHAFT_MAX, AREA_MAX, SHAFT_MS, AREA_MS, ELEV_X, ELEV_W, CAGE_H, CRATE_X, FACE_X,
    GROUND_Y, STASH_X, DOCK_X, shaftTop, shaftFloor, cageTopY, cageStopY, worldHeight, shaftStats, elevStats, whStats,
    shaftCost, elevCost, whCost, unlockCost, elevRate, whRate, geologistsFor, RARITY, COOLDOWN, rollManager, mgrCost,
    abilityText, abilityName, oreFor, mineFor, mineName, passed,
  };
}
