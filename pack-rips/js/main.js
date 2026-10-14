"use strict";
// Game flow: the pack carousel, pack styles, opening a pack and selling or vaulting its
// card, the showroom, the collection, the daily reward, the account page and saves.
// All money here is play money.

const SAVE_KEY = "packrips-fan-v2";
const START_CASH = 10; // all the money there is: it cannot be topped up
const DAILY = Sim.PACKS[0]; // one of these is free every day
const RECENT = 40; // pulls remembered for the showroom

const SETS = Sim.setup(window.PACK_DATA);
const SET_IDS = Object.keys(SETS);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (v < -0.004 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Pack figures drop the cents when there are none: "$1", "$2.50", "$1,000".
const short = (v) => "$" + (v >= 100 ? Math.round(v) : v).toLocaleString("en-US", { minimumFractionDigits: v < 100 && v % 1 ? 2 : 0 });
const signed = (v) => (v >= 0 ? "+" : "") + money(v);
const cents = (v) => Math.round(v * 100) / 100; // keeps the balance free of float drift
const pct = (chance) => parseFloat((100 * chance).toFixed(1)) + "%";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

const game = {
  cash: START_CASH,
  spent: 0, // on packs
  sold: 0, // from selling cards
  pulled: 0, // market value of everything pulled
  packs: {}, // pack id -> packs opened, free ones included
  free: 0, // daily packs opened
  best: null, // { set, n, variant, value }
  recent: [], // newest first: { set, n, variant, value, pack, cost }
  owned: {}, // set id -> { "number|printing": count }
  daily: "", // the day the last free pack was opened
  styles: {}, // pack id -> chosen pack style
  pack: DAILY.id, // the pack in the middle of the carousel
  view: "packs",
  binderSet: "", // "" shows every card owned
};
let rip = null; // the pack being opened: { pack, cost, pulls, i }, each pull with a `done` of "sold" or "vault"
let look = null; // the collection card on screen: { set, n, variant }
let styleDraft = null; // the style picked on the pack-style sheet, before Apply

// ------------------------------------------------------------------ saves

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) { /* storage unavailable */ }
  if (!s || s.v !== 2) return;
  for (const k of ["cash", "spent", "sold", "pulled", "free"]) if (typeof s[k] === "number" && isFinite(s[k])) game[k] = s[k];
  for (const k of ["packs", "owned", "styles"]) if (s[k] && typeof s[k] === "object") game[k] = s[k];
  if (s.best && SETS[s.best.set]) game.best = s.best;
  if (Array.isArray(s.recent)) game.recent = s.recent.filter((r) => r && SETS[r.set] && Sim.packById[r.pack]);
  if (typeof s.daily === "string") game.daily = s.daily;
  if (Sim.packById[s.pack]) game.pack = s.pack;
  if (SETS[s.binderSet]) game.binderSet = s.binderSet;
  Sound.setMuted(!!s.muted);
}

function writeSave() {
  const { cash, spent, sold, pulled, packs, free, best, recent, owned, daily, styles, pack, binderSet } = game;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, cash, spent, sold, pulled, packs, free, best, recent, owned, daily, styles, pack, binderSet, muted: Sound.muted }));
  } catch (_) { /* storage unavailable */ }
}

// ------------------------------------------------------------------ collection

const byNumber = {};
function cardOf(setId, n) {
  if (!SETS[setId]) return null;
  if (!byNumber[setId]) byNumber[setId] = new Map(SETS[setId].cards.map((c) => [c.n, c]));
  return byNumber[setId].get(n);
}

function addCard(setId, n, variant) {
  const o = (game.owned[setId] = game.owned[setId] || {});
  o[n + "|" + variant] = (o[n + "|" + variant] || 0) + 1;
}

const copies = (setId, n, variant) => (game.owned[setId] && game.owned[setId][n + "|" + variant]) || 0;

