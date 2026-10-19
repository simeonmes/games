"use strict";
// Krillion: name something that fits the prompt. The rarer the answer, the more points, and
// every point sinks you ten metres deeper. Classic is seven random prompts, the Daily Dive is
// the same seven for everyone each day, and Endless keeps going until three prompts run out
// of air. A guess that isn't in the bank costs three seconds; PASS skips a prompt.

const ROUND_SECS = 25;
const WRONG_COST = 3;
const COUNTDOWN = 3;
const CLASSIC_COUNT = 7;
const TANKS = 3;
const METRES_PER_PT = 10;
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / 864e5);

const FLAVOR = {
  p: "Half the reef said that too.",
  c: "Technically right. The fish are not impressed.",
  s: "A solid answer with plenty of company.",
  r: "Not many divers swim this way.",
  d: "Down where the strange things live.",
  k: "Nobody else would have thought of that.",
  time: "Your air ran out on this one.",
  pass: "You let this one drift by.",
};

const $ = sel => document.querySelector(sel);
const screen = $("#screen");
const fmt = n => n.toLocaleString("en-US");
const fmtM = m => fmt(Math.round(m)) + "m";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- save ----------

const SAVE_KEY = "krillion.v1";
let save = {
  days: {}, streak: 0, maxStreak: 0, lastDone: null, bestDaily: 0, bestInfinite: 0, bestClassic: 0,
  dives: 0, krillions: 0, mode: "classic",
};
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const bestDepth = () => Math.max(save.bestDaily, save.bestClassic, save.bestInfinite) * METRES_PER_PT;

// ---------- prompt order ----------

const dayNow = () => Math.floor(Date.now() / 864e5);
const diveNo = day => day - EPOCH_DAY + 1;

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(n, rand) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// The daily list walks through the prompts in shuffled passes, so a prompt doesn't come back
// until every other one has had a turn.
function dailyPrompts(day) {
  const n = PROMPTS.length, out = [];
  let pos = (day - EPOCH_DAY) * CLASSIC_COUNT;
  while (out.length < CLASSIC_COUNT) {
    const pass = Math.floor(pos / n);
    const idx = shuffled(n, rng(pass * 7919 + 1013))[pos % n];
    if (!out.includes(idx)) out.push(idx);
    pos++;
  }
  return out;
}

const banks = new Map();
function bankFor(i) {
  if (!banks.has(i)) banks.set(i, Match.build(tiersFor(i)));
  return banks.get(i);
}

const totalPts = picks => picks.reduce((s, p) => s + (p.tier ? TIERS[p.tier].pts : 0) + (p.bonus || 0), 0);

// ---------- shared bits ----------

let game = null;     // the solo dive in progress
let curRound = null; // the prompt on screen, solo or in a room
let timerId = 0, countdownId = 0, beats = [];
let onQuit = null;

function clearTimers() {
  clearInterval(timerId); clearInterval(countdownId); timerId = countdownId = 0;
  beats.forEach(clearTimeout); beats = [];
  untint();
}
// Waits ms; a clearTimers() in the meantime cancels whatever was waiting.
const beat = ms => new Promise(res => beats.push(setTimeout(res, ms)));

const ICON_SPEAKER = `<svg viewBox="0 0 16 16" class="spk"><path d="M2 6h3l4-3v10l-4-3H2z"/><path class="on" d="M11 5h1v1h1v4h-1v1h-1z"/><path class="off" d="M11 6h1v1h1V6h1v1h-1v1h1v1h-1V8h-1v1h-1V8h1V7h-1z"/></svg>`;
const muteBtn = () => `<button class="ibtn mute ${Sound.muted ? "muted" : ""}" data-act="mute" aria-label="Sound">${ICON_SPEAKER}</button>`;

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.dataset.act === "mute") {
    Sound.init();
    const m = Sound.toggle();
    document.querySelectorAll(".mute").forEach(x => x.classList.toggle("muted", m));
    Sound.play("tap");
  } else if (b.dataset.act === "quit" && onQuit) {
    Sound.play("tap");
    onQuit();
  }
});
addEventListener("pointerdown", () => Sound.init(), { once: true });
addEventListener("keydown", () => Sound.init(), { once: true });

function paintIcons(root) {
  root.querySelectorAll("canvas[data-icon]").forEach(c => Scene.icon(c, c.dataset.icon));
}

