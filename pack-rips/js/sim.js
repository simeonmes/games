"use strict";
// Pack contents, pull odds and card values. Pure logic with no DOM access, so
// tools/verify.js can run it under Node.
//
// The odds are approximations of community-reported pull rates, not official figures
// (the publisher does not release them). Each set's numbers live in PACKS below.

const Sim = (() => {
  // How a pack of each era is laid out. A slot draws `n` cards from `pool`; a slot with
  // `hits` first rolls the set's odds for those pools and only falls back to `pool`
  // when none lands. "reverse" is the reverse-holo pool: any card printed in reverse.
  const LAYOUTS = {
    // Scarlet & Violet: 4 commons, 3 uncommons, 2 reverse holos, 1 rare or better.
    sv: [
      { n: 4, pool: "Common" },
      { n: 3, pool: "Uncommon" },
      { n: 1, pool: "reverse" },
      { n: 1, pool: "reverse", hits: ["ACE SPEC Rare", "Illustration rare", "Special illustration rare", "Hyper rare"] },
      { n: 1, pool: "Rare", hits: ["Double rare", "Ultra Rare"] },
    ],
    // Sword & Shield: 5 commons, 3 uncommons, 1 reverse holo, 1 rare or better.
    swsh: [
      { n: 5, pool: "Common" },
      { n: 3, pool: "Uncommon" },
      { n: 1, pool: "reverse" },
      { n: 1, pool: "Rare", hits: ["Holo Rare", "Holo Rare V", "Holo Rare VMAX", "Ultra Rare", "Secret Rare"] },
    ],
    // Base Set: 5 commons, 2 energy, 3 uncommons, 1 rare that is holo about one pack in three.
    base: [
      { n: 5, pool: "Common" },
      { n: 2, pool: "Energy" },
      { n: 3, pool: "Uncommon" },
      { n: 1, pool: "Rare", hits: ["Holo Rare"] },
    ],
  };

  // Chance per pack of each hit pool, as "one in N packs".
  const PACKS = {
    "base1": { layout: "base", oneIn: { "Holo Rare": 3 } },
    "swsh7": { layout: "swsh", oneIn: { "Holo Rare": 5, "Holo Rare V": 7, "Holo Rare VMAX": 18, "Ultra Rare": 25, "Secret Rare": 45 } },
    "sv03.5": { layout: "sv", oneIn: { "Double rare": 8, "Ultra Rare": 16, "Illustration rare": 12, "Special illustration rare": 32, "Hyper rare": 51 } },
    "sv08": { layout: "sv", oneIn: { "Double rare": 6, "Ultra Rare": 15, "ACE SPEC Rare": 20, "Illustration rare": 13, "Special illustration rare": 87, "Hyper rare": 188 } },
    "sv08.5": { layout: "sv", oneIn: { "Double rare": 6, "Ultra Rare": 13, "ACE SPEC Rare": 21, "Special illustration rare": 45, "Hyper rare": 180 } },
    "sv10": { layout: "sv", oneIn: { "Double rare": 5, "Ultra Rare": 16, "Illustration rare": 12, "Special illustration rare": 94, "Hyper rare": 149 } },
  };

  // How exciting each pool is: 0 bulk, 1 rare, 2 hit, 3 big hit, 4 chase card.
  const RANK = {
    "Common": 0, "Uncommon": 0, "Energy": 0, "reverse": 0,
    "Rare": 1,
    "Holo Rare": 2, "Double rare": 2, "Holo Rare V": 2, "ACE SPEC Rare": 2,
    "Holo Rare VMAX": 3, "Ultra Rare": 3, "Illustration rare": 3,
    "Hyper rare": 4, "Secret Rare": 4, "Special illustration rare": 4,
  };
  const LABEL = {
    "Double rare": "Double Rare", "Illustration rare": "Illustration Rare",
    "Special illustration rare": "Special Illustration Rare", "Hyper rare": "Hyper Rare",
    "Holo Rare V": "Holo Rare V", "Holo Rare VMAX": "Holo Rare VMAX", "ACE SPEC Rare": "ACE SPEC",
  };

  const MARKUP = 1.3; // play price of a pack over its average pull value
  const MIN_PRICE = 4.99;

  const layoutOf = (set) => LAYOUTS[PACKS[set.id].layout];
  const has = (card, variant) => card.v.includes(variant);

  // Which pool a card is drawn from. Base Set files holo and non-holo rares, and its
  // basic energy, under shared rarities, so those are split here.
  function poolOf(set, card) {
    if (PACKS[set.id].layout === "base") {
      if (card.r === "Rare") return has(card, "h") ? "Holo Rare" : "Rare";
      if (card.r === "Common" && card.cat === "Energy") return "Energy";
    }
    return card.r;
  }

  // Cards of every pool, built once per set. Entries are indexes into set.cards.
  const poolCache = new Map();
  function pools(set) {
    let p = poolCache.get(set.id);
    if (p) return p;
    p = { reverse: [] };
    set.cards.forEach((card, i) => {
      const name = poolOf(set, card);
      (p[name] = p[name] || []).push(i);
      if (has(card, "r")) p.reverse.push(i);
    });
    poolCache.set(set.id, p);
    return p;
  }

  // The printing a card comes in when it is not in a reverse-holo slot.
  const printing = (card) => (has(card, "n") ? "n" : "h");

  // Market value of one printing: "n" normal, "h" holo, "r" reverse holo.
  function value(card, variant) {
    const p = card.p;
    const order = variant === "r" ? ["r", "n", "h"] : variant === "h" ? ["h", "n", "r"] : ["n", "h", "r"];
    for (const k of order) if (p[k] != null) return p[k];
    return 0;
  }

  // Chance that a slot lands on each pool, hits first and the fallback pool last.
  function slotChances(set, slot) {
    const p = pools(set), oneIn = PACKS[set.id].oneIn;
    const out = [];
    let left = 1;
    for (const name of slot.hits || []) {
      if (!oneIn[name] || !p[name]) continue;
      out.push([name, 1 / oneIn[name]]);
      left -= 1 / oneIn[name];
    }
    out.push([slot.pool, left]);
    return out;
  }

  function openPack(set, rng = Math.random) {
    const p = pools(set);
    const taken = new Set();
    const pulls = [];
    for (const slot of layoutOf(set)) {
      const chances = slotChances(set, slot);
      for (let k = 0; k < slot.n; k++) {
        let roll = rng(), name = slot.pool;
        for (const [pool, chance] of chances) {
          if (roll < chance) { name = pool; break; }
          roll -= chance;
        }
        const list = p[name];
        let i = list[Math.floor(rng() * list.length)];
        for (let tries = 0; taken.has(i) && tries < 20; tries++) i = list[Math.floor(rng() * list.length)];
        taken.add(i);
        const card = set.cards[i];
        const variant = name === "reverse" ? "r" : printing(card);
        const pool = name === "reverse" ? poolOf(set, card) : name;
        pulls.push({ i, variant, pool, rank: RANK[pool] || 0, value: value(card, variant) });
      }
    }
    return pulls;
  }

  const mean = (set, list, variantOf) => list.reduce((sum, i) => sum + value(set.cards[i], variantOf(set.cards[i])), 0) / list.length;
  const poolMean = (set, name) => mean(set, pools(set)[name], name === "reverse" ? () => "r" : printing);

  // Average market value of one pack's cards at these odds.
  function expectedValue(set) {
    let ev = 0;
    for (const slot of layoutOf(set)) {
      for (const [name, chance] of slotChances(set, slot)) ev += slot.n * chance * poolMean(set, name);
    }
    return ev;
  }

  function packPrice(set) {
    return Math.max(MIN_PRICE, Math.ceil(expectedValue(set) * MARKUP) - 0.01);
  }

  const packSize = (set) => layoutOf(set).reduce((n, slot) => n + slot.n, 0);

  // One row per hit pool for the odds table: chance per pack, card count, average and best card.
  function oddsTable(set) {
    const p = pools(set), rows = [];
    for (const slot of layoutOf(set)) {
      for (const [name, chance] of slotChances(set, slot)) {
        if (name === "reverse" || !(RANK[name] > 0) || !p[name]) continue;
        const best = p[name].reduce((a, b) => (value(set.cards[b], printing(set.cards[b])) > value(set.cards[a], printing(set.cards[a])) ? b : a));
        rows.push({ pool: name, rank: RANK[name], chance: chance * slot.n, count: p[name].length, avg: poolMean(set, name), best });
      }
    }
    return rows.sort((a, b) => a.rank - b.rank || b.chance - a.chance);
  }

  const label = (pool) => LABEL[pool] || pool;

  return { PACKS, RANK, openPack, expectedValue, packPrice, packSize, oddsTable, poolOf, printing, value, label };
})();

if (typeof module !== "undefined") module.exports = { Sim };