// Sells one copy and returns what it fetched (0 if there was none to sell).
function sellCard(setId, n, variant) {
  const o = game.owned[setId], key = n + "|" + variant, card = cardOf(setId, n);
  if (!o || !o[key] || !card) return 0;
  if (--o[key] === 0) delete o[key];
  const v = card.p[variant] || 0;
  game.cash = cents(game.cash + v);
  game.sold = cents(game.sold + v);
  return v;
}

// Every printing held of a set: { set, card, variant, count, value of one copy }.
function holdings(setId) {
  const out = [];
  for (const [key, count] of Object.entries(game.owned[setId] || {})) {
    const [n, variant] = key.split("|");
    const card = cardOf(setId, n);
    if (card && card.p[variant] != null) out.push({ set: SETS[setId], card, variant, count, value: card.p[variant] });
  }
  return out;
}

const allHoldings = () => Object.keys(game.owned).flatMap(holdings);
const worth = (held) => held.reduce((sum, h) => sum + h.count * h.value, 0);
const uniqueCards = (setId) => new Set(holdings(setId).map((h) => h.card.n)).size;

// ------------------------------------------------------------------ shared pieces

function cardImg(card, size) {
  return `<img class="ci" loading="lazy" decoding="async" src="${esc(card.img)}/${size}.webp" alt="${esc(card.name)}">`;
}

// The wrapper is an original design; js/style.css colours it per pack.
const packHTML = (pack) =>
  `<span class="pack p-${pack.key}"><i class="crimp"></i><span class="pk-mark">PR</span><span class="pk-tag">PLAY MONEY</span>` +
  `<span class="pk-word">PACK RIPS</span><span class="pk-orb"></span><span class="pk-label">POKÉMON <b>${esc(pack.name.toUpperCase())} PACK</b></span><i class="crimp"></i></span>`;

const styleOf = (pack) => Sim.styleOf(pack, game.styles[pack.id]);

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

const updateWallet = () => { $("cash").textContent = money(game.cash); };

function openModal(html) {
  $("sheet").innerHTML = `<button class="round x" data-act="close" title="Close">✕</button>` + html;
  $("modal").classList.remove("hidden");
}
const closeModal = () => $("modal").classList.add("hidden");

const VIEWS = { packs: renderPacks, showroom: renderShowroom, collection: renderCollection, rewards: renderRewards, account: renderAccount };

function show(view) {
  game.view = view;
  for (const v in VIEWS) $(v).classList.toggle("hidden", v !== view);
  for (const tab of document.querySelectorAll("#nav button")) tab.classList.toggle("on", tab.dataset.view === view);
  $("nav").classList.toggle("dot", dailyReady());
  VIEWS[view]();
  updateWallet();
}

// ------------------------------------------------------------------ packs

function renderPacks() {
  if (!$("rail")) {
    $("packs").innerHTML = `<div class="rail" id="rail">${Sim.PACKS.map((p) => `<button class="slot" data-act="pick" data-pack="${p.id}">${packHTML(p)}</button>`).join("")}</div><div id="info"></div>`;
    $("rail").addEventListener("scroll", onRail, { passive: true });
  }
  centre(false);
  renderInfo();
}

const slotOf = (id) => $("rail").querySelector(`[data-pack="${id}"]`);

// Brings the chosen pack to the middle of the carousel.
function centre(smooth) {
  const rail = $("rail"), slot = slotOf(game.pack);
  rail.scrollTo({ left: slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2, behavior: smooth ? "smooth" : "instant" });
}

// Whichever pack is nearest the middle of the carousel becomes the chosen one.
let railFrame = 0;
function onRail() {
  if (railFrame) return;
  railFrame = requestAnimationFrame(() => {
    railFrame = 0;
    const rail = $("rail"), mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = null, gap = Infinity;
    for (const slot of rail.children) {
      const d = Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - mid);
      if (d < gap) { gap = d; best = slot; }
    }
    if (best && best.dataset.pack !== game.pack) { game.pack = best.dataset.pack; renderInfo(); }
  });
}

