"use strict";
// Game flow: the shop, tearing a pack and flipping its cards, the keep-or-sell summary,
// the binder, the stats page and saves. All money here is play money.

const SAVE_KEY = "packrips-fan-v1";
const START_CASH = 100;
const TOP_UP = 100;
const BULK = 1; // "sell bulk" sells cards worth less than this

// Shop order, and the hue of each set's pack wrapper.
const SHELF = [["sv03.5", 352], ["sv08.5", 285], ["sv10", 12], ["sv08", 46], ["swsh7", 200], ["base1", 225]];
const HUE = Object.fromEntries(SHELF);
const PRINTING = { n: "Normal", h: "Holo", r: "Reverse holo" };
const SETS = window.PACK_SETS;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (v < -0.004 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v) => (v >= 0 ? "+" : "") + money(v);
const cents = (v) => Math.round(v * 100) / 100; // keeps the balance free of float drift
const oneIn = (chance) => (chance >= 0.95 ? "most packs" : "1 in " + (1 / chance).toFixed(1).replace(/\.0$/, ""));

const game = {
  cash: START_CASH,
  added: 0, // free top-ups taken
  spent: 0, // on packs
  sold: 0, // from selling cards
  pulled: 0, // market value of everything pulled
  packs: {}, // set id -> packs opened
  hits: {}, // pool -> cards pulled, for the stats page
  best: null, // { set, n, variant, value }
  owned: {}, // set id -> { "number|printing": count }
  view: "shop",
  binderSet: SHELF[0][0],
  ownedOnly: false,
};
let rip = null; // the pack being opened: { set, price, pulls, i, shown, sell }

// ------------------------------------------------------------------ saves

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) { /* storage unavailable */ }
  if (!s || s.v !== 1) return;
  for (const k of ["cash", "added", "spent", "sold", "pulled"]) if (typeof s[k] === "number" && isFinite(s[k])) game[k] = s[k];
  for (const k of ["packs", "hits", "owned"]) if (s[k] && typeof s[k] === "object") game[k] = s[k];
  if (s.best && SETS[s.best.set]) game.best = s.best;
  if (SETS[s.binderSet]) game.binderSet = s.binderSet;
  game.ownedOnly = !!s.ownedOnly;
  Sound.setMuted(!!s.muted);
}

function writeSave() {
  const { cash, added, spent, sold, pulled, packs, hits, best, owned, binderSet, ownedOnly } = game;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, cash, added, spent, sold, pulled, packs, hits, best, owned, binderSet, ownedOnly, muted: Sound.muted }));
  } catch (_) { /* storage unavailable */ }
}

// ------------------------------------------------------------------ collection

const byNumber = {};
function cardOf(setId, n) {
  if (!byNumber[setId]) byNumber[setId] = new Map(SETS[setId].cards.map((c) => [c.n, c]));
  return byNumber[setId].get(n);
}

function addCard(setId, n, variant) {
  const o = (game.owned[setId] = game.owned[setId] || {});
  o[n + "|" + variant] = (o[n + "|" + variant] || 0) + 1;
}

// Sells one copy and returns what it fetched (0 if there was none to sell).
function sellCard(setId, n, variant) {
  const o = game.owned[setId], key = n + "|" + variant;
  if (!o || !o[key]) return 0;
  if (--o[key] === 0) delete o[key];
  const v = Sim.value(cardOf(setId, n), variant);
  game.cash = cents(game.cash + v);
  game.sold = cents(game.sold + v);
  return v;
}

// Every printing held of a set: [card, printing, count, value of one copy].
function holdings(setId) {
  const out = [];
  for (const [key, count] of Object.entries(game.owned[setId] || {})) {
    const [n, variant] = key.split("|");
    const card = cardOf(setId, n);
    if (card) out.push([card, variant, count, Sim.value(card, variant)]);
  }
  return out;
}

function setSummary(setId) {
  const held = holdings(setId);
  return {
    unique: new Set(held.map(([card]) => card.n)).size,
    value: held.reduce((sum, [, , count, v]) => sum + count * v, 0),
    spare: held.reduce((sum, [, , count, v]) => sum + (count - 1) * v, 0),
  };
}

const collectionValue = () => SHELF.reduce((sum, [id]) => sum + setSummary(id).value, 0);

// ------------------------------------------------------------------ shared pieces

function cardImg(card, size) {
  if (!card.img) return `<span class="noimg">${esc(card.name)}</span>`;
  return `<img class="ci" loading="lazy" decoding="async" src="${esc(card.img)}/${size}.webp" alt="${esc(card.name)}">`;
}

