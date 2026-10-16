"use strict";
// Krillion: seven prompts a day, 25 seconds each. Name something that fits; the rarer the
// answer, the more points, and every point takes you ten metres deeper. A guess that isn't
// in the bank costs three seconds. Infinite mode keeps going until three prompts time out.

const ROUND_SECS = 25;
const WRONG_COST = 3;
const DAILY_COUNT = 7;
const TANKS = 3;
const METRES_PER_PT = 10;
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / 864e5);

const ZONES = [
  { at: 0,    name: "Sunlight Zone" },
  { at: 200,  name: "Twilight Zone" },
  { at: 1000, name: "Midnight Zone" },
  { at: 4000, name: "Abyssal Zone" },
  { at: 6000, name: "Hadal Zone" },
];
const zoneAt = m => ZONES.filter(z => m >= z.at).pop();

const $ = sel => document.querySelector(sel);
const screen = $("#screen");
const fmt = n => n.toLocaleString("en-US");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- save ----------

const SAVE_KEY = "krillion.v1";
let save = { days: {}, streak: 0, maxStreak: 0, lastDone: null, bestDaily: 0, bestInfinite: 0, dives: 0, krillions: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- daily prompts ----------

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
// The prompt list is walked through in shuffled passes, so a prompt doesn't come back until
// every other one has had a turn.
function dailyPrompts(day) {
  const n = PROMPTS.length, out = [];
  let pos = (day - EPOCH_DAY) * DAILY_COUNT;
  while (out.length < DAILY_COUNT) {
    const pass = Math.floor(pos / n);
    const idx = shuffled(n, rng(pass * 7919 + 1013))[pos % n];
    if (!out.includes(idx)) out.push(idx);
    pos++;
  }
  return out;
}

const banks = new Map();
function bankFor(i) {
  if (!banks.has(i)) banks.set(i, Match.build(PROMPTS[i][1]));
  return banks.get(i);
}

// ---------- ocean ----------

const Sea = (() => {
  const cv = $("#sea"), cx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, shown = 0, target = 0, t = 0;
  const stops = [
    [0, [74, 194, 235]], [150, [22, 120, 186]], [600, [12, 70, 140]], [1500, [8, 36, 88]],
    [4000, [5, 18, 48]], [6500, [3, 8, 24]], [9000, [2, 3, 10]],
  ];
  function col(m) {
    for (let i = 1; i < stops.length; i++) {
      if (m <= stops[i][0]) {
        const [m0, c0] = stops[i - 1], [m1, c1] = stops[i], k = (m - m0) / (m1 - m0);
        return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      }
    }
    return stops[stops.length - 1][1];
  }
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  let motes = [];
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(140, W * H / 9000));
    motes = Array.from({ length: n }, () => newMote(true));
  }
  function newMote(anywhere) {
    const kind = Math.random();
    return {
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 10,
      r: kind < 0.25 ? 1.5 + Math.random() * 3 : 0.6 + Math.random() * 1.4,
      bubble: kind < 0.25, krill: kind > 0.85,
      vy: 0.2 + Math.random() * 0.6, ph: Math.random() * 6.28, glow: Math.random(),
    };
  }
  function frame() {
    t += 1 / 60;
    shown += (target - shown) * 0.04;
    if (Math.abs(target - shown) < 0.5) shown = target;
    const m = shown;
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(col(m)));
    g.addColorStop(1, rgb(col(m + 900)));
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);

    // Sun shafts near the surface.
    const sun = Math.max(0, 1 - m / 350);
    if (sun > 0) {
      cx.save();
      cx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const x = W * (0.1 + i * 0.17) + Math.sin(t * 0.3 + i) * 30;
        const lg = cx.createLinearGradient(0, 0, 0, H * 0.9);
        lg.addColorStop(0, `rgba(255,255,230,${0.10 * sun})`);
        lg.addColorStop(1, "rgba(255,255,230,0)");
        cx.fillStyle = lg;
        cx.beginPath();
        cx.moveTo(x - 20, 0); cx.lineTo(x + 30, 0);
        cx.lineTo(x + 140, H * 0.9); cx.lineTo(x + 40, H * 0.9);
        cx.fill();
      }
      cx.restore();
    }

    const deep = Math.min(1, Math.max(0, (m - 800) / 2500));
    for (const p of motes) {
      p.ph += 0.02;
      if (p.bubble) {
        p.y -= p.vy * 1.6;
        p.x += Math.sin(p.ph) * 0.3;
        cx.strokeStyle = `rgba(200,240,255,${0.35 * (1 - deep * 0.6)})`;
        cx.lineWidth = 1;
        cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.stroke();
        if (p.y < -10) Object.assign(p, newMote(false));
      } else {
        p.y += p.vy * 0.35;   // marine snow drifts down
        p.x += Math.sin(p.ph * 0.5) * 0.2;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.krill) {
          cx.fillStyle = `rgba(255,140,170,${0.55 + 0.3 * Math.sin(p.ph)})`;
          cx.fillRect(p.x, p.y, p.r * 2.2, p.r);
        } else if (deep > 0 && p.glow > 0.6) {
          const a = deep * (0.4 + 0.5 * Math.sin(p.ph * 1.7 + p.glow * 9)) ;
          cx.fillStyle = `rgba(90,255,220,${Math.max(0, a)})`;
          cx.shadowColor = "rgba(90,255,220,0.9)";
          cx.shadowBlur = 8;
          cx.beginPath(); cx.arc(p.x, p.y, p.r * 1.2, 0, 6.283); cx.fill();
          cx.shadowBlur = 0;
        } else {
          cx.fillStyle = `rgba(220,240,255,${0.25 * (1 - deep * 0.5)})`;
          cx.fillRect(p.x, p.y, p.r, p.r);
        }
      }
    }
    Gauge.draw(m);
    requestAnimationFrame(frame);
  }
  addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
  return {
    set(m, instant) { target = m; if (instant) shown = m; },
    get depth() { return shown; },
  };
})();

