"use strict";
// Game flow: layout and scrolling, the buttons that sit on the mine (upgrades, managers,
// abilities, new shafts, nuggets), the panels, saves, idle earnings and the first-time hints.

const SAVE_KEY = "idleminer-fan-v1";
const STEP = 1 / 30;
const OFFLINE_CAP = 8 * 3600;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const game = {
  mine: null,
  bulk: 1, // 1 | 10 | 50 | "max"
  tut: false, // first-time hints finished
  view: { s: 1, x0: 0, scroll: 0, vw: 0, vh: 0 },
  panel: null, // { update() } of the open panel
  nugget: null, // { i, x, t }
  nuggetIn: 75,
  incomeLog: [], // [time, value] of recent sales, for the HUD rate
};

// ------------------------------------------------------------------ saves

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) { /* storage unavailable */ }
  game.mine = new Mine(s && s.mine);
  if (s) {
    game.bulk = [1, 10, 50, "max"].includes(s.bulk) ? s.bulk : 1;
    game.tut = !!s.tut;
    Sound.setMuted(!!s.muted);
    if (typeof s.lastSeen === "number") return (Date.now() - s.lastSeen) / 1000;
  }
  return 0;
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, mine: game.mine.toSave(), bulk: game.bulk, tut: game.tut, muted: Sound.muted, lastSeen: Date.now() }));
  } catch (_) { /* storage unavailable */ }
}

// Time passed with the game closed or the tab hidden: managers keep earning.
function offline(sec) {
  if (sec < 5) return;
  const m = game.mine;
  const used = Math.min(sec, OFFLINE_CAP);
  const earned = m.idleRate() * used;
  for (const x of [m.elevator.manager, m.warehouse.manager, ...m.shafts.map((s) => s.manager)]) {
    if (x) { x.active = Math.max(0, x.active - sec); x.cool = Math.max(0, x.cool - sec); }
  }
  if (earned > 0) m.sell(earned / m.mult());
  m.events.length = 0;
  if (sec >= 60) showAway(sec, used, earned);
}

// ------------------------------------------------------------------ layout

const scroller = $("scroller"), sizer = $("sizer"), world = $("world");

function layout() {
  const v = game.view;
  v.vw = window.innerWidth;
  v.vh = window.innerHeight;
  v.s = Math.min(v.vw / W, Math.max(v.vh / 800, 0.8), 2.2);
  v.x0 = (v.vw - W * v.s) / 2;
  world.style.transform = `translate(${v.x0}px, 0) scale(${v.s})`;
  Render.resize(v.vw, v.vh);
  sizeWorld();
}

function sizeWorld() {
  const h = worldHeight(game.mine.shafts.length);
  world.style.height = h + "px";
  sizer.style.height = Math.ceil(h * game.view.s) + "px";
}

// ------------------------------------------------------------------ buttons on the mine

// Everything is placed in world units; the #world div is scaled to fit.
function place(e, x, y, w, h) {
  e.style.left = x + "px";
  e.style.top = y + "px";
  if (w != null) e.style.width = w + "px";
  if (h != null) e.style.height = h + "px";
  return e;
}

let ui = null; // the buttons for the current mine; rebuilt when shafts are added or a new mine opens

function areaTitle(area, i) {
  return area === "shaft" ? `Shaft ${i + 1}` : area === "elevator" ? "Elevator" : "Warehouse";
}

function makeStation(area, i, pos) {
  const st = {};
  st.tap = place(el("button", "tapzone"), ...pos.tap);
  st.tap.setAttribute("aria-label", `${areaTitle(area, i)}: tap to work`);
  st.tap.addEventListener("pointerdown", (ev) => { ev.preventDefault(); doTap(area, i); });
  st.tap.addEventListener("click", (ev) => { if (ev.detail === 0) doTap(area, i); }); // keyboard
  st.up = place(el("button", area === "shaft" ? "up" : "up two"), pos.up[0], pos.up[1]);
  st.up.addEventListener("click", () => openUpgrade(area, i));
  st.mgr = place(el("button", "mgr"), pos.mgr[0], pos.mgr[1]);
  st.mgr.addEventListener("click", () => openManager(area, i));
  st.face = el("canvas");
  st.face.width = st.face.height = 60;
  st.mgr.appendChild(st.face);
  st.plus = el("span", "plus", "+");
  st.mgr.appendChild(st.plus);
  st.abil = place(el("button", "abil hidden"), pos.abil[0], pos.abil[1]);
  st.abil.addEventListener("click", () => {
    if (game.mine.activate(area, i)) refreshUi(true);
    else Sound.play.no();
  });
  for (const k of ["tap", "up", "mgr", "abil"]) world.appendChild(st[k]);
  st.area = area;
  st.i = i;
  st.face.dataset.key = "";
  return st;
}