function squaresHTML(count, picks, cur) {
  return Array.from({ length: count }, (_, i) => {
    const p = picks[i];
    if (p) return `<i style="--c:${p.tier ? TIERS[p.tier].color : "#3a4560"}"></i>`;
    return `<i class="${i === cur ? "cur" : ""}"></i>`;
  }).join("");
}

// The top bar: live depth on the left, progress in the middle, sound and quit on the right.
function hudHTML(mid, label) {
  return `<div class="hud">
    <div class="hbox hdepth"><span>Depth</span><b id="hDepth">${fmtM(Scene.depth)}</b></div>
    <div class="hbox hprog"><div class="sq">${mid}</div><span>${label}</span></div>
    <div class="hbtns">${muteBtn()}<button class="ibtn quit" data-act="quit">Quit</button></div>
  </div>`;
}

// ---------- a prompt ----------

// Puts a prompt on screen, counts down, then runs the clock. When an answer is accepted,
// PASS is pressed or time runs out, calls onResolve(hit, typed, round, how), where hit is
// null unless an answer was accepted and how is "hit", "pass" or "time".
function playRound({ pi, secs, hud, onResolve }) {
  clearTimers();
  const bank = bankFor(pi);
  const round = { pi, bank, secs, tried: new Set(), over: false, endsAt: 0, onResolve, live: false };
  curRound = round;
  Scene.banners(true);
  screen.className = "play";
  screen.innerHTML = `
    ${hud}
    <div class="stage" id="stage">
      <div class="pcard">
        <div class="pcat">${esc(categoryOf(pi))}</div>
        <h2 class="ptext">${esc(PROMPTS[pi][0])}</h2>
        <div class="phint">▼ rarer answers sink deeper ▼</div>
      </div>
    </div>
    <div class="bottom" id="bottom">
      <div class="fb" id="fb" aria-live="polite"></div>
      <div class="countdown">Clock starting in <b id="cdn">${COUNTDOWN}</b></div>
    </div>`;
  let n = COUNTDOWN;
  Sound.play("tick");
  countdownId = setInterval(() => {
    n--;
    if (n > 0) { $("#cdn").textContent = n; Sound.play("tick"); return; }
    clearInterval(countdownId); countdownId = 0;
    startClock(round);
  }, 1000);
}

function startClock(round) {
  if (round.over || curRound !== round) return;
  round.live = true;
  const bottom = $("#bottom");
  bottom.innerHTML = `
    <div class="fb" id="fb" aria-live="polite"></div>
    <form class="abar" id="ansForm" autocomplete="off">
      <div class="ring"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" id="ringFg" cx="22" cy="22" r="19"/></svg><b id="secs">${round.secs}</b></div>
      <input id="ans" type="text" maxlength="60" placeholder="type one answer.." autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Your answer">
      <button type="button" class="nbtn pass" id="pass">Pass</button>
      <button type="submit" class="pbtn dive" id="dive" disabled>Dive</button>
    </form>`;
  const input = $("#ans"), dive = $("#dive"), fg = $("#ringFg");
  const C = 2 * Math.PI * 19;
  fg.style.strokeDasharray = C;
  input.focus();
  input.addEventListener("input", () => { Sound.play("key"); dive.disabled = !input.value.trim(); });
  $("#ansForm").addEventListener("submit", e => { e.preventDefault(); guess(input.value); });
  $("#pass").addEventListener("click", () => endRound(null, "", "pass"));

  round.endsAt = performance.now() + round.secs * 1000;
  let lastSec = round.secs;
  timerId = setInterval(() => {
    const left = Math.max(0, (round.endsAt - performance.now()) / 1000);
    const sec = Math.ceil(left);
    fg.style.strokeDashoffset = C * (1 - left / round.secs);
    const ring = fg.closest(".ring");
    ring.classList.toggle("low", left <= 8);
    ring.classList.toggle("crit", left <= 5);
    if (sec !== lastSec) {
      lastSec = sec;
      $("#secs").textContent = sec;
      if (sec <= 5 && sec > 0) Sound.play("tick", sec <= 3);
    }
    if (left <= 0) endRound(null, "", "time");
  }, 50);
}

function feedback(msg, cls) {
  const fb = $("#fb");
  if (!fb) return;
  fb.textContent = msg;
  fb.className = "fb " + (cls || "");
  void fb.offsetWidth;
  fb.classList.add("show");
}

