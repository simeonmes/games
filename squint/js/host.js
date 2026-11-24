"use strict";
// The room's referee. It runs only in the host's browser and owns the real game state:
// whose turn it is, the secret word, the clock, hints, guesses, scores and the drawing log.
// Guessers are only ever sent the blanks and revealed letters, never the word itself.
//
//   const host = SquintHost.create({ out, words, now, random });
//   out(playerId, message) delivers one message to one player (the host included).

const SquintHost = (() => {
  const DRAW_TIMES = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240];
  const DEFAULTS = { maxPlayers: 8, drawTime: 80, rounds: 3, wordCount: 3, hints: 2, mode: "normal", custom: "", customOnly: false };
  const ROUND_MS = 2000, CHOOSE_MS = 15000, RESULT_MS = 5000, PODIUM_MS = 8000, NOBODY_MS = 3000;
  const MAX_ROOM = 20, MIN_CUSTOM = 10, MAX_CMDS = 64;

  const clampInt = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

  function cleanSettings(s, prev) {
    const o = { ...(prev || DEFAULTS) };
    if (!s || typeof s !== "object") return o;
    if ("maxPlayers" in s) o.maxPlayers = clampInt(s.maxPlayers, 2, MAX_ROOM, o.maxPlayers);
    if ("drawTime" in s && DRAW_TIMES.includes(+s.drawTime)) o.drawTime = +s.drawTime;
    if ("rounds" in s) o.rounds = clampInt(s.rounds, 2, 10, o.rounds);
    if ("wordCount" in s) o.wordCount = clampInt(s.wordCount, 1, 5, o.wordCount);
    if ("hints" in s) o.hints = clampInt(s.hints, 0, 5, o.hints);
    if ("mode" in s && ["normal", "hidden", "combination"].includes(s.mode)) o.mode = s.mode;
    if ("custom" in s) o.custom = String(s.custom || "").slice(0, 20000);
    if ("customOnly" in s) o.customOnly = !!s.customOnly;
    return o;
  }

  function parseCustom(text) {
    const seen = new Set(), out = [];
    for (let w of String(text || "").split(",")) {
      w = w.trim().replace(/\s+/g, " ");
      if (w.length < 1 || w.length > 32) continue;
      const k = w.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(w); }
    }
    return out;
  }

  // Guess matching ignores case, accents, punctuation and spacing ("T-Shirt" = "tshirt").
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[-_]/g, " ").replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();
  const squash = s => norm(s).replace(/ /g, "");

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  const isLetter = ch => /[\p{L}\p{N}]/u.test(ch);

  function create({ out, words, now = () => Date.now(), random = Math.random }) {
    const H = {
      settings: { ...DEFAULTS },
      players: [],          // { id, name, av, score, guessed, turnPts, liked, msgTimes }
      owner: null,
      phase: "lobby",       // lobby | round | choosing | drawing | result | podium
      round: 0, queue: [], drawer: null, turn: 0,
      choices: [], word: "", answers: [], revealed: new Set(), hintTimes: [],
      deadline: 0, startedAt: 0, log: [], used: new Set(), kickVotes: new Map(),
      result: null, podium: null,
    };
    const pick = arr => arr[Math.floor(random() * arr.length)];
    const P = id => H.players.find(p => p.id === id);
    const others = () => H.players.filter(p => p.id !== H.drawer);
    const inGame = () => H.phase !== "lobby";

    // ---------- messages ----------

    function msg(to, k, x, from) {
      const m = { t: "msg", k, x };
      if (from) { m.id = from.id; m.n = from.name; }
      for (const p of to) out(p.id, m);
    }
    const everyone = (k, x, from) => msg(H.players, k, x, from);

    function snapshot(forId) {
      const me = P(forId);
      const knows = H.phase === "result" || H.phase === "podium" || forId === H.drawer || (me && me.guessed);
      const s = {
        t: "state", phase: H.phase, round: H.round, turn: H.turn, owner: H.owner, drawer: H.drawer,
        settings: { ...H.settings, customCount: parseCustom(H.settings.custom).length },
        ms: H.deadline ? Math.max(0, H.deadline - now()) : 0,
        players: H.players.map(p => ({ id: p.id, name: p.name, av: p.av, score: p.score, guessed: !!p.guessed })),
        word: null, mask: null, hidden: false, choices: null, result: H.result, podium: H.podium,
      };
      if (H.phase === "drawing" || H.phase === "result") {
        if (knows) s.word = H.word;
        if (H.settings.mode === "hidden" && !knows) s.hidden = true;
        else s.mask = mask();
      }
      if (H.phase === "choosing" && forId === H.drawer) s.choices = H.choices;
      return s;
    }
    function sync() { for (const p of H.players) out(p.id, snapshot(p.id)); }

    function mask() {
      let i = 0;
      return [...H.word].map(ch => {
        if (ch === " " || !isLetter(ch)) return ch;
        return H.revealed.has(i++) ? ch : "_";
      }).join("");
    }

    // ---------- players ----------

    function addPlayer(id, name, av) {
      if (P(id)) return false;
      if (H.players.length >= H.settings.maxPlayers && H.players.length > 0) { out(id, { t: "bye", msg: "That room is full." }); return false; }
      const p = { id, name: String(name || "Player").trim().slice(0, 20) || "Player", av: cleanAvatar(av), score: 0, guessed: false, turnPts: 0, liked: false, msgTimes: [] };
      H.players.push(p);
      if (!H.owner) H.owner = id;
      if (inGame() && H.phase !== "podium") H.queue.push(id);
      out(id, { t: "welcome", you: id });
      everyone("join", `${p.name} joined the room!`);
      sync();
      out(id, { t: "log", c: H.log });
      return true;
    }

    function cleanAvatar(av) {
      return Array.isArray(av) ? av.slice(0, 4).map(n => clampInt(n, 0, 99, 0)) : [0, 0, 0, 0];
    }

    function removePlayer(id, why) {
      const p = P(id);
      if (!p) return;
      H.players = H.players.filter(x => x !== p);
      H.queue = H.queue.filter(x => x !== id);
      H.kickVotes.delete(id);
      for (const set of H.kickVotes.values()) set.delete(id);
      everyone("leave", why === "kick" ? `${p.name} was kicked!` : `${p.name} left the room!`);
      if (inGame() && H.phase !== "podium" && H.players.length < 2) {
        everyone("sys", "Not enough players. Back to the lobby.");
        return toLobby();
      }
      if (id === H.drawer && (H.phase === "choosing" || H.phase === "drawing")) return endTurn("left");
      if (H.phase === "drawing" && others().length && others().every(o => o.guessed)) return endTurn("all");
      sync();
    }

    function kick(id, why) {
      out(id, { t: "bye", msg: why === "kick" ? "You were kicked from the room." : "You left the room." });
      removePlayer(id, "kick");
    }

    // ---------- flow ----------

    function setPhase(phase, ms) {
      H.phase = phase;
      H.deadline = ms ? now() + ms : 0;
    }

    function start() {
      if (H.phase !== "lobby" || H.players.length < 2) return;
      H.players.forEach(p => { p.score = 0; p.guessed = false; p.turnPts = 0; });
      H.round = 0; H.used.clear(); H.result = null; H.podium = null;
      nextRound();
    }

    function nextRound() {
      H.round++;
      if (H.round > H.settings.rounds) return endGame();
      H.queue = H.players.map(p => p.id);
      H.drawer = null; H.word = ""; H.log = []; H.result = null;
      setPhase("round", ROUND_MS);
      sync();
    }

    function nextTurn() {
      let id;
      while (H.queue.length && !P(id = H.queue.shift())) id = null;
      if (!id || !P(id)) return nextRound();
      H.turn++;
      H.drawer = id; H.word = ""; H.answers = []; H.revealed = new Set(); H.hintTimes = []; H.log = []; H.result = null;
      H.players.forEach(p => { p.guessed = false; p.turnPts = 0; p.liked = false; });
      H.choices = makeChoices();
      setPhase("choosing", CHOOSE_MS);
      sync();
      for (const p of H.players) out(p.id, { t: "log", c: [] });
    }

    function bank() {
      const custom = parseCustom(H.settings.custom);
      if (custom.length >= MIN_CUSTOM && H.settings.customOnly) return { list: custom, custom: [] };
      return { list: words, custom: custom.length >= MIN_CUSTOM ? custom : [] };
    }

    function oneWord(taken) {
      const { list, custom } = bank();
      const from = custom.length && random() < 0.5 ? custom : list;
      let fresh = from.filter(w => !H.used.has(w.toLowerCase()) && !taken.has(w.toLowerCase()));
      if (!fresh.length) { H.used.clear(); fresh = from.filter(w => !taken.has(w.toLowerCase())); }
      return pick(fresh.length ? fresh : from);
    }

    function makeChoices() {
      const taken = new Set(), out = [];
      for (let i = 0; i < H.settings.wordCount; i++) {
        if (H.settings.mode === "combination") {
          const a = oneWord(taken); taken.add(a.toLowerCase());
          const b = oneWord(taken); taken.add(b.toLowerCase());
          out.push(`${a} ${b}`);
        } else {
          const w = oneWord(taken); taken.add(w.toLowerCase());
          out.push(w);
        }
      }
      return out;
    }

    function choose(i) {
      if (H.phase !== "choosing") return;
      const w = H.choices[clampInt(i, 0, H.choices.length - 1, 0)];
      H.word = w;
      w.split(" ").forEach(x => H.used.add(x.toLowerCase()));
      H.used.add(w.toLowerCase());
      // Combination words can be guessed in either order.
      H.answers = [w];
      if (H.settings.mode === "combination") { const [a, b] = w.split(" "); H.answers.push(`${b} ${a}`); }
      const letters = [...w].filter(isLetter).length;
      const hints = H.settings.mode === "hidden" ? 0 : Math.min(H.settings.hints, Math.floor(letters / 2));
      const total = H.settings.drawTime * 1000;
      H.startedAt = now();
      H.hintTimes = Array.from({ length: hints }, (_, k) => H.startedAt + Math.round(total * (k + 1) / (hints + 1)));
      setPhase("drawing", total);
      sync();
    }

    function revealHint() {
      const letters = [...H.word].filter(isLetter).length;
      const hidden = Array.from({ length: letters }, (_, i) => i).filter(i => !H.revealed.has(i));
      if (hidden.length > 1) H.revealed.add(pick(hidden));
    }

    function endTurn(reason) {
      if (H.phase !== "drawing" && H.phase !== "choosing") return;
      const drawer = P(H.drawer);
      if (!H.word) {
        // The drawer left before picking a word.
        H.result = null;
        setPhase("result", 0);
        return nextTurn();
      }
      const guessers = others();
      const got = guessers.filter(p => p.guessed);
      if (drawer && got.length) {
        drawer.turnPts = Math.round(got.reduce((s, p) => s + p.turnPts, 0) / Math.max(1, guessers.length));
        drawer.score += drawer.turnPts;
      }
      H.result = {
        word: H.word, reason,
        gains: H.players.map(p => ({ id: p.id, pts: p.turnPts })).sort((a, b) => b.pts - a.pts),
      };
      everyone("sys", `The word was '${H.word}'`);
      setPhase("result", got.length || reason !== "time" ? RESULT_MS : NOBODY_MS + 2000);
      sync();
    }

    function endGame() {
      const ranked = [...H.players].sort((a, b) => b.score - a.score);
      let place = 0, last = null;
      H.podium = ranked.map((p, i) => { if (p.score !== last) { place = i + 1; last = p.score; } return { id: p.id, name: p.name, av: p.av, score: p.score, place }; });
      if (ranked[0]) everyone("sys", `${ranked[0].name} won with a score of ${ranked[0].score}!`);
      H.drawer = null; H.word = ""; H.log = [];
      setPhase("podium", PODIUM_MS);
      sync();
    }

    function toLobby() {
      H.drawer = null; H.word = ""; H.log = []; H.queue = []; H.result = null; H.round = 0;
      H.players.forEach(p => { p.guessed = false; p.turnPts = 0; });
      setPhase("lobby", 0);
      sync();
      for (const p of H.players) out(p.id, { t: "log", c: [] });
    }

    function tick() {
      const t = now();
      if (H.phase === "drawing" && H.hintTimes.length && t >= H.hintTimes[0]) {
        H.hintTimes.shift();
        revealHint();
        sync();
      }
      if (!H.deadline || t < H.deadline) return;
      if (H.phase === "round") nextTurn();
      else if (H.phase === "choosing") choose(Math.floor(random() * H.choices.length));
      else if (H.phase === "drawing") endTurn("time");
      else if (H.phase === "result") nextTurn();
      else if (H.phase === "podium") toLobby();
    }

    // ---------- chat & guesses ----------

    function chat(p, text) {
      text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 100);
      if (!text) return;
      const t = now();
      p.msgTimes = p.msgTimes.filter(x => t - x < 2000);
      if (p.msgTimes.length >= 4) { msg([p], "bad", "Spam detected! You're sending messages too quickly."); return; }
      p.msgTimes.push(t);

      if (H.phase !== "drawing") return everyone("chat", text, p);
      const inner = H.players.filter(x => x.id === H.drawer || x.guessed);
      if (p.id === H.drawer || p.guessed) return msg(inner, "inner", text, p);

      const g = norm(text);
      if (H.answers.some(a => norm(a) === g || squash(a) === squash(text))) {
        const frac = Math.max(0, H.deadline - t) / (H.settings.drawTime * 1000);
        p.guessed = true;
        p.turnPts = Math.max(10, Math.round(50 + 250 * frac));
        p.score += p.turnPts;
        everyone("good", `${p.name} guessed the word!`);
        out(p.id, { t: "you-guessed", word: H.word, pts: p.turnPts });
        if (others().every(o => o.guessed)) return endTurn("all");
        return sync();
      }
      everyone("chat", text, p);
      if (H.answers.some(a => squash(a).length > 2 && lev(squash(text), squash(a)) === 1)) msg([p], "close", `'${text}' is close!`);
    }

    function vote(p, kind) {
      if (H.phase !== "drawing" || p.id === H.drawer || p.liked) return;
      p.liked = true;
      everyone(kind === "like" ? "like" : "dislike", `${p.name} ${kind === "like" ? "liked" : "disliked"} the drawing!`);
    }

    function votekick(p, targetId) {
      const target = P(targetId);
      if (!target || target.id === p.id || target.id === H.owner) return;
      const set = H.kickVotes.get(target.id) || new Set();
      if (set.has(p.id)) return;
      set.add(p.id);
      H.kickVotes.set(target.id, set);
      const need = Math.floor(H.players.length / 2) + 1;
      everyone("sys", `${p.name} is voting to kick ${target.name} (${set.size}/${need})`);
      if (set.size >= need) kick(target.id, "kick");
    }

    // ---------- drawing ----------

    function validCmd(c) {
      if (!Array.isArray(c)) return false;
      if (c[0] === 0) return c.length === 8 && c.slice(1).every(Number.isFinite);
      if (c[0] === 1) return c.length === 4 && c.slice(1).every(Number.isFinite);
      return c[0] === 2 && c.length === 1;
    }

    function draw(p, cmds) {
      if (H.phase !== "drawing" || p.id !== H.drawer || !Array.isArray(cmds)) return;
      const ok = cmds.slice(0, MAX_CMDS).filter(validCmd);
      if (!ok.length) return;
      H.log.push(...ok);
      for (const o of H.players) if (o.id !== p.id) out(o.id, { t: "draw", c: ok });
    }

    function undo(p) {
      if (H.phase !== "drawing" || p.id !== H.drawer || !H.log.length) return;
      let n = H.log.length - 1;
      while (n > 0 && !(H.log[n][0] !== 0 || H.log[n][7] === 1)) n--;
      H.log.length = n;
      for (const o of H.players) out(o.id, { t: "undo", n });
    }

    // ---------- inbox ----------

    function receive(id, m) {
      const p = P(id);
      if (!p || !m || typeof m !== "object") return;
      const isOwner = id === H.owner;
      switch (m.t) {
        case "settings": if (isOwner && H.phase === "lobby") { H.settings = cleanSettings(m.s, H.settings); sync(); } break;
        case "start": if (isOwner) start(); break;
        case "pick": if (id === H.drawer) choose(m.i); break;
        case "draw": draw(p, m.c); break;
        case "undo": undo(p); break;
        case "chat": chat(p, m.x); break;
        case "vote": vote(p, m.k); break;
        case "votekick": votekick(p, m.id); break;
        case "kick": if (isOwner && m.id !== id && P(m.id)) kick(m.id, "kick"); break;
        case "avatar": p.av = cleanAvatar(m.av); sync(); break;
      }
    }

    return { addPlayer, removePlayer, receive, tick, sync, state: H };
  }

  return { create, DRAW_TIMES, DEFAULTS, parseCustom, norm, lev, MIN_CUSTOM, MAX_ROOM };
})();

if (typeof module !== "undefined") module.exports = SquintHost;
