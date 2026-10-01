"use strict";
// Game flow: title and level select (with the autopilot riding in the background), rides,
// pause, results with stars, saves, and keyboard-only menu navigation.

const STEP = DT;
const SAVE_KEY = "motox3m-fan-v1";

const game = {
  state: "menu", // menu | play | done
  paused: false,
  levelIndex: 0,
  world: null,
  demo: null,
  demoLevel: 0,
  demoT: 0,
  prev: null,
  doneT: 0,
  save: { levels: {}, bike: "dirt", muted: false },
};

// ------------------------------------------------------------------ saves

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (s && typeof s === "object") {
      game.save.levels = s.levels && typeof s.levels === "object" ? s.levels : {};
      game.save.bike = BIKES.some((b) => b.id === s.bike) ? s.bike : "dirt";
      game.save.muted = !!s.muted;
    }
  } catch (_) { /* storage unavailable */ }
}

function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save)); } catch (_) { /* storage unavailable */ }
}

const levelRec = (i) => game.save.levels[i] || null;
const totalStars = () => LEVELS.reduce((n, _, i) => n + ((levelRec(i) && levelRec(i).stars) || 0), 0);
const levelOpen = (i) => i === 0 || !!levelRec(i - 1);
const bikeOpen = (b) => totalStars() >= b.unlock;
const currentBike = () => {
  const b = BIKES.find((x) => x.id === game.save.bike) || BIKES[0];
  return bikeOpen(b) ? b : BIKES[0];
};

function starsFor(L, t) {
  const [t3, t2] = L.stars;
  return t <= t3 ? 3 : t <= t2 ? 2 : 1;
}

// ------------------------------------------------------------------ rides

function startLevel(i) {
  Sound.init();
  game.levelIndex = i;
  game.world = new World(LEVELS[i], currentBike());
  game.prev = null;
  game.state = "play";
  game.paused = false;
  Render.clearEffects();
  Render.snapCamera();
  Input.clear();
  UI.show(null);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (Input.touch.enabled || matchMedia("(pointer: coarse)").matches) {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {})).catch(() => {});
    }
  }
}

function newDemo() {
  const pool = [0, 1, 2].filter((i) => i < LEVELS.length);
  game.demoLevel = pool[(pool.indexOf(game.demoLevel) + 1) % pool.length] || 0;
  game.demo = new World(LEVELS[game.demoLevel], BIKES[Math.floor(Math.random() * BIKES.length)]);
  game.demoT = 0;
  game.prev = null;
  Render.clearEffects();
  Render.snapCamera();
}

function toMenu() {
  game.state = "menu";
  game.paused = false;
  game.world = null;
  Sound.stopEngine();
  if (!game.demo) newDemo();
  game.prev = null;
  Render.snapCamera();
  UI.buildMenu();
  UI.show("menu");
}

function togglePause() {
  if (game.state !== "play") return;
  game.paused = !game.paused;
  UI.show(game.paused ? "pause" : null);
  if (game.paused) Sound.stopEngine();
}

function finishLevel() {
  const w = game.world, i = game.levelIndex, L = LEVELS[i];
  const t = Math.round(w.score * 100) / 100;
  const stars = starsFor(L, t);
  const before = totalStars();
  const rec = levelRec(i);
  const newBest = !rec || t < rec.best;
  game.save.levels[i] = { best: rec ? Math.min(rec.best, t) : t, stars: Math.max(stars, rec ? rec.stars : 0) };
  writeSave();
  const after = totalStars();
  const unlocked = BIKES.filter((b) => b.unlock > before && b.unlock <= after);
  UI.showResults({ t, stars, newBest, best: game.save.levels[i].best, flips: w.flips, crashes: w.deaths, unlocked });
}

// ------------------------------------------------------------------ main loop

let last = performance.now(), acc = 0, prevStart = false;

function currentWorld() { return game.state === "menu" ? game.demo : game.world; }

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const pad = Input.pad();
  if (pad && pad.start && !prevStart) {
    if (game.state === "play") togglePause();
  }
  prevStart = !!(pad && pad.start);
  UI.padNav(pad);

  const w = currentWorld();
  if (!w) return;
  const running = !game.paused;
  if (running) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 20) {
      game.prev = { x: w.bike.x, y: w.bike.y, a: w.bike.a };
      const inp = game.state === "menu" ? autopilot(w) : Input.read();
      w.step(inp);
      acc -= STEP;
      n++;
      for (const e of w.events) handleEvent(e, w);
      w.events.length = 0;
    }
    if (n === 20) acc = 0;
  }

  if (game.state === "menu") {
    game.demoT += dt;
    if ((w.finished && w.bike.speed < 30) || game.demoT > 60 || w.deaths > 3) newDemo();
  }
  if (game.state === "done" && !game.paused) {
    game.doneT -= dt;
    if (game.doneT <= 0 && !UI.resultsShown) finishLevel();
  }

  // Draw between the last two physics steps so motion stays smooth at any frame rate.
  const b = w.bike;
  let pose = { x: b.x, y: b.y, a: b.a };
  const p = game.prev;
  if (p && running && Math.hypot(p.x - b.x, p.y - b.y) < 200) {
    const k = acc / STEP;
    pose = { x: p.x + (b.x - p.x) * k, y: p.y + (b.y - p.y) * k, a: p.a + (b.a - p.a) * k };
  }
  Render.frame(game.state === "menu" ? game.demo : w, pose, running ? dt : 0, {
    hud: game.state !== "menu",
    levelIndex: game.levelIndex,
  });

  const riding = game.state !== "menu" && running && !b.crashed;
  Sound.updateEngine(Math.abs(b.wheels[0].spin) / (b.stats.speed / WHEEL_R), b.gas, riding);
}

