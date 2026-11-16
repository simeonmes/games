const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto('http://127.0.0.1:4173/night-shift/', { waitUntil: 'networkidle' });
    assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' '), 'NIGHT SHIFT');
    assert(await page.locator('#game').isVisible());

    await page.locator('#solo').click();
    await page.waitForFunction(() => window.__NIGHT_SHIFT__?.state().running);
    assert.equal((await page.evaluate(() => __NIGHT_SHIFT__.state())).players.length, 1);
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    assert(await page.locator('.player-hud').isVisible());
    await page.screenshot({ path: '/tmp/night-shift-solo.png' });

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#coop').click();
    await page.waitForFunction(() => window.__NIGHT_SHIFT__?.state().players.length === 2);
    const state = await page.evaluate(() => __NIGHT_SHIFT__.state());
    assert.equal(state.coop, true);
    assert.equal(await page.locator('.player-hud').count(), 2);
    await page.screenshot({ path: '/tmp/night-shift-coop.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: menu, solo input, HUD, split-screen startup, and WebGL runtime.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