function renderInfo() {
  const pack = Sim.packById[game.pack], style = styleOf(pack), o = Sim.odds(pack, style);
  for (const slot of $("rail").children) slot.classList.toggle("on", slot.dataset.pack === pack.id);
  $("info").innerHTML = `<h2>Pokémon ${esc(pack.name)} Pack</h2>
    <button class="inside" data-act="inside"><svg viewBox="0 0 24 24"><path d="M1.5 12S5.5 5 12 5s10.500 7 10.500 7-4 7-10.500 7S1.500 12 1.500 12Z"/><circle cx="12" cy="12" r="3.200"/></svg>What's inside</button>
    <div class="facts">
      <div class="side"><span>Min Value</span><b>${short(o.min)}</b></div>
      <div class="mid"><span>Max Pull</span><b>${short(o.max)}</b></div>
      <button class="side" data-act="style"><span>Pack style</span><b>${Sim.STYLES[style].name} ›</b></button>
    </div>
    <button class="buy b-${pack.key}${game.cash < pack.price ? " short" : ""}" data-act="buy">Buy for ${short(pack.price)}</button>`;
}

function pick(id) {
  game.pack = id;
  centre(true);
  renderInfo();
}

// The pack next to the chosen one, for the arrow keys.
function step(d) {
  const i = Sim.PACKS.findIndex((p) => p.id === game.pack) + d;
  if (Sim.PACKS[i]) pick(Sim.PACKS[i].id);
}

function showInside() {
  const pack = Sim.packById[game.pack], o = Sim.odds(pack, styleOf(pack));
  const cells = Sim.inside(pack, 30).map((it) => `<div class="cell">${cardImg(it.card, "low")}<span class="val">${money(it.value)}</span></div>`);
  openModal(`<h2>What's inside</h2>
    <p>The Pokémon ${esc(pack.name)} Pack draws from ${Sim.poolSize(pack).toLocaleString("en-US")} cards worth ${short(o.min)} to ${short(o.max)}. These are the best of them.</p>
    <div class="grid3">${cells.join("")}</div>`);
}

function showStyle() {
  const pack = Sim.packById[game.pack];
  const style = styleDraft || styleOf(pack), o = Sim.odds(pack, style);
  const widest = Math.max(...o.rows.map((r) => r.chance));
  const pills = Object.keys(pack.styles).map((s) => `<button class="pill${s === style ? " on" : ""}" data-act="draft" data-style="${s}">${Sim.STYLES[s].name}</button>`);
  const bars = o.rows.map((r) =>
    `<div class="odd"><span class="rng">${short(r.lo)} - ${short(r.hi)}</span><span class="track"><i class="c-${r.color}" style="width:${Math.max(1, (100 * r.chance) / widest)}%"></i></span><b>${pct(r.chance)}</b></div>`);
  openModal(`<div class="st-head"><span class="st-icon p-${pack.key}"></span><div><h2>${Sim.STYLES[style].name}</h2><p>${Sim.STYLES[style].text}</p></div></div>
    <div class="rule"><span>Choose your pack style</span></div>
    <div class="pills">${pills.join("")}</div>
    <h3>Estimated Payout Odds:</h3>
    <div class="odds">${bars.join("")}</div>
    <div class="span"><span>Min Value</span><b>${short(o.min)}</b><i></i><b>${short(o.max)}</b><span>Max Pull</span></div>
    <p class="fine">Every card can be sold back at <b>100%</b> of its market value. A pack in this style pays back ${money(o.ev)} on average and beats its price ${pct(o.win)} of the time. About 1 pack in ${Math.round(1 / Sim.BONUS_CHANCE)} also holds a bonus card.</p>
    <button class="buy" data-act="apply">Apply</button>`);
}