function buildUi() {
  world.innerHTML = "";
  const m = game.mine;
  ui = { stations: [], unlock: null, hint: null, nugget: null };
  ui.stations.push(makeStation("elevator", 0, {
    tap: [ELEV_X - 6, 60, ELEV_W + 12, shaftFloor(m.shafts.length - 1) + 10 - 60], up: [4, 225], mgr: [98, 226], abil: [134, 230],
  }));
  ui.stations.push(makeStation("warehouse", 0, {
    tap: [180, 104, 216, GROUND_Y - 100], up: [308, 225], mgr: [272, 226], abil: [210, 230],
  }));
  m.shafts.forEach((s) => {
    const top = shaftTop(s.i);
    ui.stations.push(makeStation("shaft", s.i, { tap: [150, top + 30, 240, 92], up: [306, top + 1], mgr: [90, top - 1], abil: [124, top + 3] }));
  });
  if (m.shafts.length < MAX_SHAFTS) {
    const i = m.shafts.length, top = shaftTop(i);
    ui.unlock = place(el("button", "unlock"), 140, top + 44);
    ui.unlock.addEventListener("click", () => {
      if (game.mine.unlock()) { buildUi(); sizeWorld(); }
      else Sound.play.no();
    });
    world.appendChild(ui.unlock);
  }
  ui.hint = el("div", "hint hidden");
  world.appendChild(ui.hint);
  ui.nugget = el("button", "nugget hidden");
  ui.nugget.setAttribute("aria-label", "Gold nugget: grab it for bonus cash");
  ui.nugget.addEventListener("click", grabNugget);
  world.appendChild(ui.nugget);
  ui.uiKey = m.mineIndex + ":" + m.shafts.length;
  refreshUi(true);
}

function doTap(area, i) {
  Sound.init();
  if (game.mine.tap(area, i)) Sound.play.tap();
}

// Cheap-ish refresh of labels on the mine; runs a few times a second.
function refreshUi(force) {
  const m = game.mine;
  if (!ui || ui.uiKey !== m.mineIndex + ":" + m.shafts.length) return buildUi();
  for (const st of ui.stations) {
    const a = m.areaObj(st.area, st.i);
    const q = m.quote(st.area, st.i, 1);
    const can = !q.maxed && q.cost <= m.cash;
    const name = st.area === "shaft" ? "" : `<em>${st.area === "elevator" ? "Elevator" : "Warehouse"}</em>`;
    setHtml(st.up, name + (q.maxed ? `<span><b>MAX</b></span>` : `<span><small>Lv</small> <b>${a.level}</b> <i>▲</i></span>`));
    st.up.classList.toggle("can", can);
    st.tap.classList.toggle("off", !!a.manager);
    st.tap.tabIndex = a.manager ? -1 : 0;
    // manager face
    const mg = a.manager;
    const key = mg ? mg.name + mg.look + mg.rarity + (mg.active > 0) : "";
    if (st.face.dataset.key !== key || force) {
      st.face.dataset.key = key;
      if (mg) Render.portraitTo(st.face, mg);
      st.face.classList.toggle("hidden", !mg);
      st.plus.classList.toggle("hidden", !!mg);
      st.mgr.classList.toggle("can", !mg && m.cash >= m.hireCost(st.area, st.i));
      st.mgr.setAttribute("aria-label", mg ? `${areaTitle(st.area, st.i)} manager: ${mg.name}` : `Hire a manager for ${areaTitle(st.area, st.i)}`);
    }
    if (!mg) st.mgr.classList.toggle("can", m.cash >= m.hireCost(st.area, st.i));
    // ability button
    st.abil.classList.toggle("hidden", !mg);
    if (mg) {
      const state = mg.active > 0 ? "on" : mg.cool > 0 ? "wait" : "ready";
      st.abil.className = "abil " + state;
      setHtml(st.abil, state === "on" ? `⚡ ${Fmt.time(mg.active)}` : state === "wait" ? `⏳ ${Fmt.time(mg.cool)}` : `⚡ ${abilityName(mg.ability)}`);
      st.abil.setAttribute("aria-label", state === "ready" ? `Use ability: ${abilityText(mg.ability, mg.rarity)}` : "Ability not ready");
    }
  }
  if (ui.unlock) {
    const c = m.nextUnlockCost(), i = m.shafts.length, ore = oreFor(i);
    setHtml(ui.unlock, `<span>New shaft ${i + 1} · <em style="color:${ore[2]}">${ore[0]}</em></span><b>$${Fmt.money(c * 1)}</b>`);
    ui.unlock.classList.toggle("can", m.cash >= c);
  }
  updateHint();
}