function guess(raw) {
  const r = curRound;
  if (!r || r.over || !r.live) return;
  const typed = raw.trim();
  const input = $("#ans");
  if (!typed) return;
  const k = Match.key(typed);
  if (!k) return;
  if (r.tried.has(k)) { feedback(`you already tried "${typed}"`, "warn"); input.select(); return; }
  const hit = Match.find(r.bank, typed);
  if (hit) return endRound(hit, typed, "hit");
  r.tried.add(k);
  r.endsAt -= WRONG_COST * 1000;
  Sound.play("wrong");
  feedback(`"${typed}" was not accepted`, "bad");
  input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
  input.value = "";
  $("#dive").disabled = true;
}

function endRound(hit, typed, how) {
  const r = curRound;
  if (!r || r.over) return;
  r.over = true;
  clearTimers();
  if (hit && hit.tier === "k") { save.krillions++; persist(); }
  r.onResolve(hit, typed, r, how);
}

function tint(color, strong) {
  const t = $("#tint");
  t.style.setProperty("--c", color);
  t.className = "show" + (strong ? " strong" : "");
}
function untint() { const t = $("#tint"); if (t) t.className = ""; }

// Plays an answer out in three beats: the screen glows in the rarity's colour (without
// naming it), the diver sinks to the new depth, then the result card says what it was.
async function revealSequence({ hit, typed, how, bank, depth, extra }) {
  const color = hit ? TIERS[hit.tier].color : "#8b96a8";
  const card = screen.querySelector(".pcard");
  card.style.setProperty("--c", color);
  card.classList.add("lit");
  $("#bottom").innerHTML = `<div class="locked" style="--c:${color}">${hit ? `“${esc(typed)}”` : how === "pass" ? "passed" : "time's up"}</div>`;
  tint(color, hit && hit.tier === "k");
  Sound.play(hit ? "lock" : "timeout");
  await beat(hit ? 1000 : 700);

  if (hit) {
    card.classList.add("away");
    const ms = Scene.set(depth);
    Sound.play("sink", ms / 1000);
    await beat(ms + 250);
  } else {
    Scene.set(depth);
  }
  untint();
  const stage = $("#stage");
  stage.innerHTML = resultHTML(hit, typed, how, bank, extra);
  paintIcons(stage);
  if (hit) Sound.play("tier", hit.tier);
  await beat(450);
}

// The big result in the middle of the screen.
function resultHTML(hit, typed, how, bank, extra = {}) {
  const T = hit && TIERS[hit.tier];
  const name = hit ? T.name : how === "pass" ? "Passed" : "Out of air";
  const color = hit ? T.color : "#8b96a8";
  const lit = hit ? TIER_ORDER.indexOf(hit.tier) : -1;
  const pts = (hit ? T.pts : 0) + (extra.bonus || 0);
  return `<div class="result" style="--c:${color}">
    <canvas class="ticon" data-icon="${hit ? hit.tier : how === "pass" ? "pass" : "miss"}"></canvas>
    <div class="tname">${name}</div>
    <div class="meter"><span>Common</span><div class="segs">${TIER_ORDER.map((t, i) => `<i style="${i <= lit ? `--s:${TIERS[t].color}` : ""}" class="${i <= lit ? "on" : ""}"></i>`).join("")}</div><span>Rare</span></div>
    ${hit ? `<div class="ans">“${esc(hit.shown)}”</div>` : ""}
    <div class="gain">${hit ? `<b>+${pts} pts</b> · sink ${fmt(pts * METRES_PER_PT)}m` : "+0 pts"}${extra.bonus ? ` <em>incl. +${extra.bonus} only you</em>` : ""}</div>
    <div class="flavor">${extra.flavor || FLAVOR[hit ? hit.tier : how]}</div>
  </div>`;
}

// ---------- solo dives ----------

function todayRecord(create) {
  const d = dayNow();
  if (!save.days[d] && create) save.days[d] = { picks: [], done: false };
  return save.days[d];
}

