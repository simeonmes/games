"use strict";
// Turns typed answers into lookup keys and finds them in a prompt's bank. Spelling slips are
// forgiven: "mozarella" finds mozzarella, "peaches" finds peach, "The Tempest" finds tempest.

const Match = (() => {
  function norm(s) {
    return s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\+\+/g, "pp").replace(/#/g, "sharp").replace(/&/g, " and ")
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ").trim()
      .replace(/^(the|a|an) /, "");
  }

  function singular(k) {
    if (k.length <= 3) return k;
    if (k.endsWith("ies") && k.length > 4) return k.slice(0, -3) + "y";
    if (/(ches|shes|xes|sses|oes)$/.test(k)) return k.slice(0, -2);
    if (k.endsWith("s") && !k.endsWith("ss") && !k.endsWith("us")) return k.slice(0, -1);
    return k;
  }

  const key = s => singular(norm(s).replace(/ /g, ""));

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // Builds { entries: [{ shown, tier }], index: Map(key -> entry) } for one prompt.
  // If an answer sits in two tiers, the more common tier wins.
  function build(tiers) {
    const entries = [], index = new Map(), clashes = [];
    for (const t of TIER_ORDER) {
      if (!tiers[t]) continue;
      for (const raw of tiers[t].split("|")) {
        const spellings = raw.split("/").map(x => x.trim()).filter(Boolean);
        if (!spellings.length) continue;
        const entry = { shown: spellings[0], tier: t };
        let added = false;
        for (const sp of spellings) {
          const k = key(sp);
          if (!k) continue;
          if (index.has(k)) {
            if (index.get(k) !== entry) clashes.push(`${sp} (${index.get(k).tier} vs ${t})`);
            continue;
          }
          index.set(k, entry);
          added = true;
        }
        if (added) entries.push(entry);
      }
    }
    return { entries, index, clashes };
  }

  // Returns the matching entry or null.
  function find(bank, typed) {
    const k = key(typed);
    if (!k) return null;
    if (bank.index.has(k)) return bank.index.get(k);
    if (k.length < 5) return null;
    const max = k.length >= 9 ? 2 : 1;
    let best = null, bestD = max + 1, tie = false;
    for (const [bk, entry] of bank.index) {
      if (bk.length < 4) continue;
      const d = lev(k, bk, max);
      if (d < bestD) { best = entry; bestD = d; tie = false; }
      else if (d === bestD && entry !== best) tie = true;
    }
    return bestD <= max && !tie ? best : null;
  }

  return { norm, key, build, find };
})();

if (typeof module !== "undefined") module.exports = Match;