function setHtml(e, h) { if (e._h !== h) { e._h = h; e.innerHTML = h; } }

// ------------------------------------------------------------------ first-time hints

function updateHint() {
  const m = game.mine, h = ui.hint;
  let text = null, x = 0, y = 0;
  if (!game.tut) {
    const anyMgr = m.elevator.manager || m.warehouse.manager || m.shafts.some((s) => s.manager);
    const s0 = m.shafts[0], e = m.elevator, w = m.warehouse;
    const busyMiners = s0.workers.some((x) => x.state !== "idle");
    const cageBusy = e.state !== "top";
    const carts = w.workers.some((x) => x.state !== "idle");
    if (anyMgr) { game.tut = true; }
    else if (m.cash >= m.hireCost("elevator", 0) && m.lifetime > 40) { text = "Hire a manager so you don't have to tap"; x = 96; y = 182; }
    else if (m.stash > 0 && !carts) { text = "Tap the warehouse to sell"; x = 250; y = 150; }
    else if ((s0.stored > 0 || e.carry > 0) && !cageBusy) { text = "Tap the elevator to bring the ore up"; x = 60; y = 120; }
    else if (m.cash >= m.quote("shaft", 0, 1).cost && s0.level < 3 && m.lifetime > 5) { text = "Upgrade your shaft"; x = 330; y = shaftTop(0) - 30; }
    else if (!busyMiners && s0.stored === 0 && !cageBusy && m.stash === 0 && !carts) { text = "Tap the tunnel to start digging"; x = 260; y = shaftTop(0) + 60; }
  }
  h.classList.toggle("hidden", !text);
  if (text) { setHtml(h, text); place(h, x, y); }
}

// ------------------------------------------------------------------ nuggets

function spawnNugget() {
  const m = game.mine;
  // Somewhere the player is looking, so it isn't missed.
  const v = game.view, top = v.scroll / v.s, bottom = (v.scroll + v.vh) / v.s;
  const seen = m.shafts.filter((s) => shaftTop(s.i) + 40 > top && shaftFloor(s.i) < bottom);
  const s = seen.length ? seen[Math.floor(Math.random() * seen.length)] : m.shafts[0];
  game.nugget = { i: s.i, x: 170 + Math.random() * 170, t: 14 };
  place(ui.nugget, game.nugget.x, shaftFloor(s.i) - 34);
  ui.nugget.classList.remove("hidden");
}

function grabNugget() {
  const m = game.mine;
  if (!game.nugget) return;
  Sound.init();
  const value = Math.max(m.potential() * 40, 25 * m.mult());
  m.cash += value;
  m.runEarned += value;
  m.lifetime += value;
  Render.addFloat("+$" + Fmt.money(value), game.nugget.x + 14, shaftFloor(game.nugget.i) - 40, "#ffe27a");
  Sound.play.nugget();
  toast(`Gold nugget! +$${Fmt.money(value)}`);
  game.nugget = null;
  ui.nugget.classList.add("hidden");
}