// ------------------------------------------------------------------ opening a pack

const dailyReady = () => game.daily !== today();

function buy(pack, free) {
  if (rip) return;
  if (free) {
    if (!dailyReady()) return;
    game.daily = today();
    game.free++;
  } else {
    if (game.cash < pack.price) {
      const have = allHoldings().length;
      return toast(have ? "Not enough money. Sell cards from your collection." : dailyReady() ? "Not enough money. Claim your free daily pack in Rewards." : "Not enough money. Your next free pack comes tomorrow.");
    }
    game.cash = cents(game.cash - pack.price);
    game.spent = cents(game.spent + pack.price);
  }
  const cost = free ? 0 : pack.price;
  game.packs[pack.id] = (game.packs[pack.id] || 0) + 1;
  const pulls = Sim.open(pack, free ? "normal" : styleOf(pack));
  // The cards go into the collection straight away, so closing the tab mid-pack loses nothing.
  for (const p of pulls) {
    addCard(p.set.id, p.card.n, p.variant);
    game.pulled = cents(game.pulled + p.value);
    const entry = { set: p.set.id, n: p.card.n, variant: p.variant, value: p.value };
    if (!game.best || p.value > game.best.value) game.best = entry;
    game.recent.unshift({ ...entry, pack: pack.id, cost: p.bonus ? 0 : cost });
    new Image().src = p.card.img + "/high.webp";
  }
  game.recent.length = Math.min(game.recent.length, RECENT);
  writeSave();
  updateWallet();
  rip = { pack, cost, pulls, i: 0 };
  $("rip").classList.remove("hidden");
  $("rip").innerHTML = `<button class="stage" data-act="reveal" title="Open">${packHTML(pack)}</button>`;
  Sound.tear();
  const mine = rip;
  setTimeout(() => { if (rip === mine && $("rip").querySelector(".stage")) reveal(); }, 1500); // unless tapped meanwhile
}

function reveal() {
  if (!rip || !$("rip").querySelector(".stage")) return;
  renderRip();
  Sound.flip();
  Sound.hit(Math.max(...rip.pulls.map((p) => p.rank)));
}