const Gauge = (() => {
  const el = $("#gauge"), fill = el.querySelector(".fill"), dot = el.querySelector(".dot"), lbl = el.querySelector(".lbl");
  let max = 7000, last = -1;
  return {
    setMax(m) { max = m; },
    draw(m) {
      const r = Math.round(m);
      if (r === last) return;
      last = r;
      const k = Math.min(1, m / max);
      fill.style.height = k * 100 + "%";
      dot.style.top = k * 100 + "%";
      lbl.textContent = fmt(r) + " m";
    },
  };
})();

// ---------- game state ----------

let game = null;     // the solo dive in progress
let curRound = null; // the prompt on screen, solo or in a room
let timerId = 0, countdownId = 0;

function clearTimers() { clearInterval(timerId); clearInterval(countdownId); timerId = countdownId = 0; }

function todayRecord(create) {
  const d = dayNow();
  if (!save.days[d] && create) save.days[d] = { picks: [], done: false };
  return save.days[d];
}

function startDaily() {
  const day = dayNow(), rec = todayRecord(true);
  game = {
    mode: "daily", day, prompts: dailyPrompts(day), picks: rec.picks, idx: rec.picks.length,
  };
  Gauge.setMax(7000);
  Sea.set(totalPts(game.picks) * METRES_PER_PT);
  if (game.idx >= DAILY_COUNT) return finish();
  if (game.idx === 0) save.dives++;
  persist();
  Sound.play("ping");
  showPrompt();
}

function startInfinite() {
  game = {
    mode: "infinite", prompts: shuffled(PROMPTS.length, Math.random), picks: [], idx: 0, tanks: TANKS,
  };
  save.dives++;
  persist();
  Gauge.setMax(7000);
  Sea.set(0);
  Sound.play("ping");
  showPrompt();
}

