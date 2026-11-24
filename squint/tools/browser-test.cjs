// Plays a real 3-player room in Chromium against a local PeerJS server.
//   npx peerjs --port 9000 --path /          (local PeerJS server)
//   python3 -m http.server 8080              (from the games folder)
//   node squint/tools/browser-test.cjs [screenshot dir]
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.SQUINT_URL || "http://127.0.0.1:8080/squint/index.html";
const PEER = process.env.SQUINT_PEER || "127.0.0.1:9000";
const OUT = process.argv[2] || path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const watch = (page, who) => {
  page.on("pageerror", e => errors.push(`${who}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/hitscounter|games-live|favicon|ERR_|net::/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const canvasHash = page => page.evaluate(() => {
  const c = document.getElementById("board");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 0, ink = 0;
  for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) | 0; if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) ink++; }
  return { h, ink };
});
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = opts => browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const host = await (await ctx()).newPage(); watch(host, "host");
  await host.goto(`${BASE}?peer=${PEER}`);
  await host.screenshot({ path: path.join(OUT, "01-home.png") });
  await host.fill("#name", "Ana");
  await host.click("#createBtn");
  await host.waitForSelector("#game:not([hidden])", { timeout: 15000 });
  await host.waitForSelector(".invite b");
  const code = (await host.textContent(".invite b")).trim();
  assert.match(code, /^\d{6}$/);

  const join = async (name, opts) => {
    const p = await (await ctx(opts)).newPage(); watch(p, name);
    await p.goto(`${BASE}?room=${code}&peer=${PEER}`);
    await p.fill("#name", name);
    await p.click("#playBtn");
    await p.waitForSelector("#game:not([hidden])", { timeout: 15000 });
    return p;
  };
  const ben = await join("Ben");
  const cy = await join("Cy");
  await host.waitForFunction(() => document.querySelectorAll("#players .pl").length === 3);
  await host.selectOption("#sTime", "60");
  await host.selectOption("#sRounds", "2");
  await ben.waitForFunction(() => document.getElementById("sTime").value === "60");
  assert(await ben.isDisabled("#sTime"), "guests can't edit settings");
  await host.screenshot({ path: path.join(OUT, "02-lobby-host.png") });

  await host.click("#startBtn");
  await host.waitForSelector(".overlay.round");
  await host.waitForSelector(".btn.word", { timeout: 5000 });
  await ben.waitForSelector(".overlay.choosing h3");
  assert.match(await ben.textContent(".overlay.choosing h3"), /Ana is choosing a word/);
  await host.screenshot({ path: path.join(OUT, "03-choose-drawer.png") });
  const word = (await host.textContent(".btn.word")).trim();
  await host.click(".btn.word");
  await host.waitForSelector("#tools:not([hidden])");
  assert(await ben.isHidden("#tools"), "guessers have no tools");
  assert.equal((await host.textContent("#wordShown")).trim(), word);
  const benWord = await ben.textContent("#wordShown");
  assert(!benWord.includes(word), "guessers see blanks only");

  // draw: a few strokes in different colours and sizes, then a fill
  const box = await host.locator("#board").boundingBox();
  const at = (x, y) => [box.x + box.width * x, box.y + box.height * y];
  const stroke = async pts => { await host.mouse.move(...at(...pts[0])); await host.mouse.down(); for (const p of pts.slice(1)) await host.mouse.move(...at(...p), { steps: 6 }); await host.mouse.up(); };
  await stroke([[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]]);
  await host.click('#palette button[data-c="2"]');
  await host.click('#sizes button[data-s="3"]');
  await stroke([[0.15, 0.85], [0.85, 0.15]]);
  await host.click('#palette button[data-c="4"]');
  await host.click("#toolFill");
  await host.mouse.click(...at(0.45, 0.4));
  await host.click("#toolBrush");
  await host.click('#palette button[data-c="7"]');
  await stroke([[0.1, 0.1], [0.2, 0.2], [0.1, 0.3]]);
  await wait(800);
  const hHash = await canvasHash(host), bHash = await canvasHash(ben), cHash = await canvasHash(cy);
  assert(hHash.ink > 5000, "something was drawn");
  assert.deepEqual(bHash, hHash, "Ben's canvas matches the drawer's exactly");
  assert.deepEqual(cHash, hHash, "Cy's canvas matches the drawer's exactly");

  // undo the last stroke everywhere
  await host.click("#undoBtn");
  await wait(600);
  const u1 = await canvasHash(host), u2 = await canvasHash(ben);
  assert.deepEqual(u1, u2, "undo stays in sync");
  assert(u1.ink < hHash.ink, "undo removed the last stroke");

  // a late joiner sees the drawing so far
  const dee = await join("Dee", { ...devices["iPhone 13"] });
  await wait(800);
  assert.deepEqual(await canvasHash(dee), u1, "late joiner gets the canvas");

  // close guess, wrong guess, right guess
  const close = word.slice(0, -1) + (word.endsWith("x") ? "y" : "x");
  await ben.fill("#chatIn", close); await ben.press("#chatIn", "Enter");
  await ben.waitForSelector(".m.close");
  assert.equal(await cy.locator(".m.close").count(), 0, "close hint is private");
  await wait(600);
  await ben.fill("#chatIn", word.toUpperCase()); await ben.press("#chatIn", "Enter");
  await cy.waitForSelector(".m.good");
  assert.equal(await cy.locator(`.m.chat:has-text("${word.toUpperCase()}")`).count(), 0, "correct guess is hidden");
  await ben.waitForFunction(w => document.getElementById("wordShown").textContent.includes(w), word);
  await ben.fill("#chatIn", "so easy"); await ben.press("#chatIn", "Enter");
  await host.waitForSelector('.m.inner:has-text("so easy")');
  await wait(400);
  assert.equal(await cy.locator('.m:has-text("so easy")').count(), 0, "guessed chat stays private");
  await cy.click("#rate button[data-k=like]");
  await host.waitForSelector(".m.like");
  await host.screenshot({ path: path.join(OUT, "04-drawing-host.png") });
  await cy.screenshot({ path: path.join(OUT, "05-drawing-guesser.png") });
  await dee.screenshot({ path: path.join(OUT, "06-drawing-phone.png"), fullPage: true });

  await cy.fill("#chatIn", word); await cy.press("#chatIn", "Enter");
  await dee.fill("#chatIn", word); await dee.press("#chatIn", "Enter");
  await host.waitForSelector(".overlay.result .gains li");
  await host.screenshot({ path: path.join(OUT, "07-result.png") });
  const scores = await host.$$eval("#players .pl .who span", els => els.map(e => parseInt(e.textContent)));
  assert(scores.every(s => s > 0), "everyone scored: " + scores);

  // next drawer is Ben
  await ben.waitForSelector(".btn.word", { timeout: 8000 });
  await ben.click(".btn.word");
  await host.waitForSelector("#wordLabel:has-text('GUESS THIS')");
  await cy.screenshot({ path: path.join(OUT, "08-second-turn.png") });

  // Ben leaves mid-turn: turn ends, game continues
  await ben.click("#leaveBtn");
  await host.waitForSelector(".overlay.result .reason:has-text('drawer left')", { timeout: 8000 });

  // host closes the room: guests go home
  await host.click("#leaveBtn");
  await cy.waitForSelector("#home:not([hidden])", { timeout: 8000 });
  assert.match(await cy.textContent("#homeMsg"), /closed the room/);

  await browser.close();
  if (errors.length) { console.error("Console errors:\n" + errors.join("\n")); process.exitCode = 1; return; }
  console.log(`Browser room test passes (word "${word}"): create/join by link, settings sync, choosing, drawing sync with fill + undo, late join, close/correct/hidden guesses, guessed-only chat, likes, results, next drawer, drawer leaving, host closing.`);
})().catch(e => { console.error(e); process.exit(1); });