const packHTML = (set, extra = "") =>
  `<span class="pack ${extra}" style="--h:${HUE[set.id]}"><span class="pk-series">${esc(set.series)}</span>` +
  `<span class="pk-name">${esc(set.name)}</span><span class="pk-count">${Sim.packSize(set)} cards</span></span>`;

const rarityTag = (pull) => `<span class="tag r${pull.rank}">${esc(Sim.label(pull.pool))}${pull.variant === "r" ? " · reverse" : ""}</span>`;

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}

function updateWallet() {
  $("cash").textContent = money(game.cash);
  $("mute").textContent = Sound.muted ? "🔇" : "🔊";
}

function openModal(html) {
  $("sheet").innerHTML = `<button class="x" data-act="close" title="Close">✕</button>` + html;
  $("modal").classList.remove("hidden");
}
const closeModal = () => $("modal").classList.add("hidden");

function show(view) {
  game.view = view;
  for (const v of ["shop", "binder", "stats"]) $(v).classList.toggle("hidden", v !== view);
  for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("on", tab.dataset.view === view);
  ({ shop: renderShop, binder: renderBinder, stats: renderStats })[view]();
  updateWallet();
}

// ------------------------------------------------------------------ shop

function renderShop() {
  const tiles = SHELF.map(([id]) => {
    const set = SETS[id];
    const chase = set.cards.map((c) => [Sim.value(c, Sim.printing(c)), c]).sort((a, b) => b[0] - a[0]).slice(0, 2);
    const pct = Math.round((100 * setSummary(id).unique) / set.cards.length);
    return `<article class="tile" style="--h:${HUE[id]}">
      <div class="tile-art"><div class="fan">${chase.map(([, c]) => cardImg(c, "low")).join("")}</div>${packHTML(set)}</div>
      <h2>${esc(set.name)}</h2>
      <p class="sub">${esc(set.series)} · ${set.released.slice(0, 4)} · ${set.cards.length} cards</p>
      <div class="nums">
        <div><b>${money(Sim.packPrice(set))}</b><span>play price</span></div>
        <div><b>${money(Sim.expectedValue(set))}</b><span>average pull</span></div>
        <div><b>${pct}%</b><span>collected</span></div>
      </div>
      <div class="row">
        <button class="btn primary" data-act="rip" data-set="${id}">RIP A PACK</button>
        <button class="btn" data-act="odds" data-set="${id}">Odds</button>
      </div>
    </article>`;
  });
  $("shop").innerHTML = `<p class="intro">Open packs of real cards with play money. Every pull is rolled at realistic odds and valued at its market price, so you can see how ripping packs really goes.</p><div class="shelf">${tiles.join("")}</div>`;
}

function showOdds(setId) {
  const set = SETS[setId], price = Sim.packPrice(set), ev = Sim.expectedValue(set);
  const rows = Sim.oddsTable(set).map((r) =>
    `<tr><td><span class="tag r${r.rank}">${esc(Sim.label(r.pool))}</span></td><td>${oneIn(r.chance)}</td><td>${r.count}</td><td>${money(r.avg)}</td></tr>`);
  openModal(`<h2>${esc(set.name)} odds</h2>
    <p>A ${Sim.packSize(set)}-card pack costs ${money(price)} in play money and returns ${money(ev)} on average, which is ${Math.round((100 * ev) / price)}% of its price. Most packs return far less; a few return far more.</p>
    <table><tr><th>Rarity</th><th>Chance per pack</th><th>Cards</th><th>Average value</th></tr>${rows.join("")}</table>
    <p>Odds are approximations of community-reported pull rates, not official figures. Prices are a market snapshot from ${esc(set.priced)}.</p>`);
}

// ------------------------------------------------------------------ ripping a pack