function handleEvent(e, w) {
  Render.effect(e, w);
  if (game.state === "menu") return;
  switch (e.type) {
    case "crash": Sound.crash(); break;
    case "boom": Sound.boom(); break;
    case "land": Sound.land(e.power); break;
    case "flip": Sound.flip(e.n); break;
    case "checkpoint": Sound.checkpoint(); break;
    case "finish":
      Sound.finish();
      game.state = "done";
      game.doneT = 1.6;
      UI.resultsShown = false;
      break;
  }
}

// ------------------------------------------------------------------ UI

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let current = "menu";

  function show(id) {
    current = id;
    for (const s of ["menu", "pause", "results"]) $(s).classList.toggle("hidden", s !== id);
    Input.captureKeys = id === null;
    if (id) setTimeout(() => focusDefault(id), 0);
  }

  function focusDefault(id) {
    let el = null;
    if (id === "menu") {
      const btns = [...document.querySelectorAll("#levels button:not(.locked)")];
      el = btns.find((b) => !levelRec(+b.dataset.i)) || btns[btns.length - 1];
      if (game.lastPlayed != null) el = document.querySelector(`#levels button[data-i="${game.lastPlayed}"]`) || el;
    } else if (id === "pause") el = $("resume");
    else if (id === "results") el = $("next").hidden ? $("retry") : $("next");
    if (el) el.focus({ preventScroll: false });
  }

  function buildMenu() {
    $("totalStars").textContent = `★ ${totalStars()} / ${LEVELS.length * 3}`;
    const grid = $("levels");
    grid.innerHTML = "";
    LEVELS.forEach((L, i) => {
      const rec = levelRec(i), open = levelOpen(i);
      const b = document.createElement("button");
      b.dataset.i = i;
      if (!open) b.classList.add("locked");
      const st = rec ? rec.stars : 0;
      b.innerHTML = `<span class="n">${i + 1}</span><span class="nm">${L.name}</span>` +
        `<span class="st">${"<i>★</i>".repeat(st)}${"★".repeat(3 - st)}</span>` +
        `<span class="bt">${rec ? Render.fmt(rec.best) : ""}</span>`;
      b.setAttribute("aria-label", `Level ${i + 1}, ${L.name}${open ? `, ${st} stars` : ", locked"}`);
      b.addEventListener("click", () => {
        if (!levelOpen(i)) { Sound.init(); Sound.click(); return; }
        game.lastPlayed = i;
        startLevel(i);
      });
      grid.appendChild(b);
    });

    const bikes = $("bikes");
    bikes.innerHTML = "";
    const cur = currentBike();
    for (const bk of BIKES) {
      const b = document.createElement("button");
      const open = bikeOpen(bk);
      if (!open) b.classList.add("locked");
      if (bk === cur) b.classList.add("on");
      b.innerHTML = `<canvas style="width:110px;height:58px"></canvas>${bk.name}<small>${open ? statLine(bk) : `🔒 ${bk.unlock} ★ to unlock`}</small>`;
      b.addEventListener("click", () => {
        if (!bikeOpen(bk)) return;
        game.save.bike = bk.id;
        writeSave();
        for (const o of bikes.children) o.classList.toggle("on", o === b);
      });
      bikes.appendChild(b);
      Render.preview(b.querySelector("canvas"), bk);
    }
  }

  function statLine(bk) {
    const base = BIKES[0];
    const pct = Math.round(((bk.speed / base.speed + bk.torque / base.torque + bk.lean / base.lean) / 3 - 1) * 100);
    return pct > 0 ? `+${pct}% speed & handling` : "starter bike";
  }

  function showResults(r) {
    UI.resultsShown = true;
    const i = game.levelIndex;
    $("resTitle").textContent = i === LEVELS.length - 1 ? "ALL LEVELS DONE!" : "LEVEL COMPLETE";
    $("resTime").textContent = Render.fmt(r.t);
    $("resBest").innerHTML = r.newBest ? `<span class="new">NEW BEST!</span>` : `Best: ${Render.fmt(r.best)}`;
    const L = LEVELS[i];
    const need = r.stars < 3 ? ` · ${r.stars === 2 ? "3" : "2"} ★ at ${L.stars[r.stars === 2 ? 0 : 1].toFixed(0)} s` : "";
    $("resInfo").textContent = `Flips ${r.flips} · Crashes ${r.crashes}${need}`;
    $("resUnlock").textContent = r.unlocked.length ? `Unlocked: ${r.unlocked.map((b) => b.name).join(", ")}!` : "";
    const stars = $("resStars");
    stars.innerHTML = "<span>★</span><span>★</span><span>★</span>";
    [...stars.children].forEach((s, k) => {
      if (k < r.stars) setTimeout(() => { s.classList.add("on"); Sound.star(k); }, 250 + k * 280);
    });
    $("next").hidden = i >= LEVELS.length - 1;
    show("results");
  }

  // Arrow keys move between the buttons on screen by where they are, so a keyboard alone
  // gets everywhere (the level grid, bikes, and the other buttons).
  function moveFocus(dx, dy) {
    const scr = current && $(current);
    if (!scr) return;
    const btns = [...scr.querySelectorAll("button, a.link, summary")].filter((b) => b.offsetParent !== null && !b.hidden);
    const a = document.activeElement;
    if (!btns.includes(a)) { if (btns[0]) btns[0].focus(); return; }
    const ra = a.getBoundingClientRect();
    const ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
    let best = null, bd = Infinity;
    for (const b of btns) {
      if (b === a) continue;
      const r = b.getBoundingClientRect();
      const bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const px = bx - ax, py = by - ay;
      const along = px * dx + py * dy;
      if (along <= 4) continue;
      const across = Math.abs(px * dy - py * dx);
      const d = along + across * 2.5;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); }
  }

  let padPrev = {};
  function padNav(pad) {
    if (!pad || !current) { padPrev = {}; return; }
    const now = { l: pad.back, r: pad.fwd };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...(pads || [])].find((x) => x && x.connected);
    if (!p) return;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const y = p.axes[1] || 0;
    now.u = b(12) || y < -0.5; now.d = b(13) || y > 0.5; now.a = b(0); now.bk = b(1);
    if (now.u && !padPrev.u) moveFocus(0, -1);
    if (now.d && !padPrev.d) moveFocus(0, 1);
    if (now.l && !padPrev.l) moveFocus(-1, 0);
    if (now.r && !padPrev.r) moveFocus(1, 0);
    if (now.a && !padPrev.a && document.activeElement) document.activeElement.click();
    if (now.bk && !padPrev.bk) {
      if (current === "pause") togglePause();
      else if (current === "results") toMenu();
    }
    padPrev = now;
  }

  function init() {
    loadSave();
    Sound.setMuted(game.save.muted);
    const mute = $("mute");
    mute.textContent = game.save.muted ? "Sound: Off" : "Sound: On";
    mute.addEventListener("click", toggleMute);
    $("resume").addEventListener("click", togglePause);
    $("restart").addEventListener("click", () => startLevel(game.levelIndex));
    $("quit").addEventListener("click", toMenu);
    $("next").addEventListener("click", () => { game.lastPlayed = game.levelIndex + 1; startLevel(game.levelIndex + 1); });
    $("retry").addEventListener("click", () => startLevel(game.levelIndex));
    $("toLevels").addEventListener("click", toMenu);
    newDemo();
    buildMenu();
    show("menu");
  }

  return { init, show, buildMenu, showResults, moveFocus, padNav, get current() { return current; }, resultsShown: false };
})();

function toggleMute() {
  Sound.init();
  game.save.muted = !Sound.muted;
  Sound.setMuted(game.save.muted);
  writeSave();
  document.getElementById("mute").textContent = game.save.muted ? "Sound: Off" : "Sound: On";
}

window.addEventListener("keydown", (e) => {
  const scr = UI.current;
  if (scr && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
    e.preventDefault();
    UI.moveFocus(d[0], d[1]);
    return;
  }
  if (e.repeat) return;
  if (e.code === "Escape" || e.code === "KeyP") {
    if (game.state === "play") togglePause();
    else if (scr === "results" && e.code === "Escape") toMenu();
  } else if (e.code === "KeyM") {
    toggleMute();
  } else if (e.code === "KeyR") {
    if (game.state === "play" || game.state === "done" || scr === "pause") startLevel(game.levelIndex);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state === "play" && !game.paused) togglePause();
});

Input.onFirstTouch = () => document.body.classList.add("touch");
Render.init(document.getElementById("game"));
Input.attachTouch(document.getElementById("game"), togglePause);
UI.init();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });

// Hooks for automated testing.
window.__MX = { game, startLevel, toMenu, LEVELS, STEP };
