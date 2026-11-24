"use strict";
// Screens and input: the home page with the avatar maker, the lobby settings, the game screen
// (players, canvas, chat, drawing tools) and the round, word-choice, results and podium cards.

(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("squint." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("squint." + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- profile ----------
  let profile = { name: store.get("name", ""), av: Art.norm(store.get("avatar", Art.random())) };
  const saveProfile = () => { store.set("name", profile.name); store.set("avatar", profile.av); };

  // ---------- home ----------
  const home = $("#home"), game = $("#game");
  const nameIn = $("#name"), codeIn = $("#code"), homeMsg = $("#homeMsg");
  const avCanvas = $("#avBig");

  function drawProfileAvatar() { Art.draw(avCanvas, profile.av); }
  document.querySelectorAll("[data-part]").forEach(b => b.addEventListener("click", () => {
    const part = +b.dataset.part, dir = +b.dataset.dir;
    profile.av[part] = (profile.av[part] + dir + Art.PARTS[part]) % Art.PARTS[part];
    Sound.play("tap");
    drawProfileAvatar();
    saveProfile();
  }));
  $("#avRandom").addEventListener("click", () => { profile.av = Art.random(); Sound.play("tap"); drawProfileAvatar(); saveProfile(); });
  nameIn.value = profile.name;
  nameIn.addEventListener("input", () => { profile.name = nameIn.value.slice(0, 20); saveProfile(); });
  codeIn.addEventListener("input", () => { codeIn.value = codeIn.value.replace(/\D/g, "").slice(0, 6); });

  const ADJ = ["Sleepy", "Wobbly", "Sneaky", "Fuzzy", "Brave", "Giggly", "Lucky", "Grumpy", "Sparkly", "Speedy", "Cosmic", "Tiny"];
  const NOUN = ["Pickle", "Noodle", "Pixel", "Muffin", "Badger", "Comet", "Waffle", "Gecko", "Turnip", "Bean", "Yeti", "Squid"];
  const takeName = () => {
    profile.name = nameIn.value.trim().slice(0, 20) || ADJ[Math.random() * ADJ.length | 0] + " " + NOUN[Math.random() * NOUN.length | 0];
    nameIn.value = profile.name;
    saveProfile();
  };

  function homeBusy(on, text) {
    home.querySelectorAll("#entry button, #entry input").forEach(el => { el.disabled = on; });
    homeMsg.className = "msg" + (on ? " info" : "");
    homeMsg.textContent = text || "";
  }
  function homeError(text) { homeBusy(false); homeMsg.className = "msg"; homeMsg.textContent = text; Sound.play("bad"); }

  const H = { message: onMsg, closed: t => backHome(t), notice: t => toast(t) };
  $("#createBtn").addEventListener("click", async () => {
    Sound.init(); takeName();
    homeBusy(true, "Creating a private room…");
    try { await Net.create(profile, H); enterGame(); }
    catch (e) { homeError(e.message); }
  });
  $("#joinForm").addEventListener("submit", async e => {
    e.preventDefault();
    Sound.init(); takeName();
    const c = codeIn.value.replace(/\D/g, "");
    if (c.length !== 6) { homeError("Type the 6-digit room code your friend gave you, or create a private room."); codeIn.focus(); return; }
    homeBusy(true, `Joining room ${c}…`);
    try { await Net.join(c, profile, H); enterGame(); }
    catch (err) { homeError(err.message); }
  });

  function backHome(text) {
    resetGame();
    game.hidden = true;
    home.hidden = false;
    homeBusy(false);
    if (text) { homeMsg.className = "msg"; homeMsg.textContent = text; }
    document.title = "Squint — draw and guess with friends";
  }

  // ---------- game state ----------
  let view = null, deadline = 0, lastTurn = -1, lastPhase = "", ovKey = "", lastSecond = -1, rated = false;
  const muted = new Set();
  const board = Board.create($("#board"));

  function resetGame() {
    view = null; deadline = 0; lastTurn = -1; lastPhase = ""; ovKey = ""; lastSecond = -1; rated = false;
    muted.clear();
    $("#log").innerHTML = "";
    $("#players").innerHTML = "";
    board.replace([]);
    queue.length = 0;
    closePop();
  }

  function enterGame() {
    home.hidden = true;
    game.hidden = false;
    homeBusy(false);
    $("#chatIn").focus({ preventScroll: true });
  }

  const meId = () => Net.me;
  const amDrawer = () => view && view.drawer === meId() && view.phase === "drawing";
  const isOwner = () => view && view.owner === meId();
  const player = id => view && view.players.find(p => p.id === id);

  function onMsg(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "state": return onState(m);
      case "log": return board.replace(m.c || []);
      case "draw": if (!amDrawer()) board.add(m.c || []); return;
      case "undo": return board.truncate(m.n | 0);
      case "msg": return addMsg(m);
      case "you-guessed": Sound.play("guessed"); return;
      case "bye": Net.leave(); return backHome(m.msg);
    }
  }

  function onState(s) {
    const prev = view;
    view = s;
    deadline = performance.now() + (s.ms || 0);
    if (s.turn !== lastTurn) { lastTurn = s.turn; rated = false; if (s.phase === "choosing") board.replace([]); }
    if (s.phase !== lastPhase) {
      if (s.phase === "round") Sound.play("round");
      if (s.phase === "choosing" && s.drawer === meId()) Sound.play("choose");
      if (s.phase === "result") Sound.play("turn");
      if (s.phase === "podium") Sound.play("win");
      lastPhase = s.phase;
    }
    document.title = s.phase === "lobby" ? `Room ${Net.code} · Squint` : `Round ${s.round} · Squint`;
    renderPlayers();
    renderHead();
    updateClock();
    renderOverlay(prev);
    renderTools();
    game.classList.toggle("in-lobby", s.phase === "lobby");
    $("#rate").hidden = !(s.phase === "drawing" && s.drawer !== meId() && !rated);
  }

  // ---------- header ----------
  function renderHead() {
    const s = view;
    $("#roundTxt").textContent = s.phase === "lobby" ? "Waiting" : `Round ${Math.min(s.round, s.settings.rounds)} of ${s.settings.rounds}`;
    const label = $("#wordLabel"), shown = $("#wordShown");
    let lab = "WAITING", html = "";
    if (s.phase === "choosing") lab = s.drawer === meId() ? "CHOOSE A WORD" : "WAITING";
    else if (s.phase === "drawing" || s.phase === "result") {
      if (s.word) {
        lab = s.phase === "result" ? "THE WORD WAS" : s.drawer === meId() ? "DRAW THIS" : "YOU GUESSED IT";
        html = `<span class="known">${esc(s.word)}</span>`;
      } else if (s.hidden) { lab = "GUESS THIS"; html = `<span class="known">???</span><sup>WORD HIDDEN</sup>`; }
      else if (s.mask) {
        lab = "GUESS THIS";
        html = s.mask.split(" ").map(w => `<span class="blank">${[...w].map(ch => `<i class="${ch === "_" ? "" : "rev"}">${ch === "_" ? "_" : esc(ch)}</i>`).join("")}</span><sup>${[...w].length}</sup>`).join(`<span class="gap"></span>`);
      }
    } else if (s.phase === "podium") lab = "GAME OVER";
    label.textContent = lab;
    shown.innerHTML = html;
  }

  function updateClock() {
    if (!view) return;
    const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    const timed = view.phase === "drawing" || view.phase === "choosing";
    $("#clockNum").textContent = timed ? left : "";
    $("#clock").classList.toggle("idle", !timed);
    $("#clock").classList.toggle("hurry", view.phase === "drawing" && left <= 10);
    if (view.phase === "drawing" && left <= 10 && left > 0 && left !== lastSecond) Sound.play("tick");
    lastSecond = left;
  }
  setInterval(updateClock, 200);

  // ---------- players ----------
  function renderPlayers() {
    const s = view;
    const ranked = [...s.players].map(p => ({ ...p })).sort((a, b) => b.score - a.score);
    let place = 0, last = null;
    ranked.forEach((p, i) => { if (p.score !== last) { place = i + 1; last = p.score; } p.rank = place; });
    $("#players").innerHTML = s.players.map(p => {
      const r = ranked.find(x => x.id === p.id).rank;
      const cls = ["pl", p.guessed ? "ok" : "", p.id === s.drawer && s.phase !== "lobby" ? "drawer" : "", p.id === meId() ? "me" : ""].join(" ");
      return `<button class="${cls}" data-id="${esc(p.id)}" type="button">
        <span class="rank">#${r}</span>
        <span class="who"><b>${esc(p.name)}${p.id === meId() ? " (You)" : ""}</b><span>${p.score} points</span></span>
        <span class="icons">${p.id === s.drawer && s.phase !== "lobby" ? `<img src="${Art.glyph("pencil")}" alt="Drawing" title="Drawing">` : ""}${p.id === s.owner ? `<img src="${Art.glyph("crown")}" alt="Room owner" title="Room owner">` : ""}${muted.has(p.id) ? `<img src="${Art.glyph("mute")}" alt="Muted" title="Muted">` : ""}</span>
        <img class="av" src="${Art.url(p.av)}" alt="">
      </button>`;
    }).join("");
  }
  $("#players").addEventListener("click", e => {
    const b = e.target.closest(".pl");
    if (b) openPop(b.dataset.id, b);
  });

  // ---------- player menu ----------
  const pop = $("#pop");
  function openPop(id, anchor) {
    const p = player(id);
    if (!p) return;
    const mine = id === meId();
    pop.innerHTML = `<img class="av" src="${Art.url(p.av)}" alt=""><b>${esc(p.name)}</b>
      ${mine ? `<p>That's you!</p>` : `
      ${id !== view.owner ? `<button class="btn small" data-act="votekick">Votekick</button>` : ""}
      ${isOwner() ? `<button class="btn small red" data-act="kick">Kick</button>` : ""}
      <button class="btn small grey" data-act="mute">${muted.has(id) ? "Unmute" : "Mute"}</button>`}`;
    pop.dataset.id = id;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(window.innerWidth - 200, Math.max(8, r.right + 8)) + "px";
    pop.style.top = Math.min(window.innerHeight - 220, Math.max(8, r.top + window.scrollY)) + "px";
  }
  function closePop() { pop.hidden = true; }
  pop.addEventListener("click", e => {
    const act = e.target.dataset.act, id = pop.dataset.id;
    if (!act) return;
    if (act === "votekick") Net.send({ t: "votekick", id });
    if (act === "kick") Net.send({ t: "kick", id });
    if (act === "mute") { muted.has(id) ? muted.delete(id) : muted.add(id); renderPlayers(); }
    closePop();
  });
  document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".pl")) closePop(); });

  // ---------- chat ----------
  const log = $("#log");
  function addMsg(m) {
    if (m.id && muted.has(m.id)) return;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const d = document.createElement("div");
    d.className = "m " + m.k;
    d.innerHTML = m.n ? `<b>${esc(m.n)}:</b> ${esc(m.x)}` : esc(m.x);
    log.append(d);
    while (log.children.length > 200) log.firstChild.remove();
    if (near || m.id === meId() || !m.n) log.scrollTop = log.scrollHeight;
    if (m.k === "join") Sound.play("join");
    else if (m.k === "leave") Sound.play("leave");
    else if (m.k === "good" && !(view && view.players.find(p => p.id === meId() && p.guessed))) Sound.play("other");
    else if (m.k === "close") Sound.play("close");
    else if (m.k === "like") Sound.play("like");
  }
  $("#chatForm").addEventListener("submit", e => {
    e.preventDefault();
    const x = $("#chatIn").value.trim();
    if (!x) return;
    Net.send({ t: "chat", x });
    $("#chatIn").value = "";
  });
  $("#rate").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    Net.send({ t: "vote", k: b.dataset.k });
    rated = true;
    $("#rate").hidden = true;
  });

  // ---------- overlay cards ----------
  const ov = $("#overlay");
  const REASONS = { time: "Time is up!", all: "Everyone guessed the word!", left: "The drawer left the game!" };
  const opt = (v, cur, label = v) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${label}</option>`;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  function renderOverlay() {
    const s = view;
    let key = s.phase + ":" + s.turn;
    if (s.phase === "lobby") key = "lobby:" + (isOwner() ? "owner" : "guest");
    if (s.phase === "choosing") key += s.drawer === meId() ? ":me" : ":other";
    if (s.phase === "drawing") key = "";
    if (key === ovKey) { if (s.phase === "lobby") updateLobby(); return; }
    ovKey = key;
    ov.hidden = !key;
    ov.className = "overlay " + s.phase;
    if (!key) { ov.innerHTML = ""; return; }

    if (s.phase === "lobby") return buildLobby();
    if (s.phase === "round") ov.innerHTML = `<div class="card pop-in"><h2>Round ${s.round}</h2></div>`;
    else if (s.phase === "choosing") {
      const d = player(s.drawer);
      ov.innerHTML = s.choices
        ? `<div class="card"><h3>Choose a word</h3><div class="choices">${s.choices.map((w, i) => `<button class="btn word" data-i="${i}">${esc(s.settings.mode === "combination" ? w.replace(" ", " + ") : w)}</button>`).join("")}</div></div>`
        : `<div class="card"><img class="av big" src="${d ? Art.url(d.av) : ""}" alt=""><h3>${esc(d ? d.name : "Someone")} is choosing a word!</h3></div>`;
      ov.querySelectorAll(".word").forEach(b => b.addEventListener("click", () => { Net.send({ t: "pick", i: +b.dataset.i }); ov.querySelectorAll(".word").forEach(x => { x.disabled = true; }); }));
    } else if (s.phase === "result") {
      const r = s.result;
      ov.innerHTML = r ? `<div class="card"><p class="reason">${REASONS[r.reason] || ""}</p><h3>The word was <span class="hl">${esc(r.word)}</span></h3>
        <ul class="gains">${r.gains.map(g => { const p = player(g.id); return p ? `<li><span>${esc(p.name)}</span><b class="${g.pts > 0 ? "plus" : "zero"}">${g.pts > 0 ? "+" + g.pts : "0"}</b></li>` : ""; }).join("")}</ul></div>` : "";
    } else if (s.phase === "podium") {
      const top = s.podium || [];
      const slot = place => `<div class="spots">` + top.filter(p => p.place === place).map(p => `<div class="spot p${place}"><img class="av" src="${Art.url(p.av)}" alt="">${place === 1 ? `<img class="crown" src="${Art.glyph("crown")}" alt="">` : ""}<b>${esc(p.name)}</b><span>${p.score} points</span></div>`).join("") + `</div>`;
      ov.innerHTML = `<div class="card wide"><h2>Game over!</h2>
        <div class="stand"><div class="col c2">${slot(2)}<div class="step">2</div></div><div class="col c1">${slot(1)}<div class="step">1</div></div><div class="col c3">${slot(3)}<div class="step">3</div></div></div>
        ${top.filter(p => p.place > 3).length ? `<ol class="rest">${top.filter(p => p.place > 3).map(p => `<li>#${p.place} ${esc(p.name)} · ${p.score}</li>`).join("")}</ol>` : ""}</div>`;
    }
  }

  function buildLobby() {
    const s = view.settings, own = isOwner(), dis = own ? "" : " disabled";
    ov.innerHTML = `<div class="lobbyform">
      <div class="set"><label for="sPlayers">Players</label><select id="sPlayers"${dis}>${range(2, SquintHost.MAX_ROOM).map(n => opt(n, s.maxPlayers)).join("")}</select></div>
      <div class="set"><label for="sLang">Language</label><select id="sLang" disabled><option>English</option></select></div>
      <div class="set"><label for="sTime">Drawtime</label><select id="sTime"${dis}>${SquintHost.DRAW_TIMES.map(n => opt(n, s.drawTime, n + "s")).join("")}</select></div>
      <div class="set"><label for="sRounds">Rounds</label><select id="sRounds"${dis}>${range(2, 10).map(n => opt(n, s.rounds)).join("")}</select></div>
      <div class="set"><label for="sMode">Word mode</label><select id="sMode"${dis}>${opt("normal", s.mode, "Normal")}${opt("hidden", s.mode, "Hidden")}${opt("combination", s.mode, "Combination")}</select></div>
      <div class="set"><label for="sCount">Word count</label><select id="sCount"${dis}>${range(1, 5).map(n => opt(n, s.wordCount)).join("")}</select></div>
      <div class="set"><label for="sHints">Hints</label><select id="sHints"${dis}>${range(0, 5).map(n => opt(n, s.hints)).join("")}</select></div>
      <div class="set full"><label for="sCustom">Custom words <small id="customNote"></small></label>
        <textarea id="sCustom" rows="3" maxlength="20000" placeholder="At least ${SquintHost.MIN_CUSTOM} words, separated by commas. Each word up to 32 characters."${dis}>${esc(s.custom)}</textarea>
        <label class="check"><input type="checkbox" id="sOnly"${s.customOnly ? " checked" : ""}${dis}> Use custom words only</label></div>
      <div class="lobby-foot full">
        ${own ? `<button class="btn green big" id="startBtn">Start!</button>` : `<p class="wait">Waiting for the room owner to start the game…</p>`}
        <div class="invite"><span>Room code</span><b>${esc(Net.code)}</b><button class="btn blue small" id="copyBtn" type="button">Copy invite link</button></div>
      </div></div>`;
    if (own) {
      const map = { sPlayers: "maxPlayers", sTime: "drawTime", sRounds: "rounds", sMode: "mode", sCount: "wordCount", sHints: "hints" };
      for (const [id, key] of Object.entries(map)) $("#" + id).addEventListener("change", e => Net.send({ t: "settings", s: { [key]: e.target.value } }));
      let t = 0;
      $("#sCustom").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => Net.send({ t: "settings", s: { custom: e.target.value } }), 350); });
      $("#sOnly").addEventListener("change", e => Net.send({ t: "settings", s: { customOnly: e.target.checked } }));
      $("#startBtn").addEventListener("click", () => {
        if (view.players.length < 2) { toast("You need at least 2 players to start. Share the invite link!"); Sound.play("bad"); return; }
        Net.send({ t: "start" });
      });
    }
    $("#copyBtn").addEventListener("click", async () => {
      const link = Net.inviteLink();
      try { await navigator.clipboard.writeText(link); toast("Invite link copied!"); }
      catch (e) { toast(link); }
    });
    updateLobby();
  }

  function updateLobby() {
    const s = view.settings;
    const set = (id, v) => { const el = $("#" + id); if (el && document.activeElement !== el) { if (el.type === "checkbox") el.checked = !!v; else if (el.value !== String(v)) el.value = v; } };
    set("sPlayers", s.maxPlayers); set("sTime", s.drawTime); set("sRounds", s.rounds); set("sMode", s.mode); set("sCount", s.wordCount); set("sHints", s.hints); set("sOnly", s.customOnly);
    if (!isOwner()) set("sCustom", s.custom);
    const note = $("#customNote");
    if (note) note.textContent = s.customCount ? `(${s.customCount} word${s.customCount === 1 ? "" : "s"}${s.customCount < SquintHost.MIN_CUSTOM ? `, need ${SquintHost.MIN_CUSTOM}` : ""})` : "";
  }

  // ---------- drawing tools ----------
  const tool = { kind: "brush", a: 13, b: 0, size: 1 };
  const palette = $("#palette");
  palette.innerHTML = Board.COLORS.map((c, i) => `<button type="button" data-c="${i}" style="--c:${c}" aria-label="Colour ${i + 1}"></button>`).join("");
  $("#sizes").innerHTML = Board.SIZES.map((n, i) => `<button type="button" data-s="${i}" aria-label="Brush size ${n}"><i style="--d:${Math.max(3, Math.round(n * 0.6))}px"></i></button>`).join("");
  $("#toolBrush").innerHTML = `<img src="${Art.glyph("brush", "#14182e")}" alt="">`;
  $("#toolFill").innerHTML = `<img src="${Art.glyph("fill", "#14182e")}" alt="">`;
  $("#undoBtn").innerHTML = `<img src="${Art.glyph("undo", "#14182e")}" alt="">`;
  $("#clearBtn").innerHTML = `<img src="${Art.glyph("clear", "#14182e")}" alt="">`;

  function renderTools() {
    const show = amDrawer();
    $("#tools").hidden = !show;
    game.classList.toggle("drawing", show);
    $("#board").style.cursor = show ? (tool.kind === "fill" ? "cell" : "crosshair") : "default";
    $("#curA").style.background = Board.COLORS[tool.a];
    $("#curB").style.background = Board.COLORS[tool.b];
    palette.querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.c === tool.a));
    $("#sizes").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.s === tool.size));
    $("#toolBrush").classList.toggle("on", tool.kind === "brush");
    $("#toolFill").classList.toggle("on", tool.kind === "fill");
  }
  palette.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tool.a = +b.dataset.c; renderTools(); } });
  palette.addEventListener("contextmenu", e => { e.preventDefault(); const b = e.target.closest("button"); if (b) { tool.b = +b.dataset.c; renderTools(); } });
  $("#sizes").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tool.size = +b.dataset.s; renderTools(); } });
  $("#toolBrush").addEventListener("click", () => { tool.kind = "brush"; renderTools(); });
  $("#toolFill").addEventListener("click", () => { tool.kind = "fill"; renderTools(); });
  $("#swapBtn").addEventListener("click", () => { [tool.a, tool.b] = [tool.b, tool.a]; renderTools(); });
  $("#undoBtn").addEventListener("click", undo);
  $("#clearBtn").addEventListener("click", clear);

  const queue = [];
  function push(cmd) { board.add([cmd]); queue.push(cmd); }
  function flush() { while (queue.length) Net.send({ t: "draw", c: queue.splice(0, 64) }); }
  setInterval(flush, 50);
  function undo() { if (!amDrawer()) return; flush(); Net.send({ t: "undo" }); }
  function clear() { if (!amDrawer()) return; push([2]); }

  const cv = $("#board");
  let stroke = null;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * Board.W / r.width), Math.round((e.clientY - r.top) * Board.H / r.height)];
  };
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    if (!amDrawer() || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    const c = e.button === 2 ? tool.b : tool.a;
    const [x, y] = pos(e);
    if (tool.kind === "fill") { push([1, c, x, y]); return; }
    cv.setPointerCapture(e.pointerId);
    stroke = { id: e.pointerId, c, x, y };
    push([0, c, Board.SIZES[tool.size], x, y, x, y, 1]);
  });
  cv.addEventListener("pointermove", e => {
    if (!stroke || e.pointerId !== stroke.id || !amDrawer()) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = pos(ev);
      if (x === stroke.x && y === stroke.y) continue;
      push([0, stroke.c, Board.SIZES[tool.size], stroke.x, stroke.y, x, y, 0]);
      stroke.x = x; stroke.y = y;
    }
  });
  const endStroke = e => { if (stroke && e.pointerId === stroke.id) stroke = null; };
  cv.addEventListener("pointerup", endStroke);
  cv.addEventListener("pointercancel", endStroke);

  document.addEventListener("keydown", e => {
    if (!amDrawer() || e.target.closest("input, textarea, select")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); return undo(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "b") tool.kind = "brush";
    else if (k === "f") tool.kind = "fill";
    else if (k === "u") return undo();
    else if (k === "c") return clear();
    else if (k === "s") [tool.a, tool.b] = [tool.b, tool.a];
    else if (k >= "1" && k <= "5") tool.size = +k - 1;
    else return;
    renderTools();
  });

  // ---------- misc ----------
  function soundIcon() { $("#soundBtn").innerHTML = `<img src="${Art.glyph(Sound.muted ? "mute" : "sound")}" alt="${Sound.muted ? "Sound off" : "Sound on"}">`; }
  $("#soundBtn").addEventListener("click", () => { Sound.toggle(); soundIcon(); });
  $("#leaveBtn").addEventListener("click", () => { Net.leave(); backHome(""); });
  soundIcon();

  let toastT = 0;
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 3200);
  }

  drawProfileAvatar();
  const room = Net.roomFromUrl();
  if (room) {
    codeIn.value = room;
    $("#playBtn").textContent = `Join room ${room}`;
  }
  codeIn.addEventListener("input", () => { $("#playBtn").textContent = codeIn.value.length === 6 ? `Join room ${codeIn.value}` : "Play!"; });
  window.addEventListener("beforeunload", () => { if (view) Net.leave(); });
})();
