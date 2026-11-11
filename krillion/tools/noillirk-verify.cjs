// Browser regression: NODE_PATH=<directory containing Playwright> node krillion/tools/noillirk-verify.cjs [chromium-path]
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  let file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.argv[2], args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      // A pre-mode save, including a daily pick with no explicit points field.
      if (!localStorage.getItem('krillion.v1')) localStorage.setItem('krillion.v1', JSON.stringify({
        seenHelp: true, bestClassic: 75, days: { 1: { picks: [{ tier: 'p' }], done: true } },
      }));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/krillion/`);
    await page.clock.install();
    await page.locator('[data-mode="noillirk"]').click();
    assert.match(await page.locator('#modeDesc').textContent(), /most common answers score highest/);
    assert.equal(await page.locator('#bestValue').textContent(), '0m');
    await page.locator('#how').click();
    assert.match(await page.locator('#modal h2').textContent(), /Noillirk/);
    assert.deepEqual(await page.locator('.tier-table b').allTextContents(), ['10', '15', '30', '60', '85', '100']);
    await page.locator('#closeHow').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile menu must not overflow horizontally');
    await page.evaluate(() => {
      // Exercise every tier, then a pass, against a real bank.
      drawPrompts = n => Array(n).fill(PROMPTS.findIndex(p => p[0] === 'Name a cheese'));
      window.assertLegacy = totalPts(save.days[1].picks);
      // Stub sound only; rendering, scoring and input use the real game code.
      Sound.play = () => {};
    });
    assert.equal(await page.evaluate(() => assertLegacy), 10, 'old daily saves retain original points');
    await page.locator('#begin').click();
    const tiers = ['p', 's', 'r', 'd', 'k', 'c', null];
    const points = [100, 85, 60, 30, 10, 15, 0];
    let total = 0;
    for (let i = 0; i < tiers.length; i++) {
      await page.clock.runFor(3100);
      assert.match(await page.locator('.phint').textContent(), /common answers/);
      if (i === 0) {
        await page.locator('#ans').fill('zzzzzzzzzz');
        await page.locator('#ansForm').evaluate(form => form.requestSubmit());
        assert.match(await page.locator('#fb').textContent(), /not accepted/);
      }
      if (tiers[i]) {
        const answer = await page.evaluate(t => curRound.bank.entries.find(e => e.tier === t).shown, tiers[i]);
        await page.locator('#ans').fill(answer);
        await page.locator('#ansForm').evaluate(form => form.requestSubmit());
      } else await page.locator('#pass').click();
      await page.clock.runFor(16000);
      assert.match(await page.locator('.gain').textContent(), new RegExp(`\\+${points[i]} pts`));
      total += points[i];
      assert.equal(await page.evaluate(() => totalPts(game.picks)), total);
      assert.equal(await page.locator('.meter span').first().textContent(), 'Rare');
      await page.locator('#next').click();
    }
    assert.match(await page.locator('.elabel').textContent(), /Noillirk/);
    assert.match(await page.locator('.ezone').textContent(), /300 pts/);
    assert.deepEqual(await page.locator('.etag').allTextContents(), ['Plankton +100', 'Schooler +85', 'Rare +60', 'Deep Cut +30', 'One in a Krillion +10', 'Too Clever +15', '+0']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('krillion.v1')));
    assert.equal(saved.bestNoillirk, 300);
    assert.equal(saved.bestClassic, 75);
    assert.equal(saved.bestInfinite, 0);
    assert.equal(saved.krillions, 0);
    assert.match(await page.evaluate(() => shareText([{ tier: 'p', pts: 100 }], 'Noillirk Dive', 'noillirk')), /^NOILLIRK.*\n🌊 1,000m/);
    await page.locator('#again').click();
    assert.equal(await page.evaluate(() => game.mode), 'noillirk');
    await page.locator('[data-act="quit"]').click();
    await page.reload();
    assert.equal(await page.locator('[data-mode="noillirk"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#bestValue').textContent(), '3,000m');
    await page.locator('[data-mode="classic"]').click();
    assert.equal(await page.locator('#bestValue').textContent(), '750m');
    await page.locator('#begin').click();
    assert.equal(await page.evaluate(() => game.mode), 'classic');
    assert.match(await page.locator('.phint').textContent(), /rarer answers/);
    const original = await page.evaluate(() => TIER_ORDER.map(t => pointsFor(t, 'classic')));
    assert.deepEqual(original, [10, 15, 30, 60, 85, 100]);
    assert.deepEqual(errors, []);
    console.log('PASS: seven Noillirk rounds, all tiers, invalid answer, pass, totals, result rows, separate best scores, legacy saves, sharing, replay, reload, Classic and mobile layout; no browser errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
