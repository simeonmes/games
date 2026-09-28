"use strict";
// Menus, settings, saving and the fixed 60 Hz loop.
//
// Saves live in localStorage (versioned JSON). The chapter is saved whenever you enter a
// room, collect a strawberry, die or leave the page, and can be exported to a file.

const SAVE_KEY = "mountVeil.save.v1";
const SETTINGS_KEY = "mountVeil.settings.v1";
const SAVE_VERSION = 2;

const $ = (id) => document.getElementById(id);
const chapterById = (id) => CHAPTERS.find((c) => c.id === id);
const berryCount = (ch) => ch.rooms.reduce((n, r) => n + r.rows.join("").split("*").length - 1, 0);

const App = {
  state: "title",       // title | play | done
  paused: false,
  game: null,
  chapter: CHAPTERS[0],
  save: null,           // { version, collected: [ids], chapters: { id: progress } }
  settings: null,
  settingsFrom: null,

  // ------------------------------------------------------------------ storage

  defaultSettings() {
    return {
      binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)), grabMode: "hold", shake: true, timer: false, muted: false, musicVolume: 0.6,
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
    if (!this.save) this.save = this.emptySave();
  },

  emptySave() { return { version: SAVE_VERSION, collected: [], chapters: {} }; },

  migrate(s) {
    if (!s || typeof s !== "object") return null;
    if (s.version === 1) {
      // Version 1 had a single chapter: it becomes chapter 1, berry ids get the chapter prefix.
      s = {
        version: 2,
        collected: (s.collected || []).map((id) => `c1/${id}`),
        chapters: { c1: { room: s.room, spawn: s.spawn, deaths: s.deaths, time: s.time, assistUsed: s.assistUsed, done: s.done, best: s.best, started: true } },
      };
    }
    if (s.version !== SAVE_VERSION || typeof s.chapters !== "object") return null;
    s.collected = Array.isArray(s.collected) ? s.collected.filter((id) => typeof id === "string") : [];
    for (const [id, c] of Object.entries(s.chapters)) {
      const ch = chapterById(id);
      if (!ch || !c) { delete s.chapters[id]; continue; }
      c.deaths = +c.deaths || 0; c.time = +c.time || 0;
      if (!ch.rooms.some((r) => r.id === c.room)) { c.room = ch.rooms[0].id; c.spawn = 0; }
    }
    return s;
  },

  writeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } },
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } },

  progress(ch) { return this.save.chapters[ch.id]; },
  unlocked(ch) {
    const i = CHAPTERS.indexOf(ch);
    return i === 0 || !!(this.save.chapters[CHAPTERS[i - 1].id] || {}).done;
  },

  // Copy the live game's progress into the save.
  capture() {
    const g = this.game;
    if (!g || this.state !== "play") return;
    const c = this.progress(this.chapter);
    c.room = g.room.id;
    c.spawn = g.room.spawns.indexOf(g.spawn);
    c.deaths = g.deaths;
    c.time = g.time;
    if (this.assistOn()) c.assistUsed = true;
    this.save.collected = [...new Set([...this.save.collected, ...g.collected])];
    this.writeSave();
  },

  assistOn() {
    const a = this.settings.assist;
    return a.speed < 1 || a.infiniteStamina || a.airDashes !== "default" || a.invincible;
  },

  // ------------------------------------------------------------------ flow

  // Play a chapter: carry on where you left off, or start it over.
  play(ch, fromStart) {
    if (!this.unlocked(ch)) return;
    this.chapter = ch;
    let c = this.progress(ch);
    const fresh = fromStart || !c || c.done || !c.started;
    if (fresh) {
      c = this.save.chapters[ch.id] = {
        room: ch.rooms[0].id, spawn: 0, deaths: 0, time: 0, assistUsed: false, done: false,
        best: c ? c.best : null, started: true,
      };
    }
    this.game = new Game(ch, {
      startRoom: c.room, startSpawn: c.spawn, collected: this.save.collected, deaths: c.deaths, time: c.time, assist: this.settings.assist,
    });
    this.state = "play";
    this.paused = false;
    Render.reset(this.game);
    Render.banner = { text: fresh ? ch.subtitle : this.game.room.name, t: 0 };
    Sound.init();
    Music.playFor(this.game.room.index, this.game.rooms.length);
    this.show(null);
    this.writeSave();
  },

  toTitle() {
    this.capture();
    this.state = "title";
    this.paused = false;
    Music.stop();
    this.titleScene();
    this.refreshTitle();
    this.show("title");
  },

  // A calm scene behind the title: the start of the furthest chapter you've reached.
  titleScene() {
    const ch = [...CHAPTERS].reverse().find((c) => this.unlocked(c)) || CHAPTERS[0];
    this.game = new Game(ch, { quiet: true, collected: this.save.collected });
    Render.reset(this.game);
    Render.banner = null;
  },

  pause(on) {
    if (this.state !== "play") return;
    this.paused = on ?? !this.paused;
    Music.duck(this.paused);
    if (this.paused) { this.capture(); this.refreshPause(); this.show("pause"); }
    else this.show(null);
  },

  finish() {
    const g = this.game, ch = this.chapter;
    this.capture();
    const c = this.progress(ch);
    c.done = true;
    const got = g.rooms.reduce((n, r) => n + r.berries.filter((b) => g.collected.has(b.id)).length, 0);
    const run = { time: g.time, deaths: g.deaths, berries: got, assist: !!c.assistUsed };
    const prevBest = c.best;
    if (!c.best || run.time < c.best.time) c.best = run;
    this.writeSave();
    const next = CHAPTERS[CHAPTERS.indexOf(ch) + 1];
    setTimeout(() => {
      this.state = "done";
      $("doneTitle").textContent = next ? `${ch.name.toUpperCase()} CLEARED` : "SUMMIT REACHED";
      $("doneStats").innerHTML =
        `Time <b>${formatTime(run.time)}</b><br>Deaths <b>${run.deaths}</b><br>Strawberries <b>${run.berries} / ${g.totalBerries()}</b>` +
        (run.assist ? `<br><span class="badge">Assist Mode</span>` : "") +
        (prevBest && c.best !== run ? `<br><small>Best time ${formatTime(c.best.time)}</small>` : "") +
        (next ? `<br><small>Unlocked: ${next.subtitle}</small>` : "");
      $("nextChapter").hidden = !next;
      this.show("done");
    }, 1600);
  },

  // ------------------------------------------------------------------ UI

  show(id) {
    for (const s of ["title", "pause", "settings", "done"]) $(s).classList.toggle("hidden", s !== id);
    $("touch").classList.toggle("hidden", !(id === null && this.state === "play" && this.touchUI));
  },

  refreshTitle() {
    const box = $("chapters");
    box.innerHTML = "";
    const themes = { c1: ["#6a3fd0", "#3a2470"], c2: ["#2f6fa8", "#1b3a5c"], c3: ["#c0507a", "#5a2448"] };
    CHAPTERS.forEach((ch, i) => {
      const c = this.progress(ch), open = this.unlocked(ch);
      const got = this.save.collected.filter((id) => id.startsWith(ch.id + "/")).length;
      const b = document.createElement("button");
      b.className = "chap" + (open ? "" : " locked");
      const [c1, c2] = themes[ch.id] || themes.c1;
      b.style.setProperty("--c1", c1); b.style.setProperty("--c2", c2);
      let info;
      if (!open) info = `🔒 Finish ${CHAPTERS[i - 1].name} to unlock`;
      else if (c && c.started && !c.done) info = `Continue · ${ch.rooms.find((r) => r.id === c.room).name}`;
      else if (c && c.done) info = `✔ Cleared${c.best ? ` · best ${formatTime(c.best.time)}${c.best.assist ? " (assist)" : ""}` : ""}`;
      else info = "Start";
      b.innerHTML = `<span class="num">Chapter ${i + 1}</span><span class="name">${ch.name}</span>` +
        `<span class="info">${info}<br>🍓 ${got} / ${berryCount(ch)}</span>` +
        (open && c && c.started && !c.done ? `<span class="restart" data-restart>Start over</span>` : "");
      b.onclick = (e) => { if (open) this.play(ch, !!e.target.dataset.restart); };
      box.appendChild(b);
    });
    const bb = this.settings.binds;
    $("bindText").innerHTML = `${keys(bb.jump)} jump · ${keys(bb.dash)} dash · ${keys(bb.grab)} grab`;
  },

  refreshPause() {
    const g = this.game;
    $("pauseStats").innerHTML = `${g.room.name}<br>Time <b>${formatTime(g.time)}</b> · Deaths <b>${g.deaths}</b> · 🍓 <b>${g.collected.size}/${g.totalBerries()}</b>` +
      (this.progress(this.chapter).assistUsed || this.assistOn() ? `<span class="badge">Assist</span>` : "");
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
    $("musicVol").value = String(st.musicVolume ?? 0.6);
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
    Music.setMuted(st.muted);
    Music.setVolume(st.musicVolume ?? 0.6);
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
    $("saveMsg").textContent = "Save downloaded.";
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
        if (this.state === "title") { this.titleScene(); this.refreshTitle(); }
      } catch (e) {
        $("saveMsg").textContent = "That file isn't a save from this game.";
      }
    };
    r.readAsText(file);
  },

  deleteSave() {
    if (!confirm("Delete your Celeste progress, strawberries and best time?")) return;
    this.save = this.emptySave();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    $("saveMsg").textContent = "Save deleted.";
    if (this.state === "play") { this.state = "title"; this.titleScene(); this.show("settings"); this.settingsFrom = "title"; }
    this.refreshTitle();
  },

  // ------------------------------------------------------------------ events

  handleEvents() {
    const g = this.game;
    for (const e of g.events) {
      Render.effect(e, g);
      if (this.state === "play") Sound.play(e);
      if (e.type === "room" || e.type === "berry") this.capture();
      if (e.type === "room") Music.playFor(g.room.index, g.rooms.length);
      if (e.type === "complete" && this.state === "play") this.finish();
    }
    g.events.length = 0;
  },

  build() {
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
    $("addMusic").onclick = () => $("musicFile").click();
    $("musicFile").onchange = async (e) => {
      const n = await Music.add(e.target.files);
      e.target.value = "";
      if (!n) alert("Those files aren't audio files the browser can play.");
    };
    $("clearMusic").onclick = () => Music.clear();
    $("musicVol").oninput = (e) => { this.settings.musicVolume = +e.target.value; Music.setVolume(+e.target.value); this.writeSettings(); };
    Music.onChange = () => {
      $("musicList").innerHTML = Music.tracks.map((t) => `<li>${t.name.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</li>`).join("");
    };
    $("again").onclick = () => this.play(this.chapter, true);
    $("nextChapter").onclick = () => this.play(CHAPTERS[CHAPTERS.indexOf(this.chapter) + 1], true);
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
Music.init();
Input.init();
Input.initTouch($("touch"));
Render.init($("game"));
App.applySettings();
App.build();
App.toTitle();
requestAnimationFrame(loop);

window.__MV = { App, Game, CHAPTERS, Render, Input, Music };