// ------------------------------------------------------------------ panels

const modal = $("modal"), card = $("card");
let lastFocus = null;

function openPanel(build) {
  Sound.init();
  if (modal.classList.contains("hidden")) lastFocus = document.activeElement;
  card.innerHTML = "";
  card.className = "card";
  game.panel = build(card) || null;
  modal.classList.remove("hidden");
  const f = card.querySelector("button.primary:not([disabled]), button");
  if (f) f.focus({ preventScroll: true });
}

function closePanel() {
  modal.classList.add("hidden");
  game.panel = null;
  card.innerHTML = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

modal.addEventListener("pointerdown", (e) => { if (e.target === modal) closePanel(); });

function closeBtn() {
  const b = el("button", "x", "✕");
  b.setAttribute("aria-label", "Close");
  b.addEventListener("click", closePanel);
  return b;
}

function statRows(area, i, L, n) {
  const m = game.mine, mult = m.mult(), N = Math.min(L + n, area === "shaft" ? SHAFT_MAX : AREA_MAX);
  const $m = (v) => "$" + Fmt.money(v * mult);
  if (area === "shaft") {
    const a = shaftStats(i, L), b = shaftStats(i, N);
    return [
      ["Miners", a.workers, b.workers],
      ["Walking speed", a.walk.toFixed(0), b.walk.toFixed(0)],
      ["Mining time", a.dig.toFixed(2) + "s", b.dig.toFixed(2) + "s"],
      ["Extraction", $m(a.rate) + "/s", $m(b.rate) + "/s"],
    ];
  }
  if (area === "elevator") {
    const a = elevStats(L), b = elevStats(N), k = m.shafts.length;
    return [
      ["Load", $m(a.load), $m(b.load)],
      ["Speed", a.speed.toFixed(0), b.speed.toFixed(0)],
      ["Loading time", a.loadTime.toFixed(2) + "s", b.loadTime.toFixed(2) + "s"],
      ["Moves", $m(elevRate(L, k)) + "/s", $m(elevRate(N, k)) + "/s"],
    ];
  }
  const a = whStats(L), b = whStats(N);
  return [
    ["Transporters", a.workers, b.workers],
    ["Load each", $m(a.load), $m(b.load)],
    ["Walking speed", a.walk.toFixed(0), b.walk.toFixed(0)],
    ["Sells", $m(whRate(L)) + "/s", $m(whRate(N)) + "/s"],
  ];
}

function nextMilestone(area, L) {
  const list = area === "shaft" ? SHAFT_MS : AREA_MS;
  const next = list.find((x) => x > L);
  if (!next) return "";
  if (area === "shaft") {
    const more = shaftStats(0, next).workers > shaftStats(0, L).workers;
    return `Level ${next}: ×2 extraction${more ? " and a new miner" : ""}`;
  }
  if (area === "elevator") return `Level ${next}: ×1.5 load and faster loading`;
  const more = whStats(next).workers > whStats(L).workers;
  return `Level ${next}: ×1.5 load${more ? " and a new transporter" : ""}`;
}

// Tell the player which stage is holding them back.
function bottleneckNote(area) {
  const m = game.mine, r = m.rates(), mult = m.mult();
  const low = Math.min(r.mined, r.lift, r.sell);
  if (area !== "elevator" && r.lift === low && r.lift < r.mined * 0.95) return `The elevator can only move $${Fmt.money(r.lift * mult)}/s. Upgrade it to keep up.`;
  if (area !== "warehouse" && r.sell === low && r.sell < Math.min(r.mined, r.lift) * 0.95) return `The warehouse can only sell $${Fmt.money(r.sell * mult)}/s. Upgrade it to keep up.`;
  if (area !== "shaft" && r.mined === low && r.mined < Math.min(r.lift, r.sell) * 0.95) return `Your miners dig $${Fmt.money(r.mined * mult)}/s. Upgrade shafts to use all of this.`;
  return "";
}

function openUpgrade(area, i) {
  openPanel((c) => {
    const m = game.mine;
    c.classList.add("upgrade");
    c.appendChild(closeBtn());
    const ore = area === "shaft" ? oreFor(i) : null;
    const h = el("h2", null, esc(areaTitle(area, i)) + (ore ? ` <small style="color:${ore[2]}">${ore[0]}</small>` : ""));
    c.appendChild(h);
    const lvl = el("div", "lvl");
    c.appendChild(lvl);
    const table = el("div", "stats");
    c.appendChild(table);
    const ms = el("div", "ms");
    c.appendChild(ms);
    const bulk = el("div", "bulk");
    const bulks = [1, 10, 50, "max"].map((b) => {
      const x = el("button", null, b === "max" ? "MAX" : "×" + b);
      x.addEventListener("click", () => { game.bulk = b; upd(); });
      bulk.appendChild(x);
      return [b, x];
    });
    c.appendChild(bulk);
    const buy = el("button", "primary");
    buy.addEventListener("click", () => {
      if (game.mine.buy(area, i, game.bulk)) upd();
      else Sound.play.no();
    });
    c.appendChild(buy);
    const note = el("p", "note");
    c.appendChild(note);
    function upd() {
      const a = m.areaObj(area, i);
      const q = m.quote(area, i, game.bulk);
      const max = area === "shaft" ? SHAFT_MAX : AREA_MAX;
      setHtml(lvl, q.maxed ? `Level <b>${a.level}</b> · max` : `Level <b>${a.level}</b> → <b class="g">${a.level + q.n}</b>`);
      setHtml(table, statRows(area, i, a.level, q.n).map(([k, x, y]) => `<span>${k}</span><b>${x}</b><b class="${x === y ? "" : "g"}">${q.maxed ? "" : "→ " + y}</b>`).join(""));
      setHtml(ms, a.level < max ? nextMilestone(area, a.level) : "");
      for (const [b, x] of bulks) x.classList.toggle("on", b === game.bulk);
      setHtml(buy, q.maxed ? "Maxed out" : `Upgrade ×${q.n} <span>$${Fmt.money(q.cost)}</span>`);
      buy.disabled = q.maxed || q.cost > m.cash;
      const mg = a.manager;
      const cut = mg && mg.active > 0 && mg.ability === "cut" ? `${mg.name}'s bargain is on: ${Math.round(RARITY[mg.rarity].cut * 100)}% off! ` : "";
      setHtml(note, cut + bottleneckNote(area));
    }
    upd();
    return { update: upd };
  });
}

function rarityTag(r) {
  return `<span class="rar r${r}">${RARITY[r].name}</span>`;
}

function openManager(area, i) {
  openPanel((c) => {
    const m = game.mine;
    c.appendChild(closeBtn());
    c.appendChild(el("h2", null, `${esc(areaTitle(area, i))} manager`));
    const body = el("div", "mgrbody");
    c.appendChild(body);
    const face = el("canvas", "bigface");
    face.width = face.height = 120;
    const info = el("div", "mgrinfo");
    body.appendChild(face);
    body.appendChild(info);
    const use = el("button", "primary");
    use.addEventListener("click", () => {
      const a = m.areaObj(area, i);
      if (!a.manager) { if (m.hire(area, i)) { refreshUi(true); draw(); } else Sound.play.no(); }
      else if (m.activate(area, i)) { refreshUi(true); upd(); }
      else Sound.play.no();
    });
    c.appendChild(use);
    const swap = el("button", "secondary");
    swap.addEventListener("click", () => {
      if (m.hire(area, i)) { refreshUi(true); draw(); }
      else Sound.play.no();
    });
    c.appendChild(swap);
    const help = el("p", "note");
    c.appendChild(help);
    let drawn = "";
    function draw() {
      const mg = m.areaObj(area, i).manager;
      const key = mg ? mg.name + mg.look : "";
      if (key === drawn) return;
      drawn = key;
      face.classList.toggle("hidden", !mg);
      if (mg) Render.portraitTo(face, mg);
    }
    function upd() {
      const a = m.areaObj(area, i), mg = a.manager, cost = m.hireCost(area, i);
      draw();
      if (!mg) {
        setHtml(info, `<p>Managers keep ${area === "shaft" ? "this shaft's miners" : area === "elevator" ? "the elevator" : "the transporters"} working without tapping, even while you're away.</p>
          <p>Each one also has an ability you can switch on. Some managers are better than others:</p>
          <p class="odds">${RARITY.map((r, k) => `${rarityTag(k)} ${Math.round(r.odds * 100)}%`).join(" ")}</p>`);
        setHtml(use, `Hire a manager <span>$${Fmt.money(cost)}</span>`);
        use.disabled = m.cash < cost;
        swap.classList.add("hidden");
        setHtml(help, "");
      } else {
        const R = RARITY[mg.rarity];
        setHtml(info, `<p class="nm">${esc(mg.name)} ${rarityTag(mg.rarity)}</p>
          <p><b>${abilityName(mg.ability)}:</b> ${abilityText(mg.ability, mg.rarity)}</p>
          <p class="dim">Then rests for ${Fmt.time(COOLDOWN)}.</p>`);
        const state = mg.active > 0 ? `Working hard… ${Fmt.time(mg.active)}` : mg.cool > 0 ? `Resting… ${Fmt.time(mg.cool)}` : `⚡ Use ${abilityName(mg.ability)}`;
        setHtml(use, state);
        use.disabled = mg.active > 0 || mg.cool > 0;
        swap.classList.remove("hidden");
        setHtml(swap, `Hire someone else <span>$${Fmt.money(cost)}</span>`);
        swap.disabled = m.cash < cost;
        setHtml(help, `${R.name}s are ${["common", "uncommon", "rare"][mg.rarity]}. Hiring someone else sends ${esc(mg.name.split(" ")[0])} home.`);
      }
    }
    upd();
    return { update: upd };
  });
}

function openMines() {
  openPanel((c) => {
    const m = game.mine;
    c.appendChild(closeBtn());
    c.appendChild(el("h2", null, "Mines"));
    const body = el("div", "minesbody");
    c.appendChild(body);
    const go = el("button", "primary");
    go.addEventListener("click", () => {
      if (!m.prestige()) { Sound.play.no(); return; }
      Sound.play.prestige();
      game.nugget = null;
      game.incomeLog.length = 0;
      scroller.scrollTop = 0;
      buildUi();
      sizeWorld();
      writeSave();
      closePanel();
      toast(`Welcome to ${mineName(m.mineIndex)}!`);
    });
    c.appendChild(go);
    function upd() {
      const gain = m.geologistsToGain(), need = ECON.prestigeShafts;
      const bonus = (g) => Math.round(g * ECON.geoBonus * 100);
      const next = mineName(m.mineIndex + 1);
      setHtml(body, `
        <p class="here">You're in <b>${esc(mineName(m.mineIndex))}</b> (mine ${m.mineIndex + 1}).</p>
        <div class="geo"><span>🧑‍🔬 Geologists</span><b>${Fmt.money(m.geologists)}</b><span>Income bonus</span><b>+${Fmt.money(bonus(m.geologists))}%</b></div>
        <p>Geologists join you as your mines earn money. Each one adds <b>+${Math.round(ECON.geoBonus * 100)}%</b> to everything you sell, forever.</p>
        <p>Open <b>${esc(next)}</b> to put them to work: you start again with one shaft and no managers, but you keep every geologist.</p>
        <div class="geo gain"><span>Joining you</span><b>+${Fmt.money(gain)}</b><span>New bonus</span><b>+${Fmt.money(bonus(m.geologists + gain))}%</b></div>
        ${m.shafts.length < need ? `<p class="need">Unlock ${need} shafts in this mine first (${m.shafts.length}/${need}).</p>` : gain < 1 ? `<p class="need">Earn more money to find your next geologist.</p>` : ""}`);
      setHtml(go, `Open ${esc(next)}`);
      go.disabled = !m.canPrestige();
    }
    upd();
    return { update: upd };
  });
}

function openMenu() {
  openPanel((c) => {
    c.appendChild(closeBtn());
    c.appendChild(el("h2", null, "Idle Miner"));
    c.appendChild(el("div", "howto", `
      <p>⛏ <b>Miners</b> dig ore into the crate at the start of each shaft.</p>
      <p>🛗 The <b>elevator</b> collects the crates and brings the ore to the surface.</p>
      <p>🏚 <b>Transporters</b> carry it to the warehouse, where it's sold.</p>
      <p>Tap a tunnel, the elevator or the warehouse to make them work. <b>Managers</b> do it for you, even while you're away (up to 8 hours).</p>
      <p>Upgrade whatever is slowest: your income is only as fast as the weakest part. The upgrade window tells you.</p>
      <p>Grab the shiny <b>gold nuggets</b> that pop up in the tunnels.</p>
      <p>After ${ECON.prestigeShafts} shafts you can open a new mine with <b>geologists</b> boosting everything.</p>
      <p class="keys"><kbd>Space</kbd> tap everything without a manager · <kbd>M</kbd> sound · <kbd>Esc</kbd> close · <kbd>Tab</kbd> move between buttons</p>`));
    const snd = el("button", "secondary", "");
    const setSnd = () => setHtml(snd, `Sound: ${Sound.muted ? "Off" : "On"}`);
    setSnd();
    snd.addEventListener("click", () => { Sound.setMuted(!Sound.muted); setSnd(); writeSave(); });
    c.appendChild(snd);
    const reset = el("button", "secondary danger", "Start over");
    let armed = false;
    reset.addEventListener("click", () => {
      if (!armed) { armed = true; setHtml(reset, "Tap again to erase everything"); return; }
      try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* storage unavailable */ }
      game.mine = new Mine();
      game.tut = false;
      game.nugget = null;
      game.incomeLog.length = 0;
      scroller.scrollTop = 0;
      buildUi();
      sizeWorld();
      writeSave();
      closePanel();
    });
    c.appendChild(reset);
    const foot = el("div", "foot", `<a class="link" href="../index.html">← All games</a><span>Fan-made tribute. Not affiliated with Kolibri Games.</span>`);
    c.appendChild(foot);
  });
}

