"use strict";
// Live rooms: one player hosts, friends join with a four-letter code, and everyone dives the
// same prompts at the same time over peer-to-peer connections (PeerJS; its free public server
// only introduces the browsers to each other). The host's browser runs the room: it picks the
// prompts, scores every answer itself and sends out the results. An answer nobody else in the
// room gave earns a bonus.

const Room = (() => {
  const PROTO = 1;
  const CODE_CHARS = "BCDFGHJKLMNPQRSTVWXZ";
  const ID_PREFIX = "krillion-room-";
  const COLORS = ["#ff4f86", "#7dfbe6", "#ffd84a", "#63b7ff", "#b98cff", "#ff8a3d", "#45e0a0", "#ff9e9e"];
  const MAX_PLAYERS = COLORS.length;
  const ONLY_YOU = 15;
  const GRACE = 3;          // seconds the host waits past the timer for slow connections
  const COUNTS = [5, 7, 10];

  let peer = null, role = null, code = "", me = "", hostConn = null, leaving = false, joinTimer = 0;
  let H = null;             // host only: the room's real state
  let view = null;          // everyone: the latest room snapshot from the host
  let ui = "";              // which room screen is showing
  let roundI = -1;          // index of the prompt on screen
  let myName = "";
  try { myName = localStorage.getItem("krillion.name") || ""; } catch (e) {}

  const urlParam = k => new URLSearchParams(location.search).get(k);

  // ?peer=host:port points at a self-run PeerJS server (used for local testing).
  function peerOpts() {
    const q = urlParam("peer");
    if (q) {
      const [host, port] = q.split(":");
      return { host, port: +port || 9000, path: "/", secure: false, debug: 0 };
    }
    return { debug: 0 };
  }

  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "js/vendor/peerjs.min.js?v=1";
      s.onload = ok;
      s.onerror = () => fail(new Error("load"));
      document.head.appendChild(s);
    });
  }

  function inviteLink() {
    const extra = urlParam("peer") ? `&peer=${encodeURIComponent(urlParam("peer"))}` : "";
    return `${location.origin}${location.pathname}?room=${code}${extra}`;
  }

  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  const cleanCode = s => (s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const meP = () => view && view.players.find(p => p.id === me);

  // ---------- connecting ----------

  function open(prefill) {
    clearTimers();
    ui = "connect";
    Sea.set(0);
    screen.className = "room";
    const join = cleanCode(prefill);
    screen.innerHTML = `
      <div class="card room-card">
        <h2 class="r-title">Play with friends</h2>
        <p class="r-sub">Everyone dives the same prompts at the same time. Answers nobody else in the room gave earn <b>+${ONLY_YOU}</b>.</p>
        <label class="field"><span>Your name</span>
          <input id="name" type="text" maxlength="16" placeholder="Diver" value="${esc(myName)}" autocomplete="off" spellcheck="false"></label>
        ${join ? "" : `<button class="btn primary big" id="create">Create a room</button>
        <div class="or"><span>or join a room</span></div>`}
        <form id="joinForm" class="join-row" autocomplete="off">
          <input id="code" type="text" maxlength="4" placeholder="CODE" value="${join}" autocapitalize="characters" spellcheck="false" aria-label="Room code">
          <button class="btn ${join ? "primary" : ""}" type="submit" id="joinBtn">Join</button>
        </form>
        <div id="rerr" class="rerr" aria-live="polite"></div>
      </div>
      <button class="btn ghost" id="back">‹ Back</button>`;
    const nameIn = $("#name"), codeIn = $("#code");
    codeIn.addEventListener("input", () => { codeIn.value = cleanCode(codeIn.value); });
    if ($("#create")) $("#create").addEventListener("click", () => { Sound.init(); create(); });
    $("#joinForm").addEventListener("submit", e => {
      e.preventDefault();
      Sound.init();
      const c = cleanCode(codeIn.value);
      if (c.length !== 4) return error("Room codes are four letters.");
      joinRoom(c);
    });
    $("#back").addEventListener("click", () => { cleanup(); home(); });
    (join || myName ? (join ? $("#joinBtn") : $("#create")) : nameIn).focus();
  }

  function takeName() {
    const n = ($("#name") && $("#name").value.trim()) || myName || `Diver ${Math.floor(Math.random() * 90 + 10)}`;
    myName = n.slice(0, 16);
    try { localStorage.setItem("krillion.name", myName); } catch (e) {}
    return myName;
  }

  function busy(msg) {
    screen.querySelectorAll(".room-card button, .room-card input").forEach(b => { b.disabled = true; });
    const e = $("#rerr");
    if (e) { e.className = "rerr info"; e.textContent = msg; }
  }

  function error(msg) {
    if (!$("#rerr")) open(code);
    screen.querySelectorAll(".room-card button, .room-card input").forEach(b => { b.disabled = false; });
    const e = $("#rerr");
    if (e) { e.className = "rerr"; e.textContent = msg; }
    Sound.play("wrong");
  }

  function errText(err) {
    const t = err && err.type;
    if (t === "peer-unavailable") return `There's no room with code ${code}. Check the code with your host.`;
    if (t === "browser-incompatible") return "This browser can't make peer-to-peer connections. Try Chrome, Edge, Firefox or Safari.";
    if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed")
      return "Couldn't reach the matchmaking server. Check your internet connection and try again.";
    if (err && err.message === "load") return "Couldn't load the multiplayer code. Refresh the page and try again.";
    return "Something went wrong connecting. Try again.";
  }

  async function create() {
    takeName();
    busy("Creating a room…");
    try { await loadPeer(); } catch (e) { return error(errText(e)); }
    tryHost(0);
  }

  function tryHost(attempt) {
    code = newCode();
    const p = new Peer(ID_PREFIX + code, peerOpts());
    p.on("open", id => {
      peer = p; role = "host"; me = id; leaving = false;
      H = {
        players: [{ id, name: myName, color: COLORS[0], score: 0, picks: [], conn: null }],
        count: 7, phase: "lobby", prompts: [], i: -1, answers: {}, timer: 0, lastReveal: null,
      };
      p.on("connection", hostOnConn);
      history.replaceState(null, "", inviteLink());
      Sound.play("ping");
      hostSync();
    });
    p.on("error", err => {
      if (err.type === "unavailable-id" && attempt < 5 && !peer) { p.destroy(); tryHost(attempt + 1); return; }
      if (peer !== p) { p.destroy(); error(errText(err)); return; }
      if (err.type === "peer-unavailable") return;   // a guest vanished mid-handshake
      toast("Connection trouble. Your room is still open.");
    });
    p.on("disconnected", () => { if (peer === p && !p.destroyed && !leaving) p.reconnect(); });
  }

  async function joinRoom(c) {
    takeName();
    code = c;
    busy(`Joining room ${c}…`);
    try { await loadPeer(); } catch (e) { return error(errText(e)); }
    leaving = false;
    const p = new Peer(peerOpts());
    peer = p;
    joinTimer = setTimeout(() => { if (role !== "guest") { cleanup(); error(`Couldn't connect to room ${c}. Check the code and try again.`); } }, 15000);
    p.on("open", () => {
      const conn = p.connect(ID_PREFIX + c, { reliable: true });
      hostConn = conn;
      conn.on("open", () => {
        clearTimeout(joinTimer);
        role = "guest";
        me = p.id;
        conn.send({ t: "hello", name: myName, v: PROTO });
      });
      conn.on("data", onMsg);
      conn.on("close", hostGone);
      conn.on("error", hostGone);
    });
    p.on("error", err => {
      if (role === "guest" && err.type !== "peer-unavailable") { toast("Connection trouble…"); return; }
      clearTimeout(joinTimer);
      cleanup();
      error(errText(err));
    });
  }

  function hostGone() {
    if (leaving || role !== "guest") return;
    cleanup();
    home();
    toast("The host closed the room");
  }

  function cleanup() {
    clearTimeout(joinTimer);
    if (H) clearTimeout(H.timer);
    const p = peer;
    peer = null; role = null; hostConn = null; H = null; view = null; ui = ""; roundI = -1;
    if (p && !p.destroyed) { leaving = true; try { p.destroy(); } catch (e) {} }
    if (urlParam("room")) history.replaceState(null, "", location.pathname + (urlParam("peer") ? `?peer=${encodeURIComponent(urlParam("peer"))}` : ""));
  }

  function leave() {
    leaving = true;
    if (role === "host" && H) {
      for (const p of H.players) if (p.conn && p.conn.open) p.conn.send({ t: "bye", msg: "The host closed the room" });
      const p = peer;
      peer = null;
      setTimeout(() => { try { p.destroy(); } catch (e) {} }, 300);
    }
    cleanup();
    home();
  }

  // Messages from this browser to the host. The host hands its own straight to itself.
  function send(msg) {
    if (role === "host") hostReceive(me, msg);
    else if (hostConn && hostConn.open) hostConn.send(msg);
  }

  // ---------- host ----------

  function snapshot() {
    return {
      t: "room", code, phase: H.phase, i: H.i, total: H.prompts.length || H.count, count: H.count,
      players: H.players.map(p => ({ id: p.id, name: p.name, color: p.color, score: p.score, host: p.id === me, done: H.phase !== "prompt" || p.waiting || !!H.answers[p.id] })),
    };
  }
  function broadcast(msg) {
    for (const p of H.players) if (p.conn && p.conn.open) p.conn.send(msg);
    onMsg(msg);
  }
  const hostSync = () => broadcast(snapshot());

  function hostOnConn(conn) {
    conn.on("data", m => hostReceive(conn.peer, m, conn));
    conn.on("close", () => hostDrop(conn.peer));
    conn.on("error", () => hostDrop(conn.peer));
  }

  function hostReceive(id, m, conn) {
    if (!H || !m || typeof m !== "object") return;
    if (m.t === "hello" && conn) {
      if (m.v !== PROTO) { conn.send({ t: "bye", msg: "Your game is out of date. Refresh the page and try again." }); return; }
      if (H.players.some(p => p.id === id)) return;
      if (H.players.length >= MAX_PLAYERS) { conn.send({ t: "bye", msg: "That room is full." }); return; }
      const used = new Set(H.players.map(p => p.color));
      H.players.push({
        id, conn, score: 0, picks: [], waiting: H.phase === "prompt",   // sits out a prompt already running
        name: String(m.name || "Diver").slice(0, 16),
        color: COLORS.find(c => !used.has(c)) || COLORS[0],
      });
      conn.send({ t: "welcome", you: id });
      Sound.play("bubbles");
      hostSync();
      if (H.phase === "reveal" && H.lastReveal) conn.send(H.lastReveal);
    } else if (m.t === "answer") {
      if (H.phase !== "prompt" || m.i !== H.i || H.answers[id] || !H.players.some(p => p.id === id)) return;
      H.answers[id] = { typed: String(m.typed || "").slice(0, 60) };
      hostSync();
      if (allIn()) {
        const i = H.i;
        setTimeout(() => hostClose(i), 600);
      }
    }
  }

  function hostDrop(id) {
    if (!H) return;
    const before = H.players.length;
    H.players = H.players.filter(p => p.id !== id);
    if (H.players.length === before) return;
    hostSync();
    if (H.phase === "prompt" && allIn()) hostClose(H.i);
  }

  const allIn = () => H.players.every(p => p.waiting || H.answers[p.id]);

  function hostStart() {
    H.prompts = shuffled(PROMPTS.length, Math.random).slice(0, H.count);
    H.players.forEach(p => { p.score = 0; p.picks = []; });
    H.i = -1;
    hostNext();
  }

  function hostNext() {
    if (H.i + 1 >= H.prompts.length) return hostEnd();
    H.i++;
    H.phase = "prompt";
    H.answers = {};
    H.lastReveal = null;
    H.players.forEach(p => { p.waiting = false; });
    const i = H.i;
    broadcast({ t: "prompt", i, pi: H.prompts[i], secs: ROUND_SECS, total: H.prompts.length });
    hostSync();
    clearTimeout(H.timer);
    H.timer = setTimeout(() => hostClose(i), (ROUND_SECS + GRACE) * 1000);
  }

  // Scores the prompt. The host checks every typed answer against the bank itself.
  function hostClose(i) {
    if (!H || H.phase !== "prompt" || H.i !== i) return;
    clearTimeout(H.timer);
    const pi = H.prompts[i], bank = bankFor(pi);
    const divers = H.players.filter(p => !p.waiting);
    const hits = divers.map(p => {
      const a = H.answers[p.id];
      return a && a.typed ? Match.find(bank, a.typed) : null;
    });
    const rows = divers.map((p, n) => {
      const hit = hits[n];
      const others = hits.filter((h, m) => m !== n && h === hit).length;
      const pts = hit ? TIERS[hit.tier].pts : 0;
      const bonus = hit && divers.length > 1 && others === 0 ? ONLY_YOU : 0;
      p.score += pts + bonus;
      p.picks.push(hit ? { shown: hit.shown, tier: hit.tier } : null);
      return {
        id: p.id, name: p.name, color: p.color, typed: H.answers[p.id] ? H.answers[p.id].typed : "",
        shown: hit ? hit.shown : null, tier: hit ? hit.tier : null, pts, bonus, shared: hit ? others : 0,
      };
    });
    H.phase = "reveal";
    H.lastReveal = { t: "reveal", i, pi, total: H.prompts.length, rows, last: i + 1 >= H.prompts.length };
    hostSync();
    broadcast(H.lastReveal);
  }

  function hostEnd() {
    H.phase = "end";
    const order = TIER_ORDER;
    const players = H.players.slice().sort((a, b) => b.score - a.score).map(p => {
      const best = p.picks.filter(Boolean).sort((a, b) => order.indexOf(b.tier) - order.indexOf(a.tier))[0] || null;
      return { id: p.id, name: p.name, color: p.color, score: p.score, best };
    });
    hostSync();
    broadcast({ t: "end", players, total: H.prompts.length });
  }

  function hostLobby() {
    H.phase = "lobby";
    H.i = -1;
    H.prompts = [];
    H.players.forEach(p => { p.score = 0; p.picks = []; });
    hostSync();
  }

  // ---------- everyone: react to the host ----------

  function onMsg(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "welcome": me = m.you; break;
      case "room":
        view = m;
        if (m.phase === "lobby") renderLobby();
        else if (ui === "prompt" && m.phase === "prompt" && m.i === roundI) updateStatus();
        else if (ui === "connect" || ui === "lobby" || ui === "") renderWaiting();
        break;
      case "prompt": startPrompt(m); break;
      case "reveal": renderReveal(m); break;
      case "end": renderEnd(m); break;
      case "bye":
        leaving = true;
        cleanup();
        home();
        toast(m.msg || "You left the room");
        break;
    }
  }

  function header() {
    const p = meP();
    const dots = view ? view.players.map(q => `<i class="pdot ${q.done ? "done" : ""}" style="--c:${q.color}" title="${esc(q.name)}${q.done ? " · locked in" : ""}"></i>`).join("") : "";
    return `<div class="hud">
      <div class="hud-l">Room <b>${code}</b></div>
      <div class="hud-m">${dots}</div>
      <div class="hud-r"><b>${fmt(p ? p.score : 0)}</b> pts</div>
    </div>`;
  }

  function renderLobby() {
    ui = "lobby";
    clearTimers();
    curRound = null;
    Sea.set(0);
    const isHost = role === "host";
    screen.className = "room";
    screen.innerHTML = `
      <div class="card room-card">
        <div class="code-label">Room code</div>
        <div class="code-big" aria-label="Room code ${code.split("").join(" ")}">${code.split("").map(ch => `<span>${ch}</span>`).join("")}</div>
        <button class="btn" id="copyLink">Copy invite link</button>
        <div class="plist-head">Divers <span>${view.players.length}/${MAX_PLAYERS}</span></div>
        <ul class="plist">${view.players.map(p => `
          <li><i class="pdot done" style="--c:${p.color}"></i><span class="pn">${esc(p.name)}</span>
            ${p.host ? `<span class="tag">Host</span>` : ""}${p.id === me ? `<span class="tag you">You</span>` : ""}</li>`).join("")}
        </ul>
        ${isHost ? `
          <div class="setting"><span>Prompts</span>
            <div class="seg">${COUNTS.map(n => `<button data-n="${n}" class="${n === view.count ? "on" : ""}">${n}</button>`).join("")}</div>
          </div>
          <button class="btn primary big" id="start">Start dive</button>
          ${view.players.length < 2 ? `<div class="hint">Share the code so friends can join. You can also start on your own.</div>` : ""}`
        : `<div class="hint wait-host">Waiting for the host to start · ${view.count} prompts</div>`}
      </div>
      <button class="btn ghost" id="leave">Leave room</button>`;
    $("#copyLink").addEventListener("click", () => copyInvite());
    $("#leave").addEventListener("click", () => { Sound.play("tap"); leave(); });
    if (isHost) {
      screen.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
        Sound.play("tap");
        H.count = +b.dataset.n;
        hostSync();
      }));
      $("#start").addEventListener("click", () => { Sound.play("ping"); hostStart(); });
    }
  }

  function copyInvite() {
    const link = inviteLink();
    Sound.play("tap");
    const done = () => toast("Invite link copied");
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      navigator.share({ text: `Join my Krillion room: ${code}`, url: link }).catch(() => {});
    } else if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => fallbackCopy(link) && done());
    else if (fallbackCopy(link)) done();
  }

  function renderWaiting() {
    if (!view) return;
    ui = "waiting";
    clearTimers();
    curRound = null;
    screen.className = "room";
    screen.innerHTML = `
      ${header()}
      <div class="card room-card">
        <h2 class="r-title">You're in!</h2>
        <p class="r-sub">A dive is already under way. You'll join at the next prompt.</p>
        ${standingsHTML(view.players)}
      </div>
      <button class="btn ghost" id="leave">Leave room</button>`;
    $("#leave").addEventListener("click", () => leave());
  }

  function startPrompt(m) {
    ui = "prompt";
    roundI = m.i;
    Gauge.setMax(m.total * 1000);
    if (m.i === 0) Sound.play("ping");
    playRound({
      pi: m.pi, secs: m.secs, header: header(),
      label: `Prompt ${m.i + 1} of ${m.total}`,
      onResolve: (hit, typed) => {
        send({ t: "answer", i: m.i, typed: hit ? typed : "" });
        const box = revealArea(hit);
        box.innerHTML = `${badgeHTML(hit, typed, "No points for this one")}<div class="wait" id="waitMsg"></div>`;
        updateStatus();
      },
    });
  }

  function updateStatus() {
    if (!view) return;
    const m = screen.querySelector(".hud .hud-m");
    if (m) m.innerHTML = view.players.map(q => `<i class="pdot ${q.done ? "done" : ""}" style="--c:${q.color}" title="${esc(q.name)}"></i>`).join("");
    const w = $("#waitMsg");
    if (w) {
      const left = view.players.filter(q => !q.done && q.id !== me);
      w.innerHTML = left.length ? `Waiting for ${left.map(q => `<b style="color:${q.color}">${esc(q.name)}</b>`).join(", ")}…` : "Everyone's in. Revealing…";
    }
  }

  function renderReveal(m) {
    // The host closed the prompt (time's up everywhere): stop this browser's clock too.
    if (curRound && !curRound.over) { curRound.over = true; clearTimers(); Sound.play("timeout"); }
    ui = "reveal";
    roundI = m.i;
    const bank = bankFor(m.pi), isHost = role === "host";
    const mine = m.rows.find(r => r.id === me);
    const rows = m.rows.slice().sort((a, b) => (b.pts + b.bonus) - (a.pts + a.bonus));
    screen.className = "play room-reveal";
    screen.innerHTML = `
      ${header()}
      <div class="card prompt-card revealed" style="--tier:${mine && mine.tier ? TIERS[mine.tier].color : "#8a96b5"}">
        <div class="q-num">Prompt ${m.i + 1} of ${m.total}</div>
        <h2 class="q">${esc(PROMPTS[m.pi][0])}</h2>
        <ul class="answers">${rows.map(r => `
          <li class="${r.id === me ? "me" : ""}">
            <i class="pdot done" style="--c:${r.color}"></i>
            <span class="an">${esc(r.name)}</span>
            <span class="aa">${r.shown ? esc(r.shown) : `<i>${r.typed ? esc(r.typed) : "no answer"}</i>`}</span>
            <span class="pills">
              <span class="pill" style="--c:${r.tier ? TIERS[r.tier].color : "#59647f"}">${r.tier ? `${TIERS[r.tier].name} +${r.pts}` : "+0"}</span>
              ${r.bonus ? `<span class="pill only" title="Nobody else in the room said this">Only you +${r.bonus}</span>` : ""}
            </span>
          </li>`).join("")}
        </ul>
        ${rarestHTML(bank, m.rows.filter(r => r.shown).map(r => r.shown))}
        ${standingsHTML(view ? view.players : [])}
        ${isHost ? `<button class="btn primary" id="next">${m.last ? "Final results" : "Next prompt"} <kbd>↵</kbd></button>`
          : `<div class="hint wait-host">Waiting for the host…</div>`}
      </div>`;
    const p = meP();
    Sea.set((p ? p.score : 0) * METRES_PER_PT);
    if (isHost) {
      const next = $("#next");
      next.focus({ preventScroll: true });
      next.addEventListener("click", () => { Sound.play("tap"); hostNext(); });
    }
  }

  function standingsHTML(players) {
    const list = players.slice().sort((a, b) => b.score - a.score);
    return `<ol class="standings">${list.map((p, n) => `
      <li class="${p.id === me ? "me" : ""}"><span class="rk">${n + 1}</span><i class="pdot done" style="--c:${p.color}"></i>
        <span class="sn">${esc(p.name)}</span><span class="sd">${fmt(p.score * METRES_PER_PT)} m</span></li>`).join("")}</ol>`;
  }

  function renderEnd(m) {
    ui = "end";
    clearTimers();
    curRound = null;
    const isHost = role === "host";
    const medals = ["🥇", "🥈", "🥉"];
    const p = m.players.find(q => q.id === me);
    const myRank = m.players.indexOf(p);
    Sea.set((p ? p.score : 0) * METRES_PER_PT);
    Sound.play("bubbles");
    screen.className = "results room-end";
    screen.innerHTML = `
      <div class="card">
        <div class="r-head">Room ${code} · ${m.total} prompts</div>
        <div class="r-depth">${myRank === 0 && m.players.length > 1 ? "You win!" : `#${myRank + 1}`}</div>
        <div class="r-zone">${p ? `${fmt(p.score * METRES_PER_PT)} m · ${zoneAt(p.score * METRES_PER_PT).name}` : ""}</div>
        <ol class="podium">${m.players.map((q, n) => `
          <li class="${q.id === me ? "me" : ""}">
            <span class="medal">${medals[n] || n + 1}</span>
            <i class="pdot done" style="--c:${q.color}"></i>
            <span class="pn">${esc(q.name)}</span>
            <span class="pd">${fmt(q.score * METRES_PER_PT)} m<small>${fmt(q.score)} pts</small></span>
            ${q.best ? `<span class="pb">Best: <b style="color:${TIERS[q.best.tier].color}">${esc(q.best.shown)}</b></span>` : ""}
          </li>`).join("")}
        </ol>
        ${isHost ? `<button class="btn primary" id="again">Play again</button>` : `<div class="hint wait-host">Waiting for the host to start another dive…</div>`}
        <button class="btn ghost" id="leave">Leave room</button>
      </div>`;
    if (isHost) $("#again").addEventListener("click", () => { Sound.play("tap"); hostLobby(); });
    $("#leave").addEventListener("click", () => { Sound.play("tap"); leave(); });
  }

  // A shared invite link opens straight onto the join screen.
  const invited = cleanCode(urlParam("room"));
  if (invited.length === 4) open(invited);

  return { open, leave, get active() { return !!role; } };
})();