function buy(setId) {
  const set = SETS[setId], price = Sim.packPrice(set);
  if (game.cash < price) {
    toast("Not enough play money. Top up for free.");
    const b = $("topup");
    b.classList.remove("nudge");
    void b.offsetWidth; // restart the animation
    b.classList.add("nudge");
    return;
  }
  game.cash = cents(game.cash - price);
  game.spent = cents(game.spent + price);
  game.packs[setId] = (game.packs[setId] || 0) + 1;
  const pulls = Sim.openPack(set);
  // The cards go into the binder straight away, so closing the tab mid-pack loses nothing.
  for (const p of pulls) {
    const card = set.cards[p.i];
    addCard(setId, card.n, p.variant);
    game.pulled = cents(game.pulled + p.value);
    if (p.rank >= 2 && p.variant !== "r") game.hits[p.pool] = (game.hits[p.pool] || 0) + 1;
    if (!game.best || p.value > game.best.value) game.best = { set: setId, n: card.n, variant: p.variant, value: p.value };
  }
  writeSave();
  updateWallet();
  rip = { set, price, pulls, i: 0, shown: false, sell: new Set() };
  $("rip").classList.remove("hidden");
  $("rip").innerHTML = `<button class="btn skip" data-act="skip">Skip</button>
    <div class="stage"><button data-act="tear" title="Tear open">${packHTML(set, "big")}</button><p class="hint">Tap the pack to tear it open</p></div>`;
}

function tear() {
  const pack = $("rip").querySelector(".pack");
  if (!pack || pack.classList.contains("torn")) return;
  pack.classList.add("torn");
  Sound.tear();
  setTimeout(() => { if (rip && $("rip").contains(pack)) showCard(); }, 620); // unless skipped meanwhile
}

function showCard() {
  const p = rip.pulls[rip.i], card = rip.set.cards[p.i];
  rip.shown = false;
  $("rip").innerHTML = `<button class="btn skip" data-act="skip">Reveal all</button>
    <div class="stage">
      <div class="counter">${rip.i + 1} / ${rip.pulls.length}</div>
      <button class="flip r${p.rank}" data-act="flip" title="Flip"><span class="inner"><span class="face back"></span><span class="face front">${cardImg(card, "high")}</span></span></button>
      <div class="cap" id="cap"><span class="hint">Tap the card to flip it</span></div>
    </div>`;
  const next = rip.pulls[rip.i + 1];
  if (next && rip.set.cards[next.i].img) new Image().src = rip.set.cards[next.i].img + "/high.webp";
}

function flip() {
  if (!rip) return;
  if (rip.shown) {
    rip.i++;
    return rip.i < rip.pulls.length ? showCard() : showSummary();
  }
  const p = rip.pulls[rip.i], card = rip.set.cards[p.i];
  rip.shown = true;
  $("rip").querySelector(".flip").classList.add("shown");
  $("cap").innerHTML = `<span class="nm">${esc(card.name)}</span>${rarityTag(p)}<span class="val">${money(p.value)}</span>`;
  Sound.flip();
  Sound.hit(p.rank);
}

function showSummary() {
  const total = rip.pulls.reduce((sum, p) => sum + p.value, 0), diff = total - rip.price;
  const order = rip.pulls.map((p, k) => k).sort((a, b) => rip.pulls[b].value - rip.pulls[a].value);
  const cells = order.map((k) => {
    const p = rip.pulls[k], card = rip.set.cards[p.i], sell = rip.sell.has(k);
    return `<button class="pull r${p.rank}${sell ? " sell" : ""}" data-act="toggle" data-k="${k}" title="${esc(card.name)}">
      ${cardImg(card, "low")}${rarityTag(p)}<span class="val">${money(p.value)}</span><span class="state">${sell ? "SELL" : "KEEP"}</span></button>`;
  });
  const selling = [...rip.sell].reduce((sum, k) => sum + rip.pulls[k].value, 0);
  $("rip").innerHTML = `<div class="summary">
    <h2>This pack pulled ${money(total)}<small class="${diff >= 0 ? "pos" : "neg"}">${signed(diff)} against the ${money(rip.price)} pack</small></h2>
    <div class="pulls">${cells.join("")}</div>
    <p class="hint" style="text-align:center">Tap a card to switch between keeping and selling it.${selling ? ` Selling ${rip.sell.size} for ${money(selling)}.` : ""}</p>
    <div class="row">
      <button class="btn" data-act="keepall">Keep all</button>
      <button class="btn" data-act="sellbulk">Sell under ${money(BULK)}</button>
      <button class="btn" data-act="sellall">Sell all</button>
    </div>
    <div class="row">
      <button class="btn primary" data-act="again">RIP ANOTHER · ${money(rip.price)}</button>
      <button class="btn" data-act="done">Done</button>
    </div>
  </div>`;
}

function markSales(pick) {
  rip.sell = new Set(rip.pulls.map((p, k) => k).filter((k) => pick(rip.pulls[k])));
  showSummary();
}