function showAway(sec, used, earned) {
  openPanel((c) => {
    c.appendChild(el("h2", null, "Welcome back!"));
    if (earned > 0) {
      c.appendChild(el("p", "away", `Your managers earned<br><b>$${Fmt.money(earned)}</b><br>while you were away for ${Fmt.time(sec)}.`));
      if (used < sec) c.appendChild(el("p", "note", "Managers stop after 8 hours, so check in now and then."));
    }
    const b = el("button", "primary", "Collect");
    b.addEventListener("click", closePanel);
    c.appendChild(b);
  });
}

$("minesBtn").addEventListener("click", openMines);
$("menuBtn").addEventListener("click", openMenu);

// ------------------------------------------------------------------ HUD

let toastT = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  toastT = 2.6;
}

function updateHud(now) {
  const m = game.mine;
  setHtml($("cash"), "$" + Fmt.money(m.cash));
  // Recent sales, averaged, or what the managers make on their own if that's more.
  const log = game.incomeLog;
  while (log.length && log[0][0] < now - 20) log.shift();
  const span = log.length ? Math.max(5, now - log[0][0]) : 1;
  const recent = log.reduce((a, x) => a + x[1], 0) / span;
  setHtml($("rate"), `$${Fmt.money(Math.max(recent, m.idleRate()))}/s`);
  setHtml($("mineName"), esc(mineName(m.mineIndex)) + (m.geologists ? ` <small>+${Fmt.money(Math.round(m.geologists * ECON.geoBonus * 100))}%</small>` : ""));
  $("minesDot").classList.toggle("hidden", !m.canPrestige() || m.geologistsToGain() < Math.max(1, m.geologists * 0.5));
  // running abilities
  const runs = [];
  for (const [a, i] of [["elevator", 0], ["warehouse", 0], ...m.shafts.map((s) => ["shaft", s.i])]) {
    const mg = m.areaObj(a, i).manager;
    if (mg && mg.active > 0) runs.push(`<span>⚡ ${areaTitle(a, i)}: ${abilityName(mg.ability)} ${Fmt.time(mg.active)}</span>`);
  }
  setHtml($("boosts"), runs.slice(0, 4).join(""));
}

