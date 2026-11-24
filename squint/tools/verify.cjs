// Checks the host's game rules without a browser: node squint/tools/verify.cjs
const assert = require("node:assert/strict");
const path = require("node:path");
const WORDS = require(path.join(__dirname, "../js/words.js"));
const SquintHost = require(path.join(__dirname, "../js/host.js"));

function room(opts = {}) {
  let t = 1_000_000;
  const inbox = {};
  const host = SquintHost.create({
    out: (id, m) => (inbox[id] ||= []).push(structuredClone(m)),
    words: opts.words || WORDS,
    now: () => t,
    random: opts.random || (() => 0),
  });
  return {
    host, inbox,
    advance(ms) { t += ms; host.tick(); },
    last: (id, type) => (inbox[id] || []).filter(m => m.t === type).at(-1),
    all: (id, type) => (inbox[id] || []).filter(m => m.t === type),
    clear() { for (const k in inbox) inbox[k].length = 0; },
  };
}

function startedRoom(n = 3, opts) {
  const r = room(opts);
  for (let i = 0; i < n; i++) r.host.addPlayer("p" + i, "Player " + i, [i, 0, 0, 0]);
  return r;
}

// Word bank sanity
assert(WORDS.length > 500, "word bank should have hundreds of words");
assert(WORDS.every(w => w.length <= 32 && w === w.trim()), "words are trimmed and short");

// Lobby + settings: only the owner can change them, values are clamped
{
  const r = startedRoom(3);
  const H = r.host.state;
  assert.equal(H.owner, "p0");
  r.host.receive("p1", { t: "settings", s: { rounds: 5 } });
  assert.equal(H.settings.rounds, 3, "non-owner can't change settings");
  r.host.receive("p0", { t: "settings", s: { rounds: 99, drawTime: 33, hints: 2, wordCount: 4, maxPlayers: 1 } });
  assert.equal(H.settings.rounds, 10);
  assert.equal(H.settings.drawTime, 80, "draw time must be one of the listed values");
  assert.equal(H.settings.wordCount, 4);
  assert.equal(H.settings.maxPlayers, 2);
  r.host.receive("p1", { t: "start" });
  assert.equal(H.phase, "lobby", "only the owner starts");
}

