// Capture Play/App Store screenshots from the real game.
//
//   cd tools && node shots.js
//
// Writes 1440x2560 PNGs into ../assets/store/. That is Play's 9:16 phone size;
// Apple's 6.9" 1320x2868 is a different ratio and needs its own pass.
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
window.__t = { S, P, startRun, die, toMenu, goMenu };
requestAnimationFrame(frame);
})();`;

// 360x640 CSS at 4x gives exactly 1440x2560.
const VIEW = { width: 360, height: 640 };
const SCALE = 4;

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
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  console.log('  wrote', path.relative(process.cwd(), file));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const url = build();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });

  await ctx.addInitScript(board => {
    localStorage.setItem('skillshot.scores.v1', JSON.stringify(board));
  }, BOARD);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(1200);          // fonts + first paint
  await shoot(page, 'screen-1-menu.png');

  await page.click('#play');
  await clockPast(page, 13);                 // skillshots + ground AoE + beams
  await shoot(page, 'screen-2-early.png');

  await clockPast(page, 46);                 // all five hazard types, spawn gaps tightening
  await shoot(page, 'screen-3-late.png');

  await clockPast(page, 85);                 // deep run: the arena at its busiest
  await shoot(page, 'screen-4-deep.png');

  await page.evaluate(() => { __t.S.count = 0; __t.P.inv = 0; __t.die(); });
  await page.waitForTimeout(900);            // let the panel settle
  await shoot(page, 'screen-5-board.png');

  await browser.close();
  console.log(errors.length ? '\npage errors:\n' + errors.join('\n') : '\nno page errors');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