// ------------------------------------------------------------------ input

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (!modal.classList.contains("hidden")) closePanel(); return; }
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.key === "m" || e.key === "M") { Sound.init(); Sound.setMuted(!Sound.muted); toast(`Sound ${Sound.muted ? "off" : "on"}`); writeSave(); }
  if (e.key === " " && modal.classList.contains("hidden")) {
    e.preventDefault();
    Sound.init();
    const m = game.mine;
    let any = false;
    for (const s of m.shafts) any = m.tap("shaft", s.i) || any;
    any = m.tap("elevator", 0) || any;
    any = m.tap("warehouse", 0) || any;
    if (any) Sound.play.tap();
  }
});

// Keep focused buttons on screen when moving with Tab.
world.addEventListener("focusin", (e) => {
  const v = game.view, r = e.target.getBoundingClientRect();
  if (r.top < 80 || r.bottom > v.vh - 20) scroller.scrollTop += r.top - v.vh / 2;
});

window.addEventListener("resize", layout);
document.addEventListener("visibilitychange", () => { if (document.hidden) writeSave(); });
window.addEventListener("pagehide", writeSave);

// ------------------------------------------------------------------ loop

let acc = 0, lastNow = performance.now(), lastWall = Date.now(), uiT = 0, saveT = 0, clock = 0;

