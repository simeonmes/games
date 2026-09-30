"use strict";
// Menus, settings, saving and the fixed 60 Hz loop.
//
// Saves live in localStorage (versioned JSON). The chapter is saved whenever you enter a
// room, collect a strawberry, die or leave the page, and can be exported to a file.

const SAVE_KEY = "mountVeil.save.v1";
const SETTINGS_KEY = "mountVeil.settings.v1";
const SAVE_VERSION = 2;

const $ = (id) => document.getElementById(id);
// B-sides are harder remixes of each chapter (ids like "c1b"), unlocked by its cassette.
const BSIDE_LIST = typeof BSIDES !== "undefined" ? BSIDES : [];
const ALL_CHAPTERS = CHAPTERS.concat(BSIDE_LIST);
const chapterById = (id) => ALL_CHAPTERS.find((c) => c.id === id);
const baseId = (ch) => ch.base || ch.id;
const bsideOf = (ch) => BSIDE_LIST.find((b) => b.base === ch.id);
const THEME_COLORS = { c1: ["#6a3fd0", "#3a2470"], c2: ["#2f6fa8", "#1b3a5c"], c3: ["#c0507a", "#5a2448"], c4: ["#c0703a", "#5a2e1c"], c5: ["#4a4ad0", "#1c5a6a"], c6: ["#c0902a", "#6a3a1c"], c7: ["#2a8a90", "#123a44"], c8: ["#2a3a60", "#0c1224"], c9: ["#d07aa0", "#6a5a9a"] };
const berryCount = (ch) => ch.rooms.reduce((n, r) => n + (r.rows.join("").match(/[*W]/g) || []).length, 0);