function startSolo(mode) {
  if (mode === "daily") {
    const day = dayNow(), rec = todayRecord(true);
    game = { mode, day, prompts: dailyPrompts(day), picks: rec.picks, idx: rec.picks.length };
    if (game.idx >= CLASSIC_COUNT) return finish();
    if (game.idx === 0) save.dives++;
  } else {
    game = { mode, prompts: drawPrompts(mode === "endless" ? 1 : CLASSIC_COUNT), picks: [], idx: 0, tanks: TANKS };
    save.dives++;
  }
  persist();
  onQuit = home;
  Scene.set(totalPts(game.picks) * METRES_PER_PT, true);
  Sound.play("ping");
  showPrompt();
}

function promptAt(i) {
  while (i >= game.prompts.length) game.prompts.push(...drawPrompts(1));
  return game.prompts[i];
}

// Classic, Endless and rooms deal prompts from a shuffled deck kept on this device, so every
// prompt comes up once before any comes back. The deck holds prompt text rather than
// positions, and prompts added in an update are shuffled into the deck still to come.
function drawPrompts(n) {
  const index = new Map(PROMPTS.map((p, i) => [p[0], i]));
  let deck = (save.deck || []).filter(q => index.has(q));
  const played = new Set((save.played || []).filter(q => index.has(q)));
  const fresh = PROMPTS.map(p => p[0]).filter(q => !played.has(q) && !deck.includes(q));
  for (const q of fresh) deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, q);
  const out = [];
  while (out.length < n) {
    if (!deck.length) {
      // A new pass: everything except what this draw already took.
      played.clear();
      const taken = new Set(out.map(i => PROMPTS[i][0]));
      deck = shuffled(PROMPTS.length, Math.random).map(i => PROMPTS[i][0]).filter(q => !taken.has(q));
      if (!deck.length) break;
    }
    const q = deck.shift();
    played.add(q);
    out.push(index.get(q));
  }
  save.deck = deck;
  save.played = [...played];
  persist();
  return out;
}

function soloHud() {
  if (game.mode === "endless") {
    const tanks = Array.from({ length: TANKS }, (_, i) => `<i class="tank ${i < game.tanks ? "" : "gone"}"></i>`).join("");
    return hudHTML(tanks, `Prompt ${game.idx + 1}`);
  }
  return hudHTML(squaresHTML(CLASSIC_COUNT, game.picks, game.idx), `Prompt ${Math.min(game.idx + 1, CLASSIC_COUNT)} of ${CLASSIC_COUNT}`);
}

function showPrompt() {
  playRound({ pi: promptAt(game.idx), secs: ROUND_SECS, hud: soloHud(), onResolve: soloResolve });
}

async function soloResolve(hit, typed, r, how) {
  game.picks.push({ pi: r.pi, ans: hit ? hit.shown : null, typed, tier: hit ? hit.tier : null, how });
  if (game.mode === "daily") persist();
  if (how === "time" && game.mode === "endless") game.tanks--;
  const last = game.mode === "endless" ? game.tanks <= 0 : game.picks.length >= CLASSIC_COUNT;
  const flavor = how === "time" && game.mode === "endless" ? `Air tank lost. ${game.tanks} left.` : null;
  await revealSequence({ hit, typed, how, bank: r.bank, depth: totalPts(game.picks) * METRES_PER_PT, extra: { flavor } });
  screen.querySelector(".hud").outerHTML = soloHud();
  $("#bottom").innerHTML = `<button class="pbtn next" id="next">${last ? "Surface" : "Next"} ▶</button>`;
  const next = $("#next");
  next.focus({ preventScroll: true });
  next.addEventListener("click", () => {
    Sound.play("tap");
    if (last) return finish();
    game.idx++;
    showPrompt();
  });
}

function shareText(picks, head) {
  const pts = totalPts(picks), m = pts * METRES_PER_PT;
  const tiles = picks.map(p => p.tier ? TIERS[p.tier].emoji : "⬛").join("");
  return `KRILLION · ${head}\n🌊 ${fmtM(m)} · ${Scene.zone(m).name}\n${tiles}`;
}