function visibleY(y) {
  const v = game.view, top = v.scroll / v.s, bottom = (v.scroll + v.vh) / v.s;
  return y > top - 20 && y < bottom + 20;
}

function handleEvents() {
  const m = game.mine;
  for (const e of m.events) {
    if (e.type === "sell") {
      game.incomeLog.push([clock, e.value]);
      if (visibleY(GROUND_Y)) {
        Sound.play.cash();
        Render.addFloat("+$" + Fmt.money(e.value), DOCK_X + 40, GROUND_Y - 70);
      }
    } else if (e.type === "dug") {
      if (visibleY(shaftFloor(e.i))) Sound.play.clink();
    } else if (e.type === "collect") {
      if (visibleY(shaftFloor(e.i))) Sound.play.collect();
    } else if (e.type === "upgrade") {
      Sound.play.upgrade();
      if (e.newWorker) {
        Sound.play.worker();
        toast(e.area === "shaft" ? `A new miner joined shaft ${e.i + 1}!` : "A new transporter joined the warehouse!");
      }
    } else if (e.type === "unlock") {
      Sound.play.unlock();
      toast(`Shaft ${e.i + 1} is open: ${oreFor(e.i)[0]}!`);
    } else if (e.type === "hire") {
      Sound.play.hire();
      const mg = m.areaObj(e.area, e.i).manager;
      toast(`${mg.name} (${RARITY[mg.rarity].name}) is now running ${areaTitle(e.area, e.i)}`);
    } else if (e.type === "ability") {
      Sound.play.ability();
    }
  }
  m.events.length = 0;
}