// The card screen, shared by a pack's cards and by cards opened from the collection.
function cardScreen(c) {
  return `<div class="cs">
    <div class="cs-top"><button class="round" data-act="back" title="Back">←</button>${c.bonus ? `<span class="bonus">BONUS CARD</span>` : ""}<button class="round" data-act="cinfo" title="About this card">i</button></div>
    <div class="cs-card g-${c.color || "none"}">${cardImg(c.card, "high")}</div>
    ${c.pager || ""}
    <div class="cs-val">${money(c.value)}</div>
    <div class="cs-name">${esc(c.card.name)} #${esc(c.card.n)}</div>
    <div class="cs-note">${c.note}</div>
    ${c.done ? `<div class="cs-done">${c.done}</div>` : `<div class="cs-btns"><button class="sell" data-act="sell"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.600"/></svg>Sell</button><button class="vault" data-act="vault">${c.keep}</button></div>`}
  </div>`;
}

function renderRip() {
  const p = rip.pulls[rip.i], n = rip.pulls.length, diff = p.value - rip.cost;
  const note = p.bonus ? "A bonus card on top of your pull" : rip.cost ? `<span class="${diff >= 0 ? "pos" : "neg"}">${signed(diff)}</span> against the ${short(rip.cost)} pack` : "From your free daily pack";
  const pager = n > 1 ? `<div class="pager"><button data-act="page" data-d="-1"${rip.i ? "" : " disabled"}>‹</button><span>${rip.i + 1} / ${n}</span><button data-act="page" data-d="1"${rip.i < n - 1 ? "" : " disabled"}>›</button></div>` : "";
  $("rip").innerHTML = cardScreen({ ...p, pager, note, keep: "Vault", done: p.done === "sold" ? `Sold for ${money(p.value)}` : p.done ? "In your vault" : "" });
}

// Sell or vault the card on screen, then move to the pack's next undecided card.
function settle(sell) {
  if (look) return sell ? sellLook() : closeLook();
  if (!rip) return;
  const p = rip.pulls[rip.i];
  if (p.done) return;
  p.done = sell ? "sold" : "vault";
  if (sell) {
    sellCard(p.set.id, p.card.n, p.variant);
    Sound.coin();
    toast(`Sold for ${money(p.value)}`);
  } else {
    toast("Sent to your vault");
  }
  writeSave();
  updateWallet();
  const next = rip.pulls.findIndex((q) => !q.done);
  if (next < 0) return closeRip();
  rip.i = next;
  renderRip();
}

// Leaving a pack keeps whatever was not sold.
function closeRip() {
  rip = null;
  $("rip").classList.add("hidden");
  $("rip").innerHTML = "";
  show(game.view);
}

// ------------------------------------------------------------------ a card from the collection

function renderLook() {
  const card = cardOf(look.set, look.n), n = copies(look.set, look.n, look.variant);
  if (!card || !n) return closeLook();
  $("rip").classList.remove("hidden");
  $("rip").innerHTML = cardScreen({ card, value: card.p[look.variant], note: `${esc(SETS[look.set].name)} · ${Sim.PRINTING[look.variant]}${n > 1 ? ` · ×${n} in your vault` : ""}`, keep: "Keep" });
}

function sellLook() {
  Sound.coin();
  toast(`Sold for ${money(sellCard(look.set, look.n, look.variant))}`);
  writeSave();
  updateWallet();
  renderLook();
}

function closeLook() {
  look = null;
  $("rip").classList.add("hidden");
  $("rip").innerHTML = "";
  show(game.view);
}

function showCardInfo() {
  const c = look ? { set: SETS[look.set], card: cardOf(look.set, look.n), variant: look.variant } : rip.pulls[rip.i];
  const value = c.card.p[c.variant];
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  openModal(`<h2>${esc(c.card.name)}</h2>
    <table>${row("Set", esc(c.set.name))}${row("Series", esc(c.set.series || "–"))}${row("Released", esc(c.set.released.slice(0, 4)))}${row("Number", `#${esc(c.card.n)} of ${c.set.size}`)}
    ${row("Rarity", esc(c.card.r))}${row("Printing", Sim.PRINTING[c.variant])}${row("Market value", money(value))}</table>
    <p class="fine">Prices are a market snapshot from ${esc(window.PACK_DATA.priced)}.</p>`);
}

// ------------------------------------------------------------------ showroom

function renderShowroom() {
  const best = game.best && cardOf(game.best.set, game.best.n);
  const hero = best ? `<div class="hero">${cardImg(best, "high")}<div><span class="lbl">Best pull</span><b>${money(game.best.value)}</b><span>${esc(best.name)} #${esc(best.n)}</span><span class="dim">${esc(SETS[game.best.set].name)} · ${Sim.PRINTING[game.best.variant]}</span></div></div>` : "";
  const rows = game.recent.map((r) => {
    const card = cardOf(r.set, r.n);
    if (!card) return "";
    const diff = r.value - r.cost;
    return `<div class="pullrow">${cardImg(card, "low")}<div><b>${esc(card.name)} #${esc(card.n)}</b><span class="dim">${esc(Sim.packById[r.pack].name)} Pack${r.cost ? "" : " · free"}</span></div>
      <div class="amt"><b>${money(r.value)}</b>${r.cost ? `<span class="${diff >= 0 ? "pos" : "neg"}">${signed(diff)}</span>` : ""}</div></div>`;
  });
  $("showroom").innerHTML = `<h1>Showroom</h1>${hero}
    <h3>Recent pulls</h3>
    ${rows.length ? rows.join("") : `<p class="empty">Nothing pulled yet. Open a pack to fill your showroom.</p>`}`;
}