const totalPts = picks => picks.reduce((s, p) => s + (p.tier ? TIERS[p.tier].pts : 0), 0);

function promptAt(i) {
  const list = game.prompts;
  if (i >= list.length) {   // infinite mode ran through the bank: shuffle another pass on
    list.push(...shuffled(PROMPTS.length, Math.random).filter(x => x !== list[list.length - 1]));
  }
  return list[i];
}

// ---------- play screen ----------

function headerHTML() {
  const pts = totalPts(game.picks);
  let left, mid;
  if (game.mode === "daily") {
    left = `Daily Dive <b>#${diveNo(game.day)}</b>`;
    mid = Array.from({ length: DAILY_COUNT }, (_, i) => {
      const p = game.picks[i];
      const c = p ? (p.tier ? TIERS[p.tier].color : "#33415c") : (i === game.idx ? "cur" : "");
      return `<i class="pip ${c === "cur" ? "cur" : ""}" style="${p ? `background:${c}` : ""}"></i>`;
    }).join("");
  } else {
    left = `Infinite <b>#${game.idx + 1}</b>`;
    mid = Array.from({ length: TANKS }, (_, i) => `<i class="tank ${i < game.tanks ? "" : "gone"}" title="Air tank"></i>`).join("");
  }
  return `<div class="hud">
    <div class="hud-l">${left}</div>
    <div class="hud-m">${mid}</div>
    <div class="hud-r"><b>${fmt(pts)}</b> pts</div>
  </div>`;
}

function showPrompt() {
  playRound({
    pi: promptAt(game.idx), secs: ROUND_SECS, header: headerHTML(),
    label: game.mode === "daily" ? `Prompt ${game.idx + 1} of ${DAILY_COUNT}` : `Prompt ${game.idx + 1}`,
    onResolve: soloResolve,
  });
}