function frame(now) {
  const wall = Date.now();
  // A long gap means the tab was hidden or the computer slept: count it as idle time.
  if (wall - lastWall > 5000) offline((wall - lastWall) / 1000);
  lastWall = wall;
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  clock += dt;

  const m = game.mine;
  acc += dt;
  while (acc >= STEP) { m.step(STEP); acc -= STEP; }
  handleEvents();

  // nuggets
  if (game.nugget) {
    game.nugget.t -= dt;
    if (game.nugget.t <= 0) { game.nugget = null; ui.nugget.classList.add("hidden"); }
  } else if (modal.classList.contains("hidden") && (game.nuggetIn -= dt) <= 0) {
    game.nuggetIn = 90 + Math.random() * 120;
    spawnNugget();
  }

  const v = game.view;
  v.scroll = scroller.scrollTop;
  Render.draw(m, v, clock, dt);

  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.2;
    refreshUi();
    updateHud(clock);
    if (game.panel && game.panel.update) game.panel.update();
  }
  if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
  saveT -= dt;
  if (saveT <= 0) { saveT = 5; writeSave(); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ start

const away = loadSave();
Render.init($("game"));
layout();
buildUi();
offline(away);
window.addEventListener("pointerdown", () => Sound.init(), { once: true });
requestAnimationFrame(frame);
