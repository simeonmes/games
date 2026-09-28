"use strict";
// Menus, settings, saving and the fixed 60 Hz loop.
//
// Saves live in localStorage (versioned JSON). The chapter is saved whenever you enter a
// room, collect a strawberry, die or leave the page, and can be exported to a file.

const SAVE_KEY = "mountVeil.save.v1";
const SETTINGS_KEY = "mountVeil.settings.v1";
const SAVE_VERSION = 1;

const $ = (id) => document.getElementById(id);

const App = {
  state: "title",       // title | play | done
  paused: false,
  game: null,
  save: null,
  settings: null,
  saveT: 0,
  settingsFrom: null,

  // ------------------------------------------------------------------ storage

  defaultSettings() {
    return {
      binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)), grabMode: "hold", shake: true, timer: false, muted: false,
      assist: { speed: 1, infiniteStamina: false, airDashes: "default", invincible: false },
    };
  },

  load() {
    this.settings = this.defaultSettings();
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s) {
        Object.assign(this.settings, s);
        this.settings.assist = Object.assign(this.defaultSettings().assist, s.assist);
        for (const a of Object.keys(DEFAULT_BINDS)) if (!Array.isArray(this.settings.binds[a])) this.settings.binds[a] = DEFAULT_BINDS[a].slice();
      }
    } catch (e) { /* storage unavailable: defaults */ }
    try { this.save = this.migrate(JSON.parse(localStorage.getItem(SAVE_KEY) || "null")); } catch (e) { this.save = null; }
  },

  migrate(s) {
    if (!s || typeof s !== "object") return null;
    if (s.version !== SAVE_VERSION) return null;   // (future versions would convert here)
    s.collected = Array.isArray(s.collected) ? s.collected.filter((id) => typeof id === "string") : [];
    s.deaths = +s.deaths || 0; s.time = +s.time || 0;
    if (!CHAPTER.rooms.some((r) => r.id === s.room)) s.room = CHAPTER.rooms[0].id;
    return s;
  },

  writeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } },

  writeSave() {
    if (!this.save) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  },

  // Copy the live game's progress into the save.
  capture() {
    const g = this.game;
    if (!g || !this.save || this.state !== "play") return;
    this.save.room = g.room.id;
    this.save.spawn = g.room.spawns.indexOf(g.spawn);
    this.save.collected = [...g.collected];
    this.save.deaths = g.deaths;
    this.save.time = g.time;
    if (this.assistOn()) this.save.assistUsed = true;
    this.writeSave();
  },

  assistOn() {
    const a = this.settings.assist;
    return a.speed < 1 || a.infiniteStamina || a.airDashes !== "default" || a.invincible;
  },

  // ------------------------------------------------------------------ flow

  newGame(fromStart) {
    const prev = this.save;
    if (fromStart || !prev) {
      this.save = {
        version: SAVE_VERSION, room: CHAPTER.rooms[0].id, spawn: 0, deaths: 0, time: 0,
        collected: prev ? prev.collected : [], assistUsed: false, done: false, best: prev ? prev.best : null,
      };
    }
    const s = this.save;
    this.game = new Game(CHAPTER, {
      startRoom: s.room, startSpawn: s.spawn, collected: s.collected, deaths: s.deaths, time: s.time, assist: this.settings.assist,
    });
    this.state = "play";
    this.paused = false;
    Render.reset(this.game);
    Render.banner = { text: fromStart || !prev ? CHAPTER.subtitle : this.game.room.name, t: 0 };
    Sound.init();
    this.show(null);
    this.writeSave();
  },

  toTitle() {
    this.capture();
    this.state = "title";
    this.paused = false;
    this.titleScene();
    this.refreshTitle();
    this.show("title");
  },

  // A calm scene behind the title: the climber waiting at the trailhead.
  titleScene() {
    this.game = new Game(CHAPTER, { quiet: true, collected: this.save ? this.save.collected : [] });
    Render.reset(this.game);
    Render.banner = null;
  },

  pause(on) {
    if (this.state !== "play") return;
    this.paused = on ?? !this.paused;
    if (this.paused) { this.capture(); this.refreshPause(); this.show("pause"); }
    else this.show(null);
  },

  finish() {
    const g = this.game, s = this.save;
    this.capture();
    s.done = true;
    const run = { time: g.time, deaths: g.deaths, berries: g.collected.size, assist: !!s.assistUsed };
    if (!s.best || run.time < s.best.time) s.best = run;
    this.writeSave();
    setTimeout(() => {
      this.state = "done";
      $("doneStats").innerHTML =
        `Time <b>${formatTime(run.time)}</b><br>Deaths <b>${run.deaths}</b><br>Strawberries <b>${run.berries} / ${g.totalBerries()}</b>` +
        (run.assist ? `<br><span class="badge">Assist Mode</span>` : "") +
        (s.best && s.best !== run ? `<br><small>Best time ${formatTime(s.best.time)}</small>` : "");
      this.show("done");
    }, 1600);
  },

  // ------------------------------------------------------------------ UI

  show(id) {
    for (const s of ["title", "pause", "settings", "done"]) $(s).classList.toggle("hidden", s !== id);
    $("touch").classList.toggle("hidden", !(id === null && this.state === "play" && this.touchUI));
  },

  refreshTitle() {
    const s = this.save;
    const canContinue = s && !s.done && (s.room !== CHAPTER.rooms[0].id || s.time > 1);
    $("continue").hidden = !canContinue;
    $("newClimb").textContent = s ? "Climb from the start" : "Climb";
    const total = CHAPTER.rooms.reduce((n, r) => n + r.rows.join("").split("*").length - 1, 0);
    if (s) {
      const room = CHAPTER.rooms.find((r) => r.id === s.room);
      const parts = [];
      if (canContinue) parts.push(`At <b>${room.name}</b>`);
      parts.push(`🍓 ${s.collected.length}/${total}`);
      if (s.best) parts.push(`Best ${formatTime(s.best.time)}${s.best.assist ? " (assist)" : ""}`);
      $("saveInfo").innerHTML = parts.join(" · ");
    } else {
      $("saveInfo").textContent = "";
    }
    const b = this.settings.binds;
    $("bindText").innerHTML = `${keys(b.jump)} jump · ${keys(b.dash)} dash · ${keys(b.grab)} grab`;
  },

  refreshPause() {
    const g = this.game;
    $("pauseStats").innerHTML = `${g.room.name}<br>Time <b>${formatTime(g.time)}</b> · Deaths <b>${g.deaths}</b> · 🍓 <b>${g.collected.size}/${g.totalBerries()}</b>` +
      (this.save.assistUsed || this.assistOn() ? `<span class="badge">Assist</span>` : "");
  },

  openSettings(from) {
    this.settingsFrom = from;
    const st = this.settings, a = st.assist;
    const sp = $("aSpeed");
    if (!sp.options.length) for (let v = 100; v >= 50; v -= 10) sp.add(new Option(`${v}%`, v / 100));
    sp.value = String(a.speed);
    $("aStamina").checked = a.infiniteStamina;
    $("aDashes").value = a.airDashes;
    $("aInvincible").checked = a.invincible;
    $("oGrab").value = st.grabMode;
    $("oShake").checked = st.shake;
    $("oTimer").checked = st.timer;
    $("oSound").checked = !st.muted;
    $("saveMsg").textContent = "";
    this.renderBinds();
    this.show("settings");
  },

  closeSettings() {
    const st = this.settings, a = st.assist;
    a.speed = +$("aSpeed").value;
    a.infiniteStamina = $("aStamina").checked;
    a.airDashes = $("aDashes").value;
    a.invincible = $("aInvincible").checked;
    st.grabMode = $("oGrab").value;
    st.shake = $("oShake").checked;
    st.timer = $("oTimer").checked;
    st.muted = !$("oSound").checked;
    this.applySettings();
    this.writeSettings();
    if (this.settingsFrom === "pause") { this.refreshPause(); this.show("pause"); }
    else { this.refreshTitle(); this.show("title"); }
  },

  applySettings() {
    const st = this.settings;
    Input.binds = st.binds;
    Input.grabMode = st.grabMode;
    Input.grabToggled = false;
    Render.settings.shake = st.shake;
    Render.settings.timer = st.timer;
    Sound.muted = st.muted;
    if (this.game) this.game.assist = st.assist;
  },

  renderBinds() {
    const box = $("binds");
    box.innerHTML = "";
    for (const [act, label] of [["jump", "Jump"], ["dash", "Dash"], ["grab", "Grab"]]) {
      const row = document.createElement("div");
      row.className = "bind";
      row.innerHTML = `<span>${label}</span><span class="keys">${keys(this.settings.binds[act])}</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Change";
      btn.onclick = () => {
        btn.textContent = "Press a key…";
        btn.classList.add("waiting");
        Input.capture = (code) => {
          if (code !== "Escape") {
            // Take the key away from any other action, then make it this one's main key.
            for (const a of Object.keys(this.settings.binds)) this.settings.binds[a] = this.settings.binds[a].filter((k) => k !== code);
            this.settings.binds[act] = [code, ...this.settings.binds[act].slice(0, 2)];
            this.writeSettings();
            this.applySettings();
          }
          this.renderBinds();
        };
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
  },

  exportSave() {
    this.capture();
    const data = JSON.stringify({ game: "mount-veil", save: this.save, settings: this.settings }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "mount-veil-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $("saveMsg").textContent = this.save ? "Save downloaded." : "Nothing saved yet; downloaded your settings.";
  },

  importSave(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const s = this.migrate(data && data.save);
        if (!s) throw new Error("not a Celeste save");
        this.save = s;
        this.writeSave();
        if (data.settings && data.settings.binds) {
          Object.assign(this.settings, data.settings);
          this.writeSettings();
          this.applySettings();
        }
        $("saveMsg").textContent = "Save loaded.";
        if (this.state === "title") this.titleScene();
      } catch (e) {
        $("saveMsg").textContent = "That file isn't a save from this game.";
      }
    };
    r.readAsText(file);
  },

  deleteSave() {
    if (!confirm("Delete your Celeste progress, strawberries and best time?")) return;
    this.save = null;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    $("saveMsg").textContent = "Save deleted.";
    if (this.state === "play") { this.state = "title"; this.titleScene(); this.refreshTitle(); this.show("settings"); this.settingsFrom = "title"; }
  },

  // ------------------------------------------------------------------ events

  handleEvents() {
    const g = this.game;
    for (const e of g.events) {
      Render.effect(e, g);
      if (this.state === "play") Sound.play(e);
      if (e.type === "room" || e.type === "berry") this.capture();
      if (e.type === "complete" && this.state === "play") this.finish();
    }
    g.events.length = 0;
  },

  build() {
    $("continue").onclick = () => this.newGame(false);
    $("newClimb").onclick = () => this.newGame(true);
    $("openSettings").onclick = () => this.openSettings("title");
    $("resume").onclick = () => this.pause(false);
    $("retry").onclick = () => { this.pause(false); this.game.die(); };
    $("pauseSettings").onclick = () => this.openSettings("pause");
    $("quit").onclick = () => this.toTitle();
    $("closeSettings").onclick = () => this.closeSettings();
    $("resetBinds").onclick = () => { this.settings.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); this.writeSettings(); this.applySettings(); this.renderBinds(); };
    $("exportSave").onclick = () => this.exportSave();
    $("importSave").onclick = () => $("importFile").click();
    $("importFile").onchange = (e) => { if (e.target.files[0]) this.importSave(e.target.files[0]); e.target.value = ""; };
    $("deleteSave").onclick = () => this.deleteSave();
    $("again").onclick = () => this.newGame(true);
    $("toTitle").onclick = () => this.toTitle();
    $("touchPause").onclick = () => this.pause(true);

    Input.onPause = (code) => {
      if (Input.capture) return;
      if (this.state === "play") {
        if (code === "Enter" && this.paused) return;
        this.pause();
      } else if (code === "Escape" && !$("settings").classList.contains("hidden")) {
        this.closeSettings();
      }
    };
    // Show touch controls once the screen is touched.
    const touchOn = () => { this.touchUI = true; if (this.state === "play" && !this.paused) this.show(null); };
    if (matchMedia("(pointer: coarse)").matches) this.touchUI = true;
    addEventListener("touchstart", touchOn, { once: true, passive: true });
    addEventListener("pointerdown", () => Sound.init(), { once: true });
    addEventListener("pagehide", () => this.capture());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { this.capture(); if (this.state === "play" && !this.paused) this.pause(true); }
    });
  },
};

function keys(list) { return list.map((k) => `<kbd>${Input.keyName(k)}</kbd>`).join(""); }

// ---------------------------------------------------------------------------- loop

let last = performance.now(), acc = 0;

function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const g = App.game;
  let speed = 1;
  if (App.state === "play" && !App.paused) {
    // Fixed 60 Hz steps, whatever the screen's refresh rate. Assist Mode's game speed
    // simply feeds less time in.
    speed = App.settings.assist.speed;
    acc += dt * speed;
    let n = 0;
    while (acc >= DT && n < 8) {
      g.step(Input.frame());
      App.handleEvents();
      acc -= DT;
      n++;
    }
    if (n === 8) acc = 0;
  } else if (App.state === "title") {
    Input.clearEdges();
    g.step({ mx: 0, my: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false });
    g.events.length = 0;
  } else {
    Input.clearEdges();
    App.handleEvents();
  }
  g.paused = App.paused;
  Render.frame(g, App.paused ? 0 : dt * speed);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------- boot

App.load();
Input.init();
Input.initTouch($("touch"));
Render.init($("game"));
App.applySettings();
App.build();
App.toTitle();
requestAnimationFrame(loop);

window.__MV = { App, Game, CHAPTER, Render, Input };