function finishRip(again) {
  const setId = rip.set.id;
  let got = 0;
  for (const k of rip.sell) got += sellCard(setId, rip.set.cards[rip.pulls[k].i].n, rip.pulls[k].variant);
  if (got) { Sound.coin(); toast(`Sold ${rip.sell.size} card${rip.sell.size > 1 ? "s" : ""} for ${money(got)}`); }
  rip = null;
  $("rip").classList.add("hidden");
  $("rip").innerHTML = "";
  writeSave();
  show(game.view);
  if (again) buy(setId);
}

// ------------------------------------------------------------------ binder

function renderBinder() {
  const id = game.binderSet, set = SETS[id], sum = setSummary(id);
  const counts = {};
  for (const [card, variant, count, v] of holdings(id)) {
    const c = (counts[card.n] = counts[card.n] || { count: 0, best: 0 });
    c.count += count;
    c.best = Math.max(c.best, v);
  }
  const bar = SHELF.map(([sid]) =>
    `<button class="chip${sid === id ? " on" : ""}" data-act="bset" data-set="${sid}">${esc(SETS[sid].name)} · ${setSummary(sid).unique}/${SETS[sid].cards.length}</button>`);
  const cells = set.cards.filter((c) => !game.ownedOnly || counts[c.n]).map((c) => {
    const own = counts[c.n];
    if (!own) return `<div class="cell missing"><span>#${esc(c.n)}</span><span>${esc(c.name)}</span></div>`;
    return `<button class="cell" data-act="card" data-n="${esc(c.n)}" title="${esc(c.name)}">${cardImg(c, "low")}` +
      `${own.count > 1 ? `<i class="cnt">×${own.count}</i>` : ""}<span class="val">${money(own.best)}</span></button>`;
  });
  $("binder").innerHTML = `<div class="setbar">${bar.join("")}</div>
    <div class="bhead">
      <h2>${esc(set.name)}</h2>
      <span class="meta">${sum.unique} of ${set.cards.length} cards · worth ${money(sum.value)}</span>
      <label><input type="checkbox" id="ownedOnly"${game.ownedOnly ? " checked" : ""}> Owned only</label>
      ${sum.spare > 0.004 ? `<button class="btn" data-act="dupes">Sell duplicates · ${money(sum.spare)}</button>` : ""}
    </div>
    <div class="bar"><i style="width:${(100 * sum.unique) / set.cards.length}%"></i></div>
    ${cells.length ? `<div class="pages">${cells.join("")}</div>` : `<p class="empty">No cards from this set yet. Rip a pack in the shop.</p>`}`;
}

function showCardDetail(n) {
  const id = game.binderSet, set = SETS[id], card = cardOf(id, n);
  const rows = holdings(id).filter(([c]) => c.n === n).map(([, variant, count, v]) =>
    `<div class="own"><span>${PRINTING[variant]} ×${count}</span><b>${money(v)}</b><button class="btn" data-act="sell1" data-n="${esc(n)}" data-v="${variant}">Sell 1</button></div>`);
  if (!rows.length) return closeModal();
  const pool = Sim.poolOf(set, card);
  openModal(`<div class="detail">${cardImg(card, "high")}<div>
    <h2>${esc(card.name)}</h2>
    <p><span class="tag r${Sim.RANK[pool] || 0}">${esc(Sim.label(pool))}</span><br>${esc(set.name)} · #${esc(card.n)} of ${set.official}</p>
    ${rows.join("")}</div></div>`);
}

function sellDuplicates() {
  const id = game.binderSet;
  let got = 0, n = 0;
  for (const [card, variant, count] of holdings(id)) {
    for (let k = 1; k < count; k++) { got += sellCard(id, card.n, variant); n++; }
  }
  if (!n) return;
  Sound.coin();
  toast(`Sold ${n} duplicate${n > 1 ? "s" : ""} for ${money(got)}`);
  writeSave();
  show("binder");
}

// ------------------------------------------------------------------ stats