// ------------------------------------------------------------------ collection

function renderCollection() {
  const id = game.binderSet, set = SETS[id];
  const held = (set ? holdings(id) : allHoldings()).sort((a, b) => b.value - a.value);
  const total = worth(held), spare = held.reduce((sum, h) => sum + (h.count - 1) * h.value, 0);
  const options = SET_IDS.filter((sid) => game.owned[sid] && uniqueCards(sid)).map((sid) =>
    `<option value="${esc(sid)}"${sid === id ? " selected" : ""}>${esc(SETS[sid].name)} · ${uniqueCards(sid)}/${SETS[sid].cards.length}</option>`);
  const cell = (h) =>
    `<button class="cell" data-act="card" data-set="${esc(h.set.id)}" data-n="${esc(h.card.n)}" data-v="${h.variant}" title="${esc(h.card.name)}">${cardImg(h.card, "low")}` +
    `${h.count > 1 ? `<i class="cnt">×${h.count}</i>` : ""}<span class="val">${money(h.value)}</span></button>`;

  let cells, meta;
  if (set) {
    // A set page shows every card of the set that packs can pay out, owned or not.
    const mine = new Map();
    for (const h of held) if (!mine.has(h.card.n)) mine.set(h.card.n, h); // the dearest printing held
    cells = set.cards.map((c) => (mine.has(c.n) ? cell(mine.get(c.n)) : `<div class="cell missing"><span>#${esc(c.n)}</span><span>${esc(c.name)}</span></div>`));
    meta = `${mine.size} of ${set.cards.length} cards · ${money(total)}`;
  } else {
    cells = held.map(cell);
    meta = `${held.reduce((n, h) => n + h.count, 0)} cards · ${money(total)}`;
  }
  $("collection").innerHTML = `<h1>Collection</h1>
    <p class="meta">${meta}</p>
    <div class="tools">
      <select id="binderSet"><option value="">All my cards</option>${options.join("")}</select>
      ${spare > 0.004 ? `<button class="chip" data-act="dupes">Sell duplicates · ${money(spare)}</button>` : ""}
      ${held.length ? `<button class="chip danger" data-act="sellall">Sell all · ${money(total)}</button>` : ""}
    </div>
    ${cells.length ? `<div class="grid3">${cells.join("")}</div>` : `<p class="empty">Your vault is empty. Cards you keep from packs land here.</p>`}`;
}

// Sells the cards on the collection page: every copy, or every copy but one.
function sellPage(keepOne) {
  const held = game.binderSet ? holdings(game.binderSet) : allHoldings();
  if (!keepOne && !confirm(`Sell ${game.binderSet ? "every card of this set" : "every card you own"} for ${money(worth(held))}?`)) return;
  let got = 0, n = 0;
  for (const h of held) {
    for (let k = keepOne ? 1 : 0; k < h.count; k++) { got += sellCard(h.set.id, h.card.n, h.variant); n++; }
  }
  if (!n) return;
  Sound.coin();
  toast(`Sold ${n} card${n > 1 ? "s" : ""} for ${money(got)}`);
  writeSave();
  show("collection");
}

// ------------------------------------------------------------------ rewards