const App = {
  state: "title",       // title | play | scene (a scene outside any chapter) | done
  mode: "story",        // story: the climb carries on chapter to chapter; revisit: replaying a finished chapter
  pendingScene: null,   // a scene waiting for the room slide to finish
  paused: false,
  game: null,
  chapter: CHAPTERS[0],
  save: null,           // { version, collected: [ids], chapters: { id: progress } }
  settings: null,
  settingsFrom: null,

  // ------------------------------------------------------------------ storage

  defaultSettings() {
    return {
      binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)), grabMode: "hold", shake: true, timer: false, muted: false, musicVolume: 0.6, story: true,
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

  emptySave() { return { version: SAVE_VERSION, collected: [], chapters: {}, items: { cassettes: [], hearts: [], goldens: [] }, stats: { deaths: 0 } }; },

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
    // Collectibles and lifetime stats (added later: older saves start them empty).
    const it = s.items && typeof s.items === "object" ? s.items : {};
    s.items = {};
    for (const k of ["cassettes", "hearts", "goldens"]) s.items[k] = Array.isArray(it[k]) ? it[k].filter((x) => typeof x === "string") : [];
    if (!s.stats || typeof s.stats !== "object") s.stats = { deaths: Object.values(s.chapters || {}).reduce((n, c) => n + (+(c && c.deaths) || 0), 0) };
    s.stats.deaths = +s.stats.deaths || 0;
    for (const [id, c] of Object.entries(s.chapters)) {
      const ch = chapterById(id);
      if (!ch || !c) { delete s.chapters[id]; continue; }
      c.deaths = +c.deaths || 0; c.time = +c.time || 0;
      if (!Array.isArray(c.seen)) c.seen = [];
      if (!ch.rooms.some((r) => r.id === c.room)) { c.room = ch.rooms[0].id; c.spawn = 0; }
    }
    return s;
  },

  writeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } },
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } },

  progress(ch) { return this.save.chapters[ch.id]; },
  done(ch) { return !!(this.save.chapters[ch.id] || {}).done; },
  // Where the story is up to: the first chapter not finished yet (null once past the last one).
  storyChapter() { return CHAPTERS.find((ch) => !this.done(ch)) || null; },

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

  // Play a chapter: carry on where you left off, or start it over. In story mode the
  // climb runs on into the next chapter; revisiting replays a chapter you've finished.
  play(ch, fromStart, mode = "story", opts = {}) {
    this.mode = mode;
    this.chapter = ch;
    // Replaying a finished chapter offers its golden strawberry.
    const golden = mode === "revisit" && this.done(ch);
    let c = this.progress(ch);
    const fresh = fromStart || !c || !c.started || (mode === "story" && c.done);
    if (fresh) {
      c = this.save.chapters[ch.id] = {
        room: ch.rooms[0].id, spawn: 0, deaths: 0, time: 0, assistUsed: false, done: !!(c && c.done),
        best: c ? c.best : null, started: true, seen: [],
      };
    }
    const owned = [];
    if (this.save.items.cassettes.includes(baseId(ch))) owned.push("cassette");
    if (this.save.items.hearts.includes(ch.id)) owned.push("heart");
    this.game = new Game(ch, {
      startRoom: c.room, startSpawn: c.spawn, collected: this.save.collected, deaths: c.deaths, time: c.time, assist: this.settings.assist,
      owned, golden: golden && fresh,
    });
    this.state = "play";
    this.paused = false;
    this.pendingScene = null;
    Render.reset(this.game);
    Story.reset(this.game);
    Render.banner = fresh ? null : { text: this.game.room.name, t: 0 };
    Sound.init();
    Music.playFor(this.game.room.index, this.game.rooms.length);
    this.show(null);
    this.writeSave();
    if (fresh && !opts.quick) {
      // A title card for the chapter, then its opening scene.
      const n = CHAPTERS.findIndex((x) => x.id === baseId(ch)) + 1;
      const card = [{ card: [ch.base ? `Chapter ${n} · B-Side` : `Chapter ${n}`, ch.name], chapter: true }];
      const trig = TRIGGERS[ch.id] || {};
      if (this.settings.story && trig.start) Story.play(trig.start, this.game, null, card);
      else Story.play("_none", this.game, null, card);
    }
  },

  // The Begin / Continue button: pick the story up wherever it is.
  continueStory() {
    const ch = this.storyChapter();
    if (!ch) { if (this.done(CHAPTERS[CHAPTERS.length - 1]) && !this.save.epilogue) this.epilogue(); else this.fogEnding(); return; }
    this.play(ch, false, "story");
  },

  // Past the last chapter built so far: a quiet scene, then back to the title.
  fogEnding() {
    this.state = "scene";
    this.paused = false;
    this.show(null);
    Story.play(this.save.epilogue ? "fog2" : "fog", this.game, () => this.toTitle());
  },

  // After the true summit: three days later, at Tilly's cabin by the trailhead.
  epilogue() {
    this.state = "scene";
    this.paused = false;
    this.game = new Game(CHAPTERS[0], { quiet: true, collected: this.save.collected });
    Render.reset(this.game);
    Render.banner = null;
    Story.reset(this.game);
    const n = new Set(this.save.collected).size;
    Story.vars = {
      berries: n === 1 ? "one" : String(n),
      berryLine: n === 0 ? "None! Well. At least you're honest." : n < 30 ? "Hm. That's a small pot of tea." : n < 100 ? "Now that's a proper pot of tea." : "Good grief. That's tea until spring.",
    };
    this.show(null);
    Story.play("epilogue", this.game, () => {
      this.save.epilogue = true;
      this.writeSave();
      Story.play("fog2", this.game, () => this.toTitle());
    });
  },

  seen(id) {
    const c = this.progress(this.chapter);
    if (!c) return true;
    if (!Array.isArray(c.seen)) c.seen = [];
    if (c.seen.includes(id)) return true;
    c.seen.push(id);
    return false;
  },

  toTitle() {
    this.capture();
    if (Story.active) Story.finish(true);
    this.pendingScene = null;
    this.state = "title";
    this.paused = false;
    Music.stop();
    this.titleScene();
    this.refreshTitle();
    this.show("title");
  },

  // A calm scene behind the title: the start of the furthest chapter you've reached.
  titleScene() {
    const ch = this.storyChapter() || CHAPTERS[CHAPTERS.length - 1];
    this.game = new Game(ch, { quiet: true, collected: this.save.collected });
    Render.reset(this.game);
    Render.banner = null;
  },

  pause(on) {
    if (this.state !== "play") return;
    this.paused = on ?? !this.paused;
    Music.duck(this.paused);
    if (this.paused) { this.capture(); this.refreshPause(); $("skipScene").hidden = !Story.active; this.show("pause"); }
    else this.show(null);
  },

  finish() {
    const g = this.game, ch = this.chapter;
    this.capture();
    const c = this.progress(ch);
    c.done = true;
    // A B-side ends with its red crystal heart.
    if (ch.base && this.addItem("hearts", ch.id)) Story.whisper([{ who: "memory", text: "A red crystal heart!" }]);
    const got = g.rooms.reduce((n, r) => n + r.berries.filter((b) => g.collected.has(b.id)).length, 0);
    const run = { time: g.time, deaths: g.deaths, berries: got, assist: !!c.assistUsed };
    const prevBest = c.best;
    if (!c.best || run.time < c.best.time) c.best = run;
    this.writeSave();
    const summary = () => {
      if (this.game !== g) return;
      this.state = "done";
      $("doneTitle").textContent = ch.base ? `${ch.name} · B-Side` : ch.name;
      $("doneStats").innerHTML =
        `Time <b>${formatTime(run.time)}</b><br>Deaths <b>${run.deaths}</b><br>Strawberries <b>${run.berries} / ${g.totalBerries()}</b>` +
        (run.assist ? `<br><span class="badge">Assist Mode</span>` : "") +
        (prevBest && c.best !== run ? `<br><small>Best time ${formatTime(c.best.time)}</small>` : "") +
        `<br>${this.itemIcons(ch)}`;
      const story = this.mode === "story";
      $("nextChapter").hidden = !story;
      $("again").hidden = story;
      $("toTitle").textContent = story ? "Rest (main menu)" : "Back to menu";
      this.show("done");
    };
    const end = (TRIGGERS[ch.id] || {}).end;
    setTimeout(() => {
      if (this.game !== g) return;
      if (end && this.settings.story) Story.play(end, g, summary); else summary();
    }, 1200);
  },

  // After a chapter's summary in story mode: straight on up the mountain.
  onward() {
    const next = CHAPTERS[CHAPTERS.indexOf(this.chapter) + 1];
    if (next) this.play(next, true, "story");
    else if (this.chapter.id === "c9" && !this.save.epilogue) this.epilogue();
    else this.fogEnding();
  },

  // ------------------------------------------------------------------ UI

  show(id) {
    for (const s of ["title", "pause", "settings", "done", "revisit", "journal"]) $(s).classList.toggle("hidden", s !== id);
    $("touch").classList.toggle("hidden", !(id === null && this.state === "play" && this.touchUI));
  },

  refreshTitle() {
    // Only the way forward is shown: no list of chapters, nothing about how far the climb goes.
    const ch = this.storyChapter(), c = ch && this.progress(ch);
    const begun = CHAPTERS.some((x) => (this.progress(x) || {}).started);
    $("continueBtn").textContent = begun ? "Continue" : "Begin";
    $("where").textContent = !begun ? "" : ch && c && c.started ? `${ch.name} · ${ch.rooms.find((r) => r.id === c.room).name}` : ch ? ch.name : "";
    $("revisitBtn").hidden = !CHAPTERS.some((x) => this.done(x));
    $("journalBtn").hidden = !CHAPTERS.some((x) => (this.progress(x) || {}).started);
    const bb = this.settings.binds;
    $("bindText").innerHTML = `${keys(bb.jump)} jump · ${keys(bb.dash)} dash · ${keys(bb.grab)} grab`;
  },

  // Places you've already been: only finished chapters appear, each with its B-side once
  // you've found the chapter's cassette.
  openRevisit() {
    const box = $("chapters");
    box.innerHTML = "";
    CHAPTERS.forEach((ch, i) => {
      if (!this.done(ch)) return;
      const c = this.progress(ch), b = bsideOf(ch), cb = b && this.progress(b);
      const got = this.save.collected.filter((id) => id.startsWith(ch.id + "/")).length;
      const card = document.createElement("div");
      card.className = "chap";
      const [c1, c2] = THEME_COLORS[ch.id] || THEME_COLORS.c1;
      card.style.setProperty("--c1", c1); card.style.setProperty("--c2", c2);
      card.innerHTML = `<span class="num">Chapter ${i + 1}</span><span class="name">${ch.name}</span>` +
        `<span class="info">${c.best ? `Best ${formatTime(c.best.time)}${c.best.assist ? " (assist)" : ""}` : ""}<br>🍓 ${got} / ${berryCount(ch)} ${this.itemIcons(ch)}</span>`;
      const row = document.createElement("div");
      row.className = "sides";
      const a = document.createElement("button");
      a.className = "small"; a.textContent = "A-Side";
      a.onclick = () => this.play(ch, true, "revisit");
      row.appendChild(a);
      if (b && this.save.items.cassettes.includes(ch.id)) {
        const bb = document.createElement("button");
        bb.className = "small bside"; bb.textContent = cb && cb.done ? `B-Side · ${formatTime(cb.best.time)}` : "B-Side";
        bb.onclick = () => this.play(b, true, "revisit");
        row.appendChild(bb);
      }
      card.appendChild(row);
      box.appendChild(card);
    });
    this.show("revisit");
  },

  addItem(kind, id) {
    if (this.save.items[kind].includes(id)) return false;
    this.save.items[kind].push(id);
    this.writeSave();
    return true;
  },

  // Little icons for what you've found in a chapter: crystal hearts, cassette, goldens.
  itemIcons(ch) {
    const it = this.save.items, b = bsideOf(ch.base ? chapterById(ch.base) : ch), a = ch.base ? chapterById(ch.base) : ch;
    const on = (x, t, title) => `<span class="icon ${x ? "" : "off"}" title="${title}">${t}</span>`;
    return on(it.hearts.includes(a.id), "💙", "Crystal heart") + on(it.cassettes.includes(a.id), "📼", "Cassette") +
      on(b && it.hearts.includes(b.id), "❤️", "B-Side heart") + on(it.goldens.includes(a.id), "⭐", "Golden strawberry") +
      (b ? on(it.goldens.includes(b.id), "🌟", "B-Side golden strawberry") : "");
  },

  // The journal: every chapter's records, lifetime totals and the stamps you've earned.
  openJournal() {
    const it = this.save.items, rows = [];
    let berriesGot = 0, berriesAll = 0, time = 0;
    // Only places you've reached are listed, so the journal never gives away how far the climb goes.
    CHAPTERS.forEach((ch, i) => {
      const c = this.progress(ch) || {}, b = bsideOf(ch), cb = b ? this.progress(b) || {} : {};
      if (!c.started) return;
      const got = this.save.collected.filter((id) => id.startsWith(ch.id + "/")).length, all = berryCount(ch);
      berriesGot += got; berriesAll += all;
      if (c.best) time += c.best.time;
      const seen = true;
      rows.push(`<tr><td>${i + 1}. ${ch.name}</td><td>${got}/${all}</td>` +
        `<td>${c.best ? formatTime(c.best.time) : "–"}</td><td>${c.best ? c.best.deaths : "–"}</td>` +
        `<td>${cb.best ? formatTime(cb.best.time) : it.cassettes.includes(ch.id) ? "open" : "–"}</td><td>${seen ? this.itemIcons(ch) : ""}</td></tr>`);
    });
    const done = (id) => this.done(chapterById(id));
    const nb = (id) => BSIDE_LIST.filter((b) => it[id].includes(b.id)).length;
    const na = (id) => CHAPTERS.filter((c) => it[id].includes(c.id)).length;
    const stamps = [
      ["First Steps", "Finish the Foothills", done("c1")],
      ["False Summit", "Reach the false summit", done("c3")],
      ["True Summit", "Finish Wren's climb", !!this.save.epilogue],
      ["Berry Picker", "Collect 25 strawberries", berriesGot >= 25],
      ["Berry Farmer", "Collect 75 strawberries", berriesGot >= 75],
      ["Every Last One", "Collect every strawberry", this.save.collected.length >= CHAPTERS.reduce((n, ch) => n + berryCount(ch), 0)],
      ["Mixtape", "Find a cassette", it.cassettes.length >= 1],
      ["Full Collection", "Find every cassette", it.cassettes.length >= CHAPTERS.length],
      ["Heartfelt", "Find a crystal heart", it.hearts.length >= 1],
      ["Blue Hearts", "Every A-side crystal heart", na("hearts") >= CHAPTERS.length],
      ["Red Hearts", "Clear every B-side", nb("hearts") >= BSIDE_LIST.length],
      ["Golden", "Win a golden strawberry", it.goldens.length >= 1],
      ["Golden Mountain", "Every A-side golden strawberry", na("goldens") >= CHAPTERS.length],
      ["Stubborn", "Die 500 times", this.save.stats.deaths >= 500],
      ["Unstoppable", "Die 2000 times", this.save.stats.deaths >= 2000],
    ];
    $("journalBody").innerHTML =
      `<p class="stats">Strawberries <b>${berriesGot} / ${berriesAll}</b> · Crystal hearts <b>${it.hearts.length}</b> · ` +
      `Cassettes <b>${it.cassettes.length}</b> · Golden strawberries <b>${it.goldens.length}</b> · Deaths <b>${this.save.stats.deaths}</b> · Best times total <b>${formatTime(time)}</b></p>` +
      `<div class="tablewrap"><table class="jt"><tr><th>Chapter</th><th>🍓</th><th>Best</th><th>Deaths</th><th>B-Side</th><th>Found</th></tr>${rows.join("")}</table></div>` +
      `<h3>Stamps</h3><div class="stamps">${stamps.map(([n, d, ok]) => `<div class="stamp ${ok ? "got" : ""}"><b>${ok ? n : "?"}</b><span>${d}</span></div>`).join("")}</div>`;
    this.show("journal");
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
    $("oStory").checked = st.story !== false;
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
    st.story = $("oStory").checked;
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
      if (this.state === "play" && this.settings.story) this.storyEvent(e, g);
      if (this.state === "play") this.itemEvent(e, g);
      if (e.type === "complete" && this.state === "play") this.finish();
    }
    g.events.length = 0;
  },

  // Cassettes, crystal hearts, golden strawberries and the lifetime death count.
  itemEvent(e, g) {
    const ch = this.chapter, note = (text) => Story.whisper([{ who: "memory", text }]);
    if (e.type === "death") this.save.stats.deaths++;
    else if (e.type === "cassette" && this.addItem("cassettes", baseId(ch))) note(`A cassette tape! The B-Side of ${ch.name} is now open in Revisit.`);
    else if (e.type === "heart" && this.addItem("hearts", ch.id)) note("A crystal heart!");
    else if (e.type === "golden" && this.addItem("goldens", ch.id)) note("The golden strawberry is yours!");
    else if (e.type === "goldenTouch") note("A golden strawberry. Carry it to the end without dying.");
    else if (e.type === "goldenLost") this.goldenRestart = true;
    else if (e.type === "respawn" && this.goldenRestart) {
      // Dropping the golden strawberry sends you back to the start of the chapter.
      this.goldenRestart = false;
      this.play(ch, true, this.mode, { quick: true });
    }
  },

  // Scenes and whispers tied to rooms and switches.
  storyEvent(e, g) {
    const trig = TRIGGERS[this.chapter.id];
    if (!trig) return;
    if (e.type === "room") {
      const id = trig.enter && trig.enter[g.room.id];
      if (id && !this.seen(id)) {
        if (SCENES[id].whisper) Story.whisper(SCENES[id].whisper);
        else this.pendingScene = id;
      }
    } else if (e.type === "switch") {
      const lines = trig.switches && trig.switches[g.room.id];
      const n = g.room.switches.length - e.left - 1;
      if (lines && lines[n] && !this.seen(`${g.room.id}:light${n}`)) Story.whisper([lines[n]]);
    }
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
    $("again").onclick = () => this.play(this.chapter, true, "revisit");
    $("nextChapter").onclick = () => this.onward();
    $("continueBtn").onclick = () => this.continueStory();
    $("revisitBtn").onclick = () => this.openRevisit();
    $("journalBtn").onclick = () => this.openJournal();
    $("closeJournal").onclick = () => this.show("title");
    $("closeRevisit").onclick = () => this.show("title");
    $("skipScene").onclick = () => { Story.skip(); this.pause(false); };
    $("toTitle").onclick = () => this.toTitle();
    $("touchPause").onclick = () => this.pause(true);

    Input.onPause = (code) => {
      if (Input.capture) return;
      if (Story.active && code === "Enter" && !this.paused) { Story.press(); return; }
      if (this.state === "play") {
        if (code === "Enter" && this.paused) return;
        this.pause();
      } else if (code === "Escape" && !$("settings").classList.contains("hidden")) {
        this.closeSettings();
      } else if (code === "Escape" && (!$("revisit").classList.contains("hidden") || !$("journal").classList.contains("hidden"))) {
        this.show("title");
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
  Story.tick(dt);
  $("touch").classList.toggle("scene", !!Story.active);
  if ((App.state === "play" || App.state === "scene") && !App.paused && Story.active) {
    // A scene is playing: the game waits, the scene reads the buttons.
    const inp = Input.frame();
    Story.update(dt, inp.jumpPressed || inp.dashPressed);
    acc = 0;
  } else if (App.state === "play" && !App.paused && App.pendingScene && !g.transition && g.p.state !== ST_DEAD && g.p.state !== ST_RESPAWN) {
    const id = App.pendingScene;
    App.pendingScene = null;
    Story.play(id, g);
  } else if (App.state === "play" && !App.paused) {
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
Story.init();
Music.init();
Input.init();
Input.initTouch($("touch"));
Render.init($("game"));
App.applySettings();
App.build();
App.toTitle();
requestAnimationFrame(loop);

window.__MV = { App, Game, CHAPTERS, BSIDES: BSIDE_LIST, Render, Input, Music, Story, SCENES, TRIGGERS };
