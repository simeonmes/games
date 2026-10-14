"use strict";
// Packs, payout odds and card values. Pure logic with no DOM access, so
// tools/verify.js can run it under Node.
//
// A pack holds one card (now and then a bonus card too). What it can hold depends only
// on the pack: every printing in the catalogue worth between the pack's minimum value and
// its maximum pull, sorted into payout ranges. The chosen pack style sets the chance of
// each range.

const Sim = (() => {
  // Payout chances in percent, one per range from cheapest to dearest. Every "Normal"
  // row and all the range edges are the figures shown by the app this game follows.
  // It publishes no figures here for High and Steady, so those two are reshaped from Normal.
  const round = (list) => list.map((v) => Math.round(v * 10) / 10);
  // Rescales the middle ranges so that, with the given lowest and top chances, the row adds up to 100.
  function reshape(normal, low, top) {
    const mid = normal.slice(1, -1), sum = mid.reduce((a, b) => a + b, 0);
    return round([low, ...mid.map((v) => (v * (100 - low - top)) / sum), top]);
  }
  // High: more of the lowest range and twice the top one. Steady: half the lowest, a third of the top.
  const styles = (normal) => {
    const low = normal[0], top = normal[normal.length - 1];
    return { normal, high: reshape(normal, Math.min(low * 1.3, low + 12), top * 2), steady: reshape(normal, low * 0.5, top / 3) };
  };

  // `ranges` are the dollar edges of the payout ranges: the first is the minimum value
  // and the last the maximum pull.
  const PACKS = [
    { id: "1", key: "starter", price: 1, name: "Starter", ranges: [0.1, 1, 2, 3, 4, 20],
      styles: { normal: [60, 29.6, 7.9, 1.9, 0.6], high: [71, 17, 6, 3, 3] } },
    { id: "2.5", key: "select", price: 2.5, name: "Select", ranges: [0.5, 1, 2.5, 3, 4, 5, 50],
      styles: styles([27, 23, 19.8, 19.5, 7, 3.7]) },
    { id: "5", key: "basic", price: 5, name: "Basic", ranges: [1, 2, 5, 6, 7, 9, 100], styles: styles([25.2, 24.8, 19.2, 12.9, 13.6, 4.2]) },
    { id: "10", key: "signature", price: 10, name: "Signature", ranges: [3, 5, 10, 15, 20, 25, 200], styles: styles([31.7, 18.3, 38.4, 8.8, 2.4, 0.3]) },
    { id: "25", key: "bronze", price: 25, name: "Bronze", ranges: [8, 10, 25, 30, 35, 45, 500], styles: styles([38.5, 11.5, 18.5, 14.3, 13.1, 4.1]) },
    { id: "50", key: "silver", price: 50, name: "Silver", ranges: [15, 20, 50, 55, 65, 80, 1000], styles: styles([11.9, 38.1, 13.6, 21.7, 11.4, 3.4]) },
    { id: "100", key: "gold", price: 100, name: "Gold", ranges: [30, 50, 100, 125, 150, 175, 2000], styles: styles([26.6, 23.4, 31.6, 11, 4.7, 2.7]) },
    { id: "250", key: "sapphire", price: 250, name: "Sapphire", ranges: [75, 100, 250, 275, 325, 425, 5000], styles: styles([20.3, 29.7, 13.5, 17.8, 13.9, 4.8]) },
    { id: "500", key: "amethyst", price: 500, name: "Amethyst", ranges: [150, 200, 500, 600, 650, 900, 10000], styles: styles([22.5, 27.5, 22.4, 8.7, 15.3, 3.5]) },
    { id: "1000", key: "ruby", price: 1000, name: "Ruby", ranges: [300, 400, 1000, 1150, 1300, 1700, 20000], styles: styles([22.5, 27.5, 18.1, 14.2, 12.7, 4.9]) },
  ];
  const packById = Object.fromEntries(PACKS.map((p) => [p.id, p]));

  const STYLES = {
    normal: { name: "Normal", text: "Reliable pulls with results close to the average value of a pack." },
    high: { name: "High", text: "Bigger swings: more low pulls, and more of the biggest ones." },
    steady: { name: "Steady", text: "Fewer surprises: most pulls land right around the pack price." },
  };

  // Bar colour of each range, counted from the top one down (the lowest is always grey),
  // and how loudly a pull from it is celebrated (0 to 4).
  const COLORS = ["gold", "red", "purple", "blue", "green"];
  const RANK = { grey: 0, green: 0, blue: 1, purple: 2, red: 3, gold: 4 };

  const BONUS_CHANCE = 0.05; // packs that carry a second card, drawn from the lowest range

  const PRINTING = { n: "Normal", h: "Holo", r: "Reverse holo", f: "1st Edition", F: "1st Edition holo" };

  let items = []; // every printing: { set, card, variant, value }, cheapest first
  const tables = new Map();

  // `data` is window.PACK_DATA from js/cards.js. Returns the sets by id, with each
  // card unpacked to { n, name, r, p, img }.
  function setup(data) {
    const sets = {};
    items = [];
    tables.clear();
    for (const s of data.sets) {
      const set = (sets[s.id] = { id: s.id, name: s.name, series: s.series, released: s.released, size: s.size, cards: [] });
      for (const [n, name, r, p, own] of s.cards) {
        const card = { n, name, r, p, img: own || s.img + "/" + n };
        set.cards.push(card);
        for (const variant in p) items.push({ set, card, variant, value: p[variant] });
      }
    }
    items.sort((a, b) => a.value - b.value);
    return sets;
  }

  const styleOf = (pack, style) => (pack.styles[style] ? style : "normal");

  // The payout ranges of a pack in one style, each with its chance and its cards.
  // A range the catalogue has no card for hands its chance to the nearest range below.
  function table(pack, style) {
    style = styleOf(pack, style);
    const key = pack.id + "|" + style;
    let t = tables.get(key);
    if (t) return t;
    const edges = pack.ranges, last = edges.length - 2, chances = pack.styles[style];
    const whole = chances.reduce((a, b) => a + b, 0); // the published figures are rounded, so not always 100
    let rows = [];
    for (let k = 0; k <= last; k++) {
      const lo = edges[k], hi = edges[k + 1];
      const list = items.filter((it) => it.value >= lo && (k === last ? it.value <= hi : it.value < hi));
      // Cards of a range are equally likely, except in the top one: it spans so much
      // that a card's chance there falls as its value rises (weight 1 / value).
      let sum = 0, total = 0;
      const cum = list.map((it) => { const w = k === last ? 1 / it.value : 1; total += w * it.value; return (sum += w); });
      const color = k ? COLORS[last - k] : "grey";
      rows.push({ lo, hi, list, cum, chance: chances[k] / whole, mean: list.length ? total / sum : 0, color, rank: RANK[color] });
    }
    for (let k = rows.length - 1; k >= 0; k--) {
      if (rows[k].list.length) continue;
      const to = rows.slice(0, k).reverse().find((r) => r.list.length) || rows.slice(k + 1).find((r) => r.list.length);
      if (to) to.chance += rows[k].chance;
    }
    rows = rows.filter((r) => r.list.length);
    const bonus = BONUS_CHANCE * rows[0].mean;
    t = { rows, ev: rows.reduce((s, r) => s + r.chance * r.mean, 0) + bonus };
    tables.set(key, t);
    return t;
  }

  function draw(row, rng) {
    const x = rng() * row.cum[row.cum.length - 1];
    let lo = 0, hi = row.cum.length - 1;
    while (lo < hi) { // binary search of the cumulative weights
      const mid = (lo + hi) >> 1;
      if (row.cum[mid] > x) hi = mid; else lo = mid + 1;
    }
    const it = row.list[lo];
    return { set: it.set, card: it.card, variant: it.variant, value: it.value, rank: row.rank, color: row.color, bonus: false };
  }

  // The cards of one pack: the pull, and sometimes a bonus card after it.
  function open(pack, style, rng = Math.random) {
    const { rows } = table(pack, style);
    let roll = rng(), row = rows[rows.length - 1];
    for (const r of rows) {
      if (roll < r.chance) { row = r; break; }
      roll -= r.chance;
    }
    const pulls = [draw(row, rng)];
    if (rng() < BONUS_CHANCE) pulls.push({ ...draw(rows[0], rng), bonus: true });
    return pulls;
  }

  // What the shop and the pack-style sheet show for a pack.
  function odds(pack, style) {
    const { rows, ev } = table(pack, style);
    const top = rows[rows.length - 1], best = top.list[top.list.length - 1], cap = pack.ranges[pack.ranges.length - 1];
    return {
      rows: rows.map((r) => ({ lo: r.lo, hi: r.hi, chance: r.chance, color: r.color, count: r.list.length, mean: r.mean })),
      ev,
      win: rows.reduce((s, r) => s + (r.lo >= pack.price ? r.chance : 0), 0),
      min: pack.ranges[0],
      // The maximum pull is the pack's ceiling, or the dearest card under it when
      // the catalogue stops well short of that.
      max: best.value >= cap * 0.95 ? cap : best.value,
      best,
    };
  }

  // The dearest cards a pack can pay out, one printing per card.
  function inside(pack, n) {
    const lo = pack.ranges[0], hi = pack.ranges[pack.ranges.length - 1];
    const out = [], seen = new Set();
    for (let i = items.length - 1; i >= 0 && out.length < n; i--) {
      const it = items[i];
      if (it.value > hi || seen.has(it.card)) continue;
      if (it.value < lo) break;
      seen.add(it.card);
      out.push(it);
    }
    return out;
  }

  const poolSize = (pack) => { const e = pack.ranges; return items.filter((it) => it.value >= e[0] && it.value <= e[e.length - 1]).length; };
  const count = () => items.length;

  return { PACKS, STYLES, PRINTING, BONUS_CHANCE, packById, styleOf, setup, open, odds, inside, poolSize, count };
})();

if (typeof module !== "undefined") module.exports = { Sim };
