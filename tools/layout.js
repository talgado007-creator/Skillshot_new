// Covers the customisable control layout: drag, resize, persist, reload.
//
//   cd tools && node layout.js
//
// The persistence half matters most. The first version of this feature applied
// positions and dragged correctly but never read the saved layout back, because
// loadLayout() ran before Store was initialised. Everything looked right in a
// single session and silently reset on relaunch, so a test that only checks
// dragging would have passed. This one reloads the page.

const { chromium } = require('playwright');
const { gameUrl, PHONE, reporter } = require('./harness');

const KEY = 'skillshot.layout.v1';

const box = (page, a) => page.locator(`.ab[data-a="${a}"]`).boundingBox();
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY);

(async () => {
  const t = reporter();
  const browser = await chromium.launch();
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(gameUrl());
  await page.waitForTimeout(600);

  t.ok(await page.locator('#ctrlopen').isVisible(), 'the menu offers a customise entry point');

  await page.click('#ctrlopen');
  await page.waitForTimeout(250);

  t.ok(await page.locator('#ctrlpanel').isVisible(), 'the size panel appears');
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('.ab')].filter(b => !b.classList.contains('hide')).length);
  t.ok(shown === 3, 'all three buttons are placeable regardless of loadout', { shown });

  // ── drag FLASH to the left side ──
  const before = await box(page, 'flash');
  const target = { x: 90, y: 470 };
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const after = await box(page, 'flash');
  const movedTo = { x: Math.round(after.x + after.width / 2), y: Math.round(after.y + after.height / 2) };
  t.ok(Math.abs(movedTo.x - target.x) < 12 && Math.abs(movedTo.y - target.y) < 12,
       'the dragged button lands where the pointer left it', movedTo);

  // ── resize the selected button ──
  await page.locator('#ctrlsize').evaluate(el => {
    el.value = '96';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  const big = await box(page, 'flash');
  t.ok(Math.round(big.width) === 96, 'the slider resizes the selected button', { w: Math.round(big.width) });

  // the glyph must scale with the button, not sit tiny inside a big circle
  const glyph = await page.locator('.ab[data-a="flash"] .k').evaluate(el =>
    parseFloat(getComputedStyle(el).fontSize));
  t.ok(glyph > 24, 'the letter scales with the button', { fontSize: glyph });

  // ── only the selected button changed ──
  const dashBox = await box(page, 'dash');
  t.ok(Math.round(dashBox.width) === 64, 'resizing one button leaves the others alone',
       { dash: Math.round(dashBox.width) });

  await page.click('#ctrldone');
  await page.waitForTimeout(250);
  t.ok(await page.locator('#menu').isVisible(), 'DONE returns to the menu');

  const saved = await stored(page);
  t.ok(!!saved, 'the layout was written to storage');
  const parsed = JSON.parse(saved || '{}');
  t.ok(parsed.flash && parsed.flash.s === 96, 'the stored size is the one we set', parsed.flash);

  // ── the real test: does it survive a reload? ──
  await page.reload();
  await page.waitForTimeout(700);
  const reloaded = await box(page, 'flash');
  const c = { x: Math.round(reloaded.x + reloaded.width / 2), y: Math.round(reloaded.y + reloaded.height / 2) };
  t.ok(Math.round(reloaded.width) === 96, 'size survives a reload', { w: Math.round(reloaded.width) });
  t.ok(Math.abs(c.x - target.x) < 12 && Math.abs(c.y - target.y) < 12,
       'position survives a reload', c);

  // ── a stored layout that would land off screen is pulled back ──
  await page.evaluate(k => localStorage.setItem(k,
    JSON.stringify({ flash:{x:9,y:9,s:64}, dash:{x:-4,y:.5,s:64}, ghost:{x:.5,y:.9,s:64} })), KEY);
  await page.reload();
  await page.waitForTimeout(700);
  const vw = PHONE.viewport.width, vh = PHONE.viewport.height;
  const off = await box(page, 'flash');
  t.ok(off.x >= -1 && off.y >= -1 && off.x + off.width <= vw + 1 && off.y + off.height <= vh + 1,
       'an off-screen stored position is clamped back into view',
       { x: Math.round(off.x), y: Math.round(off.y) });

  await browser.close();
  process.exit(t.finish(errors));
})();
