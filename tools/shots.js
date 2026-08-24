// Capture store screenshots from the real game.
//
//   cd tools && node shots.js          -> Play, 1440x2560 (9:16)
//   cd tools && node shots.js ios      -> App Store 6.5", 1284x2778
//
// Apple's ratio is taller than Play's 16:9, so each store needs its own capture
// rather than a resize; scaling one to the other letterboxes or crops the HUD.
//
// Like harness.js this builds a throwaway copy rather than touching www/index.html.
// Two edits: the usual window.__t hook, and the death check neutered — a real run
// ends in about four seconds, long before the later hazards unlock, and holding the
// player invulnerable instead would render them at 0.35 alpha (see the flash in
// draw()). Both edits throw if their anchor is not found exactly once, so a
// restructured game file fails loudly instead of silently shooting the wrong thing.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, '..', 'www', 'index.html');
const BUILD = path.join(__dirname, '.shots-build.html');
const OUT = path.join(__dirname, '..', 'assets', 'store');

const IIFE_TAIL = '\nrequestAnimationFrame(frame);\n})();';
const DEATH = 'if (d < 0 && P.inv <= 0) { die(); return; }';
const HOOK = `
window.__t = { S, P, LOAD, cast, startRun, die, toMenu, goMenu };
requestAnimationFrame(frame);
})();`;

// CSS viewport x deviceScaleFactor must land exactly on each store's pixel size.
const TARGETS = {
  play: { view: { width: 360, height: 640 }, scale: 4, prefix: 'screen',     px: '1440x2560' },
  ios:  { view: { width: 428, height: 926 }, scale: 3, prefix: 'ios-screen', px: '1284x2778' }
};
const key = (process.argv[2] || 'play').toLowerCase();
const T = TARGETS[key];
if (!T) { console.error(`unknown target "${key}" — use play or ios`); process.exit(1); }

// A believable board, so the death screen is not an empty-state screenshot.
const BOARD = [
  { t: 47.61, g: 31, l: 'FD', r: 0 },
  { t: 41.28, g: 24, l: 'G',  r: 1 },
  { t: 38.94, g: 19, l: '',   r: 0 },
  { t: 33.07, g: 14, l: 'F',  r: 0 },
  { t: 28.52, g: 11, l: 'DG', r: 2 },
  { t: 24.10, g: 7,  l: '',   r: 0 }
];

function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const once = (s, needle, what) => {
    if (s.split(needle).length - 1 !== 1) {
      throw new Error(`shots: ${what} not found exactly once in www/index.html — ` +
                      'the file changed shape, update the anchors in tools/shots.js');
    }
  };
  once(src, IIFE_TAIL, 'the IIFE tail');
  once(src, DEATH, 'the death check');
  fs.writeFileSync(BUILD,
    src.replace(DEATH, 'if (false) { die(); return; }').replace(IIFE_TAIL, HOOK));
  return 'file://' + BUILD;
}

/**
 * Wait until the HUD clock passes `secs`.
 * fmt() in the game switches from "12.34" to "2:05.31" at the minute mark, so a bare
 * parseFloat reads the minutes as seconds and never advances past 1.
 */
async function clockPast(page, secs, capMs = 120000) {
  const t0 = Date.now();
  for (;;) {
    const t = await page.evaluate(() => {
      const s = document.getElementById('ctime').textContent.trim();
      const p = s.split(':');
      return p.length === 2 ? parseFloat(p[0]) * 60 + parseFloat(p[1]) : parseFloat(s) || 0;
    });
    if (t >= secs) return t;
    if (Date.now() - t0 > capMs) throw new Error(`timed out waiting for clock ${secs}s (got ${t})`);
    await page.waitForTimeout(150);
  }
}

async function shoot(page, name) {
  const file = path.join(OUT, `${T.prefix}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('  wrote', path.basename(file));
}

/** Put the player somewhere specific, as a fraction of the arena. */
async function place(page, fx, fy) {
  await page.evaluate(([fx, fy]) => {
    const cv = document.getElementById('game');
    __t.P.x = cv.clientWidth * fx;
    __t.P.y = cv.clientHeight * fy;
    __t.P.vx = 0; __t.P.vy = 0;
  }, [fx, fy]);
}

/**
 * Hold until the arena is genuinely busy. The game is sparse at any given instant
 * because projectiles cross fast, so shooting blind gives a near-empty screen.
 * Polls S.haz and fires as soon as `want` hazards are live; if that never happens
 * it shoots anyway and reports the best it saw, so thresholds can be tuned.
 */
async function waitBusy(page, want, capMs = 15000) {
  const t0 = Date.now();
  let best = 0;
  for (;;) {
    const n = await page.evaluate(() => {
      // S.haz counts hazards anywhere in the world, including ones still well off
      // screen — every threat is spawned at least 0.52 screen-diagonals away. Only
      // what is actually inside the arena makes a screenshot look busy.
      const cv = document.getElementById('game');
      const w = cv.clientWidth, h = cv.clientHeight;
      return __t.S.haz.filter(z => z.x > -20 && z.x < w + 20 && z.y > -20 && z.y < h + 20).length;
    });
    if (n > best) best = n;
    if (n >= want) return { n, best, hit: true };
    if (Date.now() - t0 > capMs) return { n, best, hit: false };
    await page.waitForTimeout(80);
  }
}

async function busyShot(page, name, fx, fy, want) {
  await place(page, fx, fy);
  const r = await waitBusy(page, want);
  await place(page, fx, fy);
  await shoot(page, name);
  console.log(`      hazards ${r.n} (peak ${r.best}, wanted ${want}${r.hit ? '' : ' — TIMEOUT'})`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const url = build();
  console.log(`target ${key} -> ${T.px}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: T.view, deviceScaleFactor: T.scale });

  await ctx.addInitScript(board => {
    localStorage.setItem('skillshot.scores.v1', JSON.stringify(board));
  }, BOARD);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(1200);          // fonts + first paint

  // Arm Ghost too: three abilities read better on the menu than two, and the in-run
  // HUD then shows all three buttons.
  await page.click('.card[data-a="ghost"]');
  await page.waitForTimeout(200);
  await shoot(page, '1-menu');

  await page.click('#play');

  // Each shot gets its own corner of the arena so the set does not read as one
  // static composition, and its own hazard threshold as the ramp steepens.
  await clockPast(page, 12);
  await busyShot(page, '2-early', 0.30, 0.62, 4);

  await clockPast(page, 34);
  await busyShot(page, '3-mid', 0.70, 0.34, 6);

  await clockPast(page, 62);
  // fire two abilities so the HUD shows live cooldown sweeps
  await page.evaluate(() => { __t.cast('dash'); });
  await page.waitForTimeout(120);
  await busyShot(page, '4-late', 0.38, 0.30, 7);

  await clockPast(page, 95);
  await page.evaluate(() => { __t.cast('flash'); });
  await busyShot(page, '5-deep', 0.58, 0.66, 8);

  await page.evaluate(() => { __t.S.count = 0; __t.P.inv = 0; __t.die(); });
  await page.waitForTimeout(900);
  await shoot(page, '6-board');

  await browser.close();
  if (errors.length) { console.log('page errors:'); errors.forEach(e => console.log(e)); }
  else { console.log('no page errors'); }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