function untilMidnight() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.ceil((next - now) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function renderRewards() {
  const ready = dailyReady();
  $("rewards").innerHTML = `<h1>Rewards</h1>
    <div class="reward">
      <div class="reward-art">${packHTML(DAILY)}<span class="free">FREE</span></div>
      <h2>Daily ${esc(DAILY.name)} Pack</h2>
      <p>A free ${short(DAILY.price)} pack every day. ${ready ? "Today's is ready." : `The next one unlocks in ${untilMidnight()}.`}</p>
      <button class="buy${ready ? "" : " short"}" data-act="daily"${ready ? "" : " disabled"}>${ready ? "Claim free pack" : "Claimed today"}</button>
    </div>
    <p class="fine">${game.free} free pack${game.free === 1 ? "" : "s"} claimed so far.</p>`;
}

// ------------------------------------------------------------------ account

function renderAccount() {
  const packs = Object.values(game.packs).reduce((a, b) => a + b, 0);
  const held = worth(allHoldings()), net = game.cash + held - START_CASH;
  const stat = (v, label) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
  $("account").innerHTML = `<h1>Account</h1>
    <div class="stat big"><b class="${net >= 0 ? "pos" : "neg"}">${signed(net)}</b><span>You started with ${money(START_CASH)} and now hold ${money(game.cash + held)} in cash and cards. The balance cannot be topped up.</span></div>
    <div class="stats">
      ${stat(money(game.cash), "balance")}
      ${stat(money(held), "cards in your vault")}
      ${stat(packs, `packs opened, ${game.free} free`)}
      ${stat(money(game.spent), "spent on packs")}
      ${stat(money(game.pulled), "market value pulled")}
      ${stat(money(game.sold), "from selling cards")}
    </div>
    <div class="tools">
      <button class="chip" data-act="mute">${Sound.muted ? "🔇 Sound off" : "🔊 Sound on"}</button>
      <a class="chip" href="../index.html">‹ Back to Games</a>
    </div>
    <p class="fine">Play money only: nothing here can be bought, sold or cashed out. The catalogue holds ${Sim.count().toLocaleString("en-US")} card printings from ${SET_IDS.length} sets, priced on ${esc(window.PACK_DATA.priced)}.
    Unofficial fan project, not affiliated with, endorsed or sponsored by Nintendo, The Pokémon Company, Game Freak, Creatures or any pack-opening app.
    Card images and price snapshots come from <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a>.</p>`;
}

// ------------------------------------------------------------------ input

const ACTIONS = {
  view: (t) => show(t.dataset.view),
  pick: (t) => pick(t.dataset.pack),
  inside: showInside,
  style() { styleDraft = null; showStyle(); },
  draft(t) { styleDraft = t.dataset.style; showStyle(); },
  apply() {
    if (styleDraft) game.styles[game.pack] = styleDraft;
    styleDraft = null;
    writeSave();
    closeModal();
    renderInfo();
  },
  buy: () => buy(Sim.packById[game.pack], false),
  daily: () => buy(DAILY, true),
  reveal,
  sell: () => settle(true),
  vault: () => settle(false),
  back: () => (look ? closeLook() : closeRip()),
  page(t) { rip.i += Number(t.dataset.d); renderRip(); },
  cinfo: showCardInfo,
  close: closeModal,
  mute() { Sound.setMuted(!Sound.muted); writeSave(); renderAccount(); },
  card(t) { look = { set: t.dataset.set, n: t.dataset.n, variant: t.dataset.v }; renderLook(); },
  dupes: () => sellPage(true),
  sellall: () => sellPage(false),
};

document.addEventListener("click", (e) => {
  if (e.target.id === "modal") return closeModal();
  const t = e.target.closest("[data-act]");
  if (t && !t.disabled && ACTIONS[t.dataset.act]) ACTIONS[t.dataset.act](t);
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "binderSet") return;
  game.binderSet = e.target.value;
  writeSave();
  renderCollection();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closeModal();
  if (!$("modal").classList.contains("hidden")) return;
  if (rip && $("rip").querySelector(".stage") && (e.key === " " || e.key === "Enter")) { e.preventDefault(); return reveal(); }
  if (rip || look || game.view !== "packs") return;
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
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

window.addEventListener("resize", () => { if (game.view === "packs") centre(false); });

// Keeps the daily pack's countdown current, and unlocks it at midnight.
setInterval(() => {
  $("nav").classList.toggle("dot", dailyReady());
  if (game.view === "rewards" && !rip && !look) renderRewards();
}, 60000);

loadSave();
show("packs");