// A full turn: round splash, word choice, hints, guesses, scoring, results
{
  const r = startedRoom(3);
  const H = r.host.state;
  r.host.receive("p0", { t: "start" });
  assert.equal(H.phase, "round");
  r.advance(2000);
  assert.equal(H.phase, "choosing");
  assert.equal(H.drawer, "p0");
  const choices = r.last("p0", "state").choices;
  assert.equal(choices.length, 3);
  assert.equal(r.last("p1", "state").choices, null, "guessers never see the choices");
  r.host.receive("p0", { t: "pick", i: 1 });
  assert.equal(H.phase, "drawing");
  const word = choices[1];
  const s1 = r.last("p1", "state");
  assert.equal(s1.word, null, "guessers never receive the word");
  assert.equal(s1.mask.replace(/[^_ \-']/g, "").length, s1.mask.length, "mask is all blanks before hints");
  assert.equal(r.last("p0", "state").word, word, "the drawer sees the word");

  // hint after 1/3 of the time (2 hints)
  if ([...word].filter(c => /\p{L}/u.test(c)).length >= 4) {
    r.advance(80000 / 3 + 10);
    assert.equal(r.last("p1", "state").mask.replace(/[_ ]/g, "").length, 1, "one letter revealed");
  }

  // close guess: shown to all, "is close" only to the guesser
  r.clear();
  const close = word.slice(0, -1) + (word.endsWith("z") ? "y" : "z");
  r.host.receive("p1", { t: "chat", x: close });
  assert(r.all("p2", "msg").some(m => m.k === "chat" && m.x === close), "close guess text is public");
  if (word.replace(/ /g, "").length > 2) {
    assert(r.all("p1", "msg").some(m => m.k === "close"), "guesser hears it's close");
    assert(!r.all("p2", "msg").some(m => m.k === "close"), "others don't");
  }

  // correct guess is hidden; p1 then chats only with drawer + guessed
  r.clear();
  r.advance(1000);
  r.host.receive("p1", { t: "chat", x: word.toUpperCase() });
  assert(!r.all("p2", "msg").some(m => m.k === "chat"), "correct guess text is never shown");
  assert(r.all("p2", "msg").some(m => m.k === "good" && /guessed the word/.test(m.x)));
  assert.equal(r.last("p1", "state").word, word, "a correct guesser learns the word");
  const p1pts = H.players[1].score;
  assert(p1pts > 50 && p1pts <= 300, "early guess scores well: " + p1pts);
  r.clear();
  r.host.receive("p1", { t: "chat", x: "nice one" });
  assert(r.all("p0", "msg").some(m => m.k === "inner"), "drawer sees guessed chat");
  assert(!r.all("p2", "msg").length, "guessers still guessing don't");

  // last guess ends the turn early; drawer is paid
  r.advance(20000);
  r.host.receive("p2", { t: "chat", x: word });
  assert.equal(H.phase, "result");
  assert.equal(H.result.reason, "all");
  assert(H.players[2].score < p1pts, "later guess scores less");
  assert(H.players[0].score > 0, "drawer scores when people guess");
  r.advance(5000);
  assert.equal(H.phase, "choosing");
  assert.equal(H.drawer, "p1", "next player draws");
}

// Time runs out, nobody guesses: nobody scores; auto-pick on choice timeout
{
  const r = startedRoom(2);
  const H = r.host.state;
  r.host.receive("p0", { t: "start" });
  r.advance(2000);
  r.advance(15000);
  assert.equal(H.phase, "drawing", "word auto-picked after 15 s");
  r.advance(80000);
  assert.equal(H.phase, "result");
  assert.equal(H.result.reason, "time");
  assert(H.players.every(p => p.score === 0));
}

// Drawing log, relay and undo by stroke
{
  const r = startedRoom(3);
  const H = r.host.state;
  r.host.receive("p0", { t: "start" }); r.advance(2000); r.host.receive("p0", { t: "pick", i: 0 });
  r.clear();
  r.host.receive("p0", { t: "draw", c: [[0, 13, 10, 1, 1, 5, 5, 1], [0, 13, 10, 5, 5, 9, 9, 0], [1, 4, 100, 100], [0, 2, 4, 3, 3, 4, 4, 1], [0, 2, 4, 4, 4, 6, 6, 0], ["bad"]] });
  assert.equal(H.log.length, 5, "invalid commands are dropped");
  assert(r.last("p1", "draw") && !r.last("p0", "draw"), "relayed to everyone but the drawer");
  r.host.receive("p1", { t: "draw", c: [[2]] });
  assert.equal(H.log.length, 5, "only the drawer can draw");
  r.host.receive("p0", { t: "undo" });
  assert.equal(r.last("p2", "undo").n, 3, "undo removes the whole last stroke");
  r.host.receive("p0", { t: "undo" });
  assert.equal(H.log.length, 2, "then the fill");
  // late joiner gets the canvas so far
  r.host.addPlayer("late", "Late", [0, 0, 0, 0]);
  assert.equal(r.last("late", "log").c.length, 2);
}

// Drawer leaves mid-turn; too few players returns to lobby
{
  const r = startedRoom(3);
  const H = r.host.state;
  r.host.receive("p0", { t: "start" }); r.advance(2000); r.host.receive("p0", { t: "pick", i: 0 });
  r.host.removePlayer("p0");
  assert.equal(H.phase, "result");
  assert.equal(H.result.reason, "left");
  r.host.removePlayer("p1");
  assert.equal(H.phase, "lobby", "one player left: back to the lobby");
}

// Votekick needs a majority and can't target the owner
{
  const r = startedRoom(4);
  const H = r.host.state;
  r.host.receive("p1", { t: "votekick", id: "p0" });
  assert.equal(H.players.length, 4, "owner can't be votekicked");
  r.host.receive("p1", { t: "votekick", id: "p3" });
  r.host.receive("p2", { t: "votekick", id: "p3" });
  assert.equal(H.players.length, 4, "2 of 4 is not enough");
  r.host.receive("p0", { t: "votekick", id: "p3" });
  assert.equal(H.players.length, 3, "3 of 4 kicks");
  assert.equal(r.last("p3", "bye").msg, "You were kicked from the room.");
  r.host.receive("p0", { t: "kick", id: "p2" });
  assert.equal(H.players.length, 2, "owner can kick directly");
}

// Custom words only, combination and hidden modes
{
  const custom = "alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel, india, juliett";
  const r = startedRoom(2);
  const H = r.host.state;
  r.host.receive("p0", { t: "settings", s: { custom, customOnly: true, mode: "combination", wordCount: 2 } });
  r.host.receive("p0", { t: "start" }); r.advance(2000);
  const ch = r.last("p0", "state").choices;
  assert(ch.every(w => w.split(" ").length === 2 && w.split(" ").every(x => custom.includes(x))), "combination of custom words: " + ch);
  r.host.receive("p0", { t: "pick", i: 0 });
  const [a, b] = ch[0].split(" ");
  r.host.receive("p1", { t: "chat", x: `${b} ${a}` });
  assert(H.players[1].guessed, "combination words work in either order");
}
{
  const r = startedRoom(2);
  r.host.receive("p0", { t: "settings", s: { mode: "hidden" } });
  r.host.receive("p0", { t: "start" }); r.advance(2000); r.host.receive("p0", { t: "pick", i: 0 });
  const s = r.last("p1", "state");
  assert(s.hidden && !s.mask && !s.word, "hidden mode shows no blanks");
}

// Spam protection and the end of the game
{
  const r = startedRoom(2);
  for (let i = 0; i < 6; i++) r.host.receive("p1", { t: "chat", x: "hi " + i });
  assert(r.all("p1", "msg").some(m => /Spam detected/.test(m.x)));
  const H = r.host.state;
  r.host.receive("p0", { t: "settings", s: { rounds: 2 } });
  r.host.receive("p0", { t: "start" });
  for (let i = 0; i < 20 && H.phase !== "podium"; i++) r.advance(100000);
  assert.equal(H.phase, "podium");
  assert.equal(H.podium.length, 2);
  r.advance(8000);
  assert.equal(H.phase, "lobby");
}

// Guess matching
assert.equal(SquintHost.norm("  T-Shirt! "), "t shirt");
assert.equal(SquintHost.lev("housr", "house"), 1);

console.log("Squint host checks pass: settings, turns, hints, hidden word, guesses, close guesses, guessed-only chat, scoring, drawing/undo, late join, leaving, votekick, custom/combination/hidden modes, spam, podium.");