function finish() {
  clearTimers();
  curRound = null;
  Scene.banners(false);
  const picks = game.picks, pts = totalPts(picks), depth = pts * METRES_PER_PT;
  let head, isBest = false;
  if (game.mode === "daily") {
    const rec = todayRecord(true);
    if (!rec.done) {
      rec.done = true;
      save.streak = save.lastDone === game.day - 1 ? save.streak + 1 : 1;
      save.maxStreak = Math.max(save.maxStreak, save.streak);
      save.lastDone = game.day;
      if (pts > save.bestDaily) { save.bestDaily = pts; isBest = true; }
    }
    head = `Daily Dive #${diveNo(game.day)}`;
  } else if (game.mode === "classic") {
    if (pts > save.bestClassic) { save.bestClassic = pts; isBest = true; }
    head = "Classic Dive";
  } else {
    if (pts > save.bestInfinite) { save.bestInfinite = pts; isBest = true; }
    head = `Endless Dive · ${picks.length} prompts`;
  }
  persist();
  Scene.set(depth);
  Sound.play("bubbles");
  const text = shareText(picks, head);
  const mode = game.mode;
  onQuit = null;

  screen.className = "end";
  screen.innerHTML = `
    <div class="topbar"><span></span>${muteBtn()}</div>
    <div class="panel endp">
      <div class="elabel">${esc(head)}</div>
      <div class="edepth">${fmtM(depth)}</div>
      <div class="ezone">${Scene.zone(depth).name} · ${fmt(pts)} pts${isBest ? ` · <b>new best</b>` : ""}</div>
      ${mode === "endless" ? "" : `<div class="sq big">${squaresHTML(CLASSIC_COUNT, picks, -1)}</div>`}
      <ol class="elist">${picks.map(p => `
        <li>
          <span class="ecat">${esc(categoryOf(p.pi))}</span>
          <span class="eq">${esc(PROMPTS[p.pi][0])}</span>
          <span class="ea">${p.ans ? esc(p.ans) : `<i>${p.how === "pass" ? "passed" : "out of air"}</i>`}</span>
          <span class="etag" style="--c:${p.tier ? TIERS[p.tier].color : "#59647f"}">${p.tier ? `${TIERS[p.tier].name} +${TIERS[p.tier].pts}` : "+0"}</span>
        </li>`).join("")}
      </ol>
      <div class="row">
        <button class="pbtn" id="share">Share</button>
        <button class="nbtn" id="again">${mode === "daily" ? "Classic dive" : "Dive again"}</button>
      </div>
      ${mode === "daily" ? `<div class="nextdive">Next daily dive in <b id="cd"></b></div>` : ""}
      <button class="nbtn ghost" id="menu">◀ Menu</button>
    </div>`;
  $("#share").addEventListener("click", () => share(text));
  $("#again").addEventListener("click", () => { Sound.play("tap"); startSolo(mode === "daily" ? "classic" : mode); });
  $("#menu").addEventListener("click", () => { Sound.play("tap"); home(); });
  if ($("#cd")) runCountdown($("#cd"));
  game = null;
}

function share(text) {
  const url = location.href.split(/[?#]/)[0];
  const full = `${text}\n${url}`;
  Sound.play("tap");
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    navigator.share({ text: full }).catch(() => {});
    return;
  }
  const done = () => toast("Copied to clipboard");
  if (navigator.clipboard) navigator.clipboard.writeText(full).then(done, () => fallbackCopy(full) && done());
  else if (fallbackCopy(full)) done();
}
function fallbackCopy(s) {
  const ta = document.createElement("textarea");
  ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  ta.remove();
  return ok;
}

let toastT = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2000);
}

function runCountdown(el) {
  const tick = () => {
    const ms = (dayNow() + 1) * 864e5 - Date.now();
    if (ms <= 0) { clearInterval(countdownId); return; }
    const s = Math.floor(ms / 1000);
    el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
  };
  tick();
  countdownId = setInterval(tick, 1000);
}

// ---------- home ----------

const MODES = {
  classic: { title: "The Classic Dive", desc: `${CLASSIC_COUNT} prompts, ${ROUND_SECS} seconds each. The rarer your answer, the deeper you sink.` },
  endless: { title: "The Endless Dive", desc: `Prompts never stop coming. Run out of air ${TANKS} times and you surface.` },
};

