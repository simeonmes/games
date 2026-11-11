// Optional end-to-end test: install Playwright and Chromium before running.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const name = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!name.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  const file = new URL(req.url, 'http://localhost').pathname.endsWith('/') ? path.join(name, 'index.html') : name;
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  async function player() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/krillion/`);
    await page.locator("#closeHow").click();
    return page;
  }
  try {
    const host = await player(), guest = await player();
    // Force the original bug: the guest's local indices AND extra answer banks differ.
    await guest.evaluate(() => { PROMPTS.reverse(); BANK_SOURCES.length = 0; banks.clear(); });
    await host.evaluate(() => {
      drawPrompts = () => ['Name a cheese', 'Name a fruit'].map(q => PROMPTS.findIndex(p => p[0] === q));
      Room.open();
    });
    await host.locator('#create').click();
    await host.locator('.code-big').waitFor();
    const code = (await host.locator('.code-big').textContent()).replace(/\D/g, '');
    await guest.evaluate(code => Room.open(code), code);
    await guest.locator('#joinForm').evaluate(form => form.requestSubmit());
    await guest.locator('.plist li').nth(1).waitFor();
    await host.locator('#start').click();
    for (const [i, question, answer] of [[0, 'Name a cheese', 'mozzarella'], [1, 'Name a fruit', 'peach']]) {
      await host.locator('#ans').waitFor(); await guest.locator('#ans').waitFor();
      assert.equal(await host.locator('.ptext').textContent(), question);
      assert.equal(await guest.locator('.ptext').textContent(), question);
      const banks = await Promise.all([host, guest].map(p => p.evaluate(() => JSON.stringify([...curRound.bank.index].map(([key, e]) => [key, e.shown, e.tier])))));
      assert.equal(banks[0], banks[1], 'host and guest must use exactly the same answer bank');
      await Promise.all([host, guest].map(async p => { await p.locator('#ans').fill(answer); await p.locator('#ansForm').evaluate(form => form.requestSubmit()); }));
      await host.locator('#next').waitFor({ timeout: 20000 });
      await guest.locator('.room-reveal').waitFor({ timeout: 20000 });
      const rows = await guest.locator('.answers li .tagc').allTextContents();
      assert.equal(rows.length, 2); assert(rows.every(text => /\+[1-9]/.test(text)), 'both correct answers must earn points');
      const titles = await Promise.all([host, guest].map(p => p.locator('.ptext').textContent()));
      assert.deepEqual(titles, [question, question]);
      console.log(`Round ${i + 1}: identical question/banks, both correct answers scored, synchronized reveal.`);
      await host.locator('#next').click();
    }
    await guest.locator('.podium').waitFor();
    const totals = await Promise.all([host, guest].map(p => p.locator('.podium .pd').allTextContents()));
    assert.deepEqual(totals[0], totals[1]);
    await host.locator('#again').click();
    await guest.locator('.plist li').nth(1).waitFor();
    await host.locator('#start').click();
    await guest.locator('#ans').waitFor();
    assert.equal(await guest.locator('.ptext').textContent(), 'Name a cheese');
    assert.deepEqual(errors, []);
    console.log('PASS: real PeerJS room, incompatible local catalogs, two scored rounds, final results and replay; no page errors.');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