// Puts a prompt on screen with its timer and answer box. When an answer is accepted or time
// runs out, calls onResolve(hit, typed, round) with hit null on a timeout.
function playRound({ pi, secs, header, label, onResolve }) {
  clearTimers();
  const bank = bankFor(pi);
  const round = { pi, bank, secs, tried: new Set(), wrong: [], over: false, endsAt: 0, onResolve };
  curRound = round;
  screen.className = "play";
  screen.innerHTML = `
    ${header}
    <div class="card prompt-card">
      <div class="timer"><div class="bar"></div></div>
      <div class="q-num">${label}</div>
      <h2 class="q">${esc(PROMPTS[pi][0])}</h2>
      <div class="clock"><span id="secs">${secs}</span><small>s</small></div>
      <form id="ansForm" autocomplete="off">
        <input id="ans" type="text" maxlength="60" placeholder="Type an answer…" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Your answer">
        <button type="submit" class="btn dive">Dive</button>
      </form>
      <div id="fb" class="fb" aria-live="polite"></div>
      <div id="misses" class="misses"></div>
    </div>`;
  const input = $("#ans");
  input.focus();
  input.addEventListener("input", () => Sound.play("key"));
  $("#ansForm").addEventListener("submit", e => { e.preventDefault(); guess(input.value); });

  round.endsAt = performance.now() + secs * 1000;
  let lastSec = secs;
  timerId = setInterval(() => {
    const left = Math.max(0, (round.endsAt - performance.now()) / 1000);
    const sec = Math.ceil(left);
    const bar = screen.querySelector(".timer .bar");
    if (bar) {
      bar.style.width = (left / secs * 100) + "%";
      bar.classList.toggle("low", left <= 8);
      bar.classList.toggle("crit", left <= 5);
    }
    if (sec !== lastSec) {
      lastSec = sec;
      const s = $("#secs");
      if (s) { s.textContent = sec; s.parentNode.classList.toggle("crit", sec <= 5); }
      if (sec <= 5 && sec > 0) Sound.play("tick", sec <= 3);
    }
    if (left <= 0) endRound(null, "");
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
  if (!r || r.over) return;
  const typed = raw.trim();
  const input = $("#ans");
  if (!typed) return;
  const k = Match.key(typed);
  if (!k) return;
  if (r.tried.has(k)) {
    feedback(`You already tried “${typed}”`, "warn");
    input.select();
    return;
  }
  const hit = Match.find(r.bank, typed);
  if (hit) return endRound(hit, typed);

  r.tried.add(k);
  r.wrong.push(typed);
  r.endsAt -= WRONG_COST * 1000;
  Sound.play("wrong");
  feedback(`Not in the bank · −${WRONG_COST}s`, "bad");
  const card = screen.querySelector(".prompt-card");
  card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  $("#misses").innerHTML = r.wrong.map(w => `<span>${esc(w)}</span>`).join("");
  input.value = "";
}

function endRound(hit, typed) {
  const r = curRound;
  if (!r || r.over) return;
  r.over = true;
  clearTimers();
  Sound.play(hit ? "tier" : "timeout", hit && hit.tier);
  if (hit && hit.tier === "k") { save.krillions++; persist(); }
  r.onResolve(hit, typed, r);
}

// Swaps the answer box for the result area and returns that element.
function revealArea(hit) {
  const card = screen.querySelector(".prompt-card");
  card.classList.add("revealed");
  card.style.setProperty("--tier", hit ? TIERS[hit.tier].color : "#8a96b5");
  const form = card.querySelector("form"), fb = $("#fb");
  if (form) form.remove();
  if (fb) fb.remove();
  const box = document.createElement("div");
  box.className = "reveal";
  card.appendChild(box);
  return box;
}

function badgeHTML(hit, typed, missText) {
  if (!hit) return `<div class="badge none" style="--c:#8a96b5"><span class="tier-name">Out of air</span><span class="tier-pts">+0</span></div>
    <div class="sink">${missText}</div>`;
  const T = TIERS[hit.tier];
  return `<div class="you">You said <b>${esc(typed)}</b>${Match.norm(typed) !== Match.norm(hit.shown) ? ` <span class="as">(${esc(hit.shown)})</span>` : ""}</div>
    <div class="badge ${hit.tier === "k" ? "krill" : ""}" style="--c:${T.color}">
      <span class="tier-name">${T.name}</span>
      <span class="tier-pts">+${T.pts}</span>
    </div>
    <div class="sink">▼ ${fmt(T.pts * METRES_PER_PT)} m deeper</div>`;
}

// The prompt's rarest answer and a few deep cuts, so every round teaches something.
function rarestHTML(bank, found) {
  const rarest = bank.entries.find(e => e.tier === "k");
  const deeps = bank.entries.filter(e => e.tier === "d" && !found.includes(e.shown));
  const sample = shuffled(deeps.length, Math.random).slice(0, 3).map(i => deeps[i].shown);
  return `<div class="rarest">
    ${found.includes(rarest.shown) ? `<div>The one in a krillion was found: <b style="color:${TIERS.k.color}">${esc(rarest.shown)}</b></div>` :
      `<div>The one in a krillion: <b style="color:${TIERS.k.color}">${esc(rarest.shown)}</b></div>`}
    ${sample.length ? `<div class="cuts">Deep cuts: ${sample.map(esc).join(" · ")}</div>` : ""}
  </div>`;
}

function soloResolve(hit, typed, r) {
  const pick = { pi: r.pi, ans: hit ? hit.shown : null, typed, tier: hit ? hit.tier : null };
  game.picks.push(pick);
  if (game.mode === "daily") persist();
  if (!hit && game.mode === "infinite") game.tanks--;

  const depth = totalPts(game.picks) * METRES_PER_PT;
  if (game.mode === "infinite") Gauge.setMax(Math.max(7000, Math.ceil((depth + 1500) / 1000) * 1000));
  Sea.set(depth);
  const last = game.mode === "daily" ? game.picks.length >= DAILY_COUNT : game.tanks <= 0;

  const box = revealArea(hit);
  box.innerHTML = `
    ${badgeHTML(hit, typed, game.mode === "infinite" ? `Air tank lost · ${game.tanks} left` : "No points for this one")}
    ${rarestHTML(r.bank, hit ? [hit.shown] : [])}
    <button class="btn primary" id="next">${last ? "See results" : "Next prompt"} <kbd>↵</kbd></button>`;
  screen.querySelector(".hud").outerHTML = headerHTML();
  const next = $("#next");
  next.focus({ preventScroll: true });
  next.addEventListener("click", () => {
    Sound.play("tap");
    if (last) return finish();
    game.idx++;
    showPrompt();
  });
}

// ---------- results ----------

function shareText(picks, head) {
  const pts = totalPts(picks);
  const tiles = picks.map(p => p.tier ? TIERS[p.tier].emoji : "⬛").join("");
  return `${head}\n${fmt(pts * METRES_PER_PT)} m · ${fmt(pts)} pts\n${tiles}`;
}

function finish() {
  clearTimers();
  const picks = game.picks, pts = totalPts(picks), depth = pts * METRES_PER_PT;
  let head, best, isBest = false;
  if (game.mode === "daily") {
    const rec = todayRecord(true);
    if (!rec.done) {
      rec.done = true;
      save.streak = save.lastDone === game.day - 1 ? save.streak + 1 : 1;
      save.maxStreak = Math.max(save.maxStreak, save.streak);
      save.lastDone = game.day;
      if (pts > save.bestDaily) { save.bestDaily = pts; isBest = true; }
      persist();
    }
    head = `Krillion Daily Dive #${diveNo(game.day)}`;
    best = save.bestDaily;
  } else {
    if (pts > save.bestInfinite) { save.bestInfinite = pts; isBest = true; persist(); }
    head = `Krillion Infinite · ${picks.length} prompts`;
    best = save.bestInfinite;
  }
  Sea.set(depth);
  Sound.play("bubbles");
  const z = zoneAt(depth);
  const text = shareText(picks, head);

  screen.className = "results";
  screen.innerHTML = `
    <div class="card">
      <div class="r-head">${esc(head)}</div>
      <div class="r-depth">${fmt(depth)}<small> m</small></div>
      <div class="r-zone">${z.name} · ${fmt(pts)} pts${isBest ? ` · <b>New best!</b>` : ""}</div>
      <div class="tiles">${picks.map(p => `<span style="--c:${p.tier ? TIERS[p.tier].color : "#2a3550"}" title="${p.tier ? TIERS[p.tier].name : "Missed"}">${p.tier === "k" ? "🦐" : ""}</span>`).join("")}</div>
      <ol class="r-list">${picks.map(p => `
        <li>
          <span class="r-q">${esc(PROMPTS[p.pi][0])}</span>
          <span class="r-a">${p.ans ? esc(p.ans) : "<i>no answer</i>"}</span>
          <span class="pill" style="--c:${p.tier ? TIERS[p.tier].color : "#59647f"}">${p.tier ? `${TIERS[p.tier].name} +${TIERS[p.tier].pts}` : "Missed +0"}</span>
        </li>`).join("")}
      </ol>
      <div class="row">
        <button class="btn primary" id="share">Share</button>
        <button class="btn" id="home">Surface</button>
      </div>
      ${game.mode === "daily" ? `<div class="next-dive">Next daily dive in <b id="cd"></b></div>
        <button class="btn ghost" id="inf">Keep diving in Infinite</button>` :
        `<div class="next-dive">Best infinite: <b>${fmt(best * METRES_PER_PT)} m</b></div>
        <button class="btn ghost" id="again">Dive again</button>`}
    </div>`;
  $("#share").addEventListener("click", () => share(text));
  $("#home").addEventListener("click", () => { Sound.play("tap"); home(); });
  if ($("#inf")) $("#inf").addEventListener("click", () => { Sound.init(); startInfinite(); });
  if ($("#again")) $("#again").addEventListener("click", () => { Sound.init(); startInfinite(); });
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
  toastT = setTimeout(() => t.classList.remove("show"), 1800);
}

function runCountdown(el) {
  const tick = () => {
    const ms = (dayNow() + 1) * 864e5 - Date.now();
    if (ms <= 0) { clearInterval(countdownId); if (!game) home(); return; }
    const s = Math.floor(ms / 1000);
    el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
  };
  tick();
  countdownId = setInterval(tick, 1000);
}

// ---------- home ----------

function home() {
  clearTimers();
  game = null;
  Sea.set(0);
  Gauge.setMax(7000);
  const day = dayNow(), rec = save.days[day];
  const doneToday = rec && rec.done;
  const inProgress = rec && !rec.done && rec.picks.length > 0;
  const todayPts = rec ? totalPts(rec.picks) : 0;
  const streak = save.lastDone >= day - 1 ? save.streak : 0;

  screen.className = "home";
  screen.innerHTML = `
    <div class="logo">
      ${KRILL_SVG}
      <h1>KRILLION</h1>
      <p>Name the thing nobody else would. The rarer the answer, the deeper you dive.</p>
    </div>
    <div class="card daily">
      <div class="d-top"><span>Daily Dive <b>#${diveNo(day)}</b></span><span class="d-sub">7 prompts · 25 s each</span></div>
      ${doneToday ? `
        <div class="d-score">${fmt(todayPts * METRES_PER_PT)} m <small>· ${fmt(todayPts)} pts</small></div>
        <button class="btn primary" id="view">See today's results</button>
        <div class="next-dive">Next daily dive in <b id="cd"></b></div>` : `
        <button class="btn primary big" id="begin">${inProgress ? `Resume dive (${rec.picks.length}/${DAILY_COUNT})` : "Begin dive"}</button>`}
    </div>
    <button class="card infinite" id="infinite">
      <span class="i-title">Infinite Dive</span>
      <span class="i-sub">Endless prompts until three run out of air${save.bestInfinite ? ` · best ${fmt(save.bestInfinite * METRES_PER_PT)} m` : ""}</span>
    </button>
    <button class="card infinite friends" id="friends">
      <span class="i-title">Play with friends</span>
      <span class="i-sub">Live rooms: share a code, dive the same prompts together and see everyone's answers</span>
    </button>
    <div class="stats">
      <div><b>${streak}</b><span>Streak</span></div>
      <div><b>${fmt(save.bestDaily * METRES_PER_PT)}</b><span>Best (m)</span></div>
      <div><b>${save.dives}</b><span>Dives</span></div>
      <div><b>${save.krillions}</b><span>Krillions</span></div>
    </div>
    <div class="links">
      <button class="link" id="how">How to play</button>
      <button class="link" id="mute">${Sound.muted ? "Sound off" : "Sound on"}</button>
    </div>`;

  if ($("#begin")) $("#begin").addEventListener("click", () => { Sound.init(); startDaily(); });
  if ($("#view")) $("#view").addEventListener("click", () => {
    Sound.init();
    game = { mode: "daily", day, prompts: dailyPrompts(day), picks: rec.picks, idx: DAILY_COUNT };
    finish();
  });
  $("#infinite").addEventListener("click", () => { Sound.init(); startInfinite(); });
  $("#friends").addEventListener("click", () => { Sound.init(); Sound.play("tap"); Room.open(); });
  $("#how").addEventListener("click", () => { Sound.init(); Sound.play("tap"); howTo(); });
  $("#mute").addEventListener("click", e => { Sound.init(); e.target.textContent = Sound.toggle() ? "Sound off" : "Sound on"; Sound.play("tap"); });
  if ($("#cd")) runCountdown($("#cd"));
  const first = $("#begin") || $("#view");
  if (first) first.focus({ preventScroll: true });
  if (!save.seenHelp) { save.seenHelp = true; persist(); howTo(); }
}

function howTo() {
  const m = $("#modal");
  m.innerHTML = `<div class="sheet" role="document">
    <h2>How to play</h2>
    <ol>
      <li>Each prompt asks you to name something, like <i>“Name a cheese.”</i></li>
      <li>You have <b>${ROUND_SECS} seconds</b>. Type an answer and press Enter.</li>
      <li>If your answer isn't in the bank, you lose <b>${WRONG_COST} seconds</b>, then try again.</li>
      <li>Your first accepted answer locks in. <b>Rarer answers score more.</b></li>
      <li>Every point takes you <b>${METRES_PER_PT} m</b> deeper. Seven perfect answers reach 7,000 m.</li>
      <li>In a room with friends, an answer nobody else gave earns a <b>+15</b> bonus.</li>
    </ol>
    <div class="tier-table">${TIER_ORDER.map(t => `<div style="--c:${TIERS[t].color}"><span>${TIERS[t].name}</span><b>${TIERS[t].pts}</b></div>`).join("")}</div>
    <p class="small">“Too Clever” is for answers that are technically right but dodge the question, like <i>tomato</i> for a fruit.
    Everyone gets the same Daily Dive, and a new one starts at midnight UTC. Infinite Dive keeps going until three prompts run out of air.</p>
    <button class="btn primary" id="closeHow">Let's dive</button>
  </div>`;
  m.classList.remove("hidden");
  const close = () => { m.classList.add("hidden"); const f = $("#begin") || $("#view"); if (f) f.focus(); };
  $("#closeHow").addEventListener("click", close);
  $("#closeHow").focus();
  m.onclick = e => { if (e.target === m) close(); };
}

const KRILL_SVG = `<svg class="krill" viewBox="0 0 120 70" aria-hidden="true">
  <defs><linearGradient id="kg" x1="0" x2="1"><stop offset="0" stop-color="#ffb3c8"/><stop offset="1" stop-color="#ff4f86"/></linearGradient></defs>
  <path d="M22 18 C5 6 2 2 0 0 M24 16 C14 2 10 -2 6 -4" stroke="#ffb3c8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M20 30 C20 16 40 12 62 16 C84 20 100 30 108 44 C112 52 104 56 98 50 C90 42 80 38 66 38 C50 38 40 44 30 42 C22 40 20 36 20 30 Z" fill="url(#kg)"/>
  <path d="M44 16 C46 26 46 34 44 40 M56 16 C58 26 58 34 56 39 M68 18 C70 27 70 33 68 38 M80 22 C82 29 81 35 79 39 M91 28 C93 34 92 39 90 42" stroke="rgba(120,0,40,.35)" stroke-width="1.6" fill="none"/>
  <path d="M100 48 L116 52 L108 60 Z M100 48 L114 62 L102 62 Z" fill="#ff4f86"/>
  <g stroke="#ff8fb0" stroke-width="1.6" stroke-linecap="round"><path d="M40 42 L36 58"/><path d="M48 41 L46 60"/><path d="M56 40 L56 60"/><path d="M64 39 L66 59"/><path d="M72 40 L76 57"/></g>
  <circle cx="28" cy="26" r="6.5" fill="#1a0b16"/><circle cx="30" cy="24" r="2.2" fill="#fff"/>
  <circle cx="40" cy="38" r="2" fill="#7dfbe6"/><circle cx="60" cy="36" r="2" fill="#7dfbe6"/><circle cx="80" cy="38" r="2" fill="#7dfbe6"/>
</svg>`;

// Enter on the reveal or result screen moves on even if focus wandered.
addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#modal").classList.contains("hidden")) { $("#closeHow").click(); return; }
  if (e.key !== "Enter" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
  const b = $("#next");
  if (b) { e.preventDefault(); b.click(); }
});

home();