function home() {
  clearTimers();
  game = null; curRound = null; onQuit = null;
  Scene.banners(false);
  Scene.set(0, true);
  const day = dayNow(), rec = save.days[day];
  const best = bestDepth();
  const mode = MODES[save.mode] ? save.mode : "classic";

  screen.className = "home";
  screen.innerHTML = `
    <div class="topbar">
      <div class="left"><a class="back" href="../index.html" aria-label="Back to the game library">‹</a>
        <div class="chip"><canvas data-icon="krill"></canvas><span>Best</span><b>${fmtM(best)}</b></div></div>
      ${muteBtn()}
    </div>
    <div class="title">
      <h1 class="logo" aria-label="Krillion">${"KRILLION".split("").map(c => `<span>${c}</span>`).join("")}</h1>
      <div class="logo-sub">Word Dive</div>
      <div class="mode-title" id="modeTitle">${MODES[mode].title}</div>
      <p class="mode-desc" id="modeDesc">${MODES[mode].desc}</p>
    </div>
    <div class="spacer"></div>
    <div class="actions">
      <div class="seg2" role="tablist">
        ${Object.keys(MODES).map(m => `<button data-mode="${m}" class="${m === mode ? "on" : ""}" role="tab">${m}</button>`).join("")}
      </div>
      <button class="pbtn big" id="begin">▼ Begin descent ▼</button>
      <button class="nbtn wide" id="multi">Play multiplayer</button>
      <button class="nbtn wide" id="daily">${rec && rec.done
        ? `Daily dive #${diveNo(day)} <span class="dim">· ${fmtM(totalPts(rec.picks) * METRES_PER_PT)} ✓</span>`
        : rec && rec.picks.length ? `Resume daily dive <span class="dim">· ${rec.picks.length}/${CLASSIC_COUNT}</span>`
        : `Daily dive #${diveNo(day)}`}</button>
      <div class="foot">
        <button class="link" id="how">How to play</button>
        ${save.streak && save.lastDone >= day - 1 ? `<span>streak ${save.streak}</span>` : ""}
        <span>${save.krillions} krillions found</span>
      </div>
    </div>`;
  paintIcons(screen);
  screen.querySelectorAll(".seg2 button").forEach(b => b.addEventListener("click", () => {
    save.mode = b.dataset.mode; persist();
    Sound.play("tap");
    screen.querySelectorAll(".seg2 button").forEach(x => x.classList.toggle("on", x === b));
    $("#modeTitle").textContent = MODES[save.mode].title;
    $("#modeDesc").textContent = MODES[save.mode].desc;
  }));
  $("#begin").addEventListener("click", () => startSolo(save.mode === "endless" ? "endless" : "classic"));
  $("#multi").addEventListener("click", () => { Sound.play("tap"); Room.open(); });
  $("#daily").addEventListener("click", () => {
    if (rec && rec.done) { game = { mode: "daily", day, prompts: dailyPrompts(day), picks: rec.picks, idx: CLASSIC_COUNT }; finish(); }
    else startSolo("daily");
  });
  $("#how").addEventListener("click", () => { Sound.play("tap"); howTo(); });
  $("#begin").focus({ preventScroll: true });
  if (!save.seenHelp) { save.seenHelp = true; persist(); howTo(); }
}

function howTo() {
  const m = $("#modal");
  m.innerHTML = `<div class="panel sheet" role="document">
    <h2>How to dive</h2>
    <ol>
      <li>Each prompt asks you to name something, like <i>"Name a cheese."</i></li>
      <li>You get <b>${ROUND_SECS} seconds</b> and one answer that counts. An answer that isn't in the bank costs <b>${WRONG_COST}s</b>; try again.</li>
      <li><b>Rarer answers score more</b>, and every point sinks you <b>${METRES_PER_PT}m</b> deeper.</li>
      <li>Stuck? <b>Pass</b> skips the prompt for 0 points.</li>
    </ol>
    <div class="tier-table">${TIER_ORDER.map(t => `<div style="--c:${TIERS[t].color}"><canvas data-icon="${t}"></canvas><span>${TIERS[t].name}</span><b>${TIERS[t].pts}</b></div>`).join("")}</div>
    <p class="small">"Too Clever" is for answers that are technically right but dodge the question, like <i>tomato</i> for a fruit. With friends, an answer nobody else gave earns <b>+15</b>.</p>
    <button class="pbtn" id="closeHow">Let's dive</button>
  </div>`;
  paintIcons(m);
  m.classList.remove("hidden");
  const close = () => { m.classList.add("hidden"); const b = $("#begin"); if (b) b.focus(); };
  $("#closeHow").addEventListener("click", close);
  $("#closeHow").focus();
  m.onclick = e => { if (e.target === m) close(); };
}

addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#modal").classList.contains("hidden")) { $("#closeHow").click(); return; }
  if (e.key !== "Enter" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
  const b = $("#next");
  if (b) { e.preventDefault(); b.click(); }
});

home();