function renderStats() {
  const packs = Object.values(game.packs).reduce((a, b) => a + b, 0);
  const held = collectionValue(), putIn = START_CASH + game.added, net = game.cash + held - putIn;
  const stat = (v, label, cls = "") => `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`;

  // What these odds should have produced over the packs opened so far.
  const expected = {};
  for (const [id] of SHELF) {
    const n = game.packs[id] || 0;
    if (!n) continue;
    for (const r of Sim.oddsTable(SETS[id])) if (r.rank >= 2) expected[r.pool] = (expected[r.pool] || 0) + n * r.chance;
  }
  const hitRows = Object.keys(expected).sort((a, b) => Sim.RANK[a] - Sim.RANK[b] || expected[b] - expected[a]).map((pool) =>
    `<tr><td><span class="tag r${Sim.RANK[pool]}">${esc(Sim.label(pool))}</span></td><td>${game.hits[pool] || 0}</td><td>${expected[pool].toFixed(1)}</td></tr>`);

  let best = `<p class="empty">Nothing pulled yet.</p>`;
  if (game.best && cardOf(game.best.set, game.best.n)) {
    const c = cardOf(game.best.set, game.best.n);
    best = `${cardImg(c, "low")}<p><b>${esc(c.name)}</b><br><span class="tag">${esc(SETS[game.best.set].name)} · ${PRINTING[game.best.variant]}</span><br>${money(game.best.value)}</p>`;
  }

  $("stats").innerHTML = `<div class="tiles">
      ${stat(`<span class="${net >= 0 ? "pos" : "neg"}">${signed(net)}</span>`, `Overall result: you put in ${money(putIn)} of play money and now hold ${money(game.cash + held)} in cash and cards`, "big")}
      ${stat(packs, "packs opened")}
      ${stat(money(game.spent), "spent on packs")}
      ${stat(money(game.pulled), "market value pulled")}
      ${stat(game.spent ? Math.round((100 * game.pulled) / game.spent) + "%" : "–", "of pack spending pulled back")}
      ${stat(money(game.sold), "from selling cards")}
      ${stat(money(held), "cards in the binder")}
    </div>
    <div class="split">
      <div><h3>Best pull</h3>${best}</div>
      <div><h3>Hits against the odds</h3>
        ${hitRows.length ? `<table><tr><th>Rarity</th><th>Pulled</th><th>Expected</th></tr>${hitRows.join("")}</table>` : `<p class="empty">Open a pack to start counting.</p>`}
      </div>
    </div>
    <div class="row"><button class="btn danger" data-act="reset">Reset everything</button></div>`;
}

// ------------------------------------------------------------------ input

const ACTIONS = {
  view: (t) => show(t.dataset.view),
  rip: (t) => buy(t.dataset.set),
  odds: (t) => showOdds(t.dataset.set),
  close: closeModal,
  topup() { game.cash += TOP_UP; game.added += TOP_UP; Sound.coin(); toast(`Added ${money(TOP_UP)} of play money`); writeSave(); show(game.view); },
  mute() { Sound.setMuted(!Sound.muted); writeSave(); updateWallet(); },
  tear,
  flip,
  skip() { if (rip) showSummary(); },
  toggle(t) { const k = Number(t.dataset.k); if (!rip.sell.delete(k)) rip.sell.add(k); showSummary(); },
  keepall: () => markSales(() => false),
  sellall: () => markSales(() => true),
  sellbulk: () => markSales((p) => p.value < BULK),
  again: () => finishRip(true),
  done: () => finishRip(false),
  bset(t) { game.binderSet = t.dataset.set; writeSave(); renderBinder(); },
  card: (t) => showCardDetail(t.dataset.n),
  dupes: sellDuplicates,
  sell1(t) {
    Sound.coin();
    toast(`Sold for ${money(sellCard(game.binderSet, t.dataset.n, t.dataset.v))}`);
    writeSave();
    show("binder");
    showCardDetail(t.dataset.n);
  },
  reset() {
    if (!confirm("Reset your play money, binder and stats?")) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* storage unavailable */ }
    location.reload();
  },
};

document.addEventListener("click", (e) => {
  if (e.target.id === "modal") return closeModal();
  const t = e.target.closest("[data-act]");
  if (t && ACTIONS[t.dataset.act]) ACTIONS[t.dataset.act](t);
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "ownedOnly") return;
  game.ownedOnly = e.target.checked;
  writeSave();
  renderBinder();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closeModal();
  if (!rip || (e.key !== " " && e.key !== "Enter")) return;
  if ($("rip").querySelector(".summary")) return; // let buttons there work as usual
  e.preventDefault();
  if ($("rip").querySelector(".flip")) flip(); else tear();
});

// A card image that fails to load is tried once more, then becomes a labelled placeholder.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!img.classList || !img.classList.contains("ci")) return;
  if (!img.dataset.retried) {
    img.dataset.retried = "1";
    const src = img.src;
    setTimeout(() => { img.src = src; }, 1500);
    return;
  }
  const span = document.createElement("span");
  span.className = "noimg";
  span.textContent = img.alt;
  img.replaceWith(span);
}, true);

loadSave();
show("shop");
