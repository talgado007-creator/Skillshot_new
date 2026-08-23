// Shared rig for the Playwright harnesses.
//
// The shipping game is wrapped in an IIFE, so nothing is reachable from the page's
// global scope — deliberately. To drive it from a test we build a throwaway copy with
// a `window.__t` hook appended inside that IIFE, in tools/.test-build.html. That file
// is gitignored and never ships; www/index.html is untouched.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'www', 'index.html');
const OUT = path.join(__dirname, '.test-build.html');
const ANCHOR = '\nrequestAnimationFrame(frame);\n})();';

const HOOK = `
window.__t = { S, P, stick, LOAD, abBtns, KEY, Ads, die, retry, revive, toMenu, goMenu,
  setPause, syncCount, write, adGate, adIntro, reviveOffer, syncReviveButton, startRun,
  wipeGuard(){ const before = localStorage.getItem(KEY); scoresLoaded = false; write([]);
    const after = localStorage.getItem(KEY); scoresLoaded = true; return before === after && !!before; },
  board(){ return scores.slice(); } };
requestAnimationFrame(frame);
})();`;

/** Rebuild the hooked copy and return a file:// URL for it. */
function gameUrl({ hook = true } = {}) {
  const src = fs.readFileSync(SRC, 'utf8');
  if (!hook) return 'file://' + SRC;
  if (src.split(ANCHOR).length - 1 !== 1) {
    throw new Error('harness: could not find the single IIFE tail in www/index.html — ' +
                    'the file changed shape, update ANCHOR in tools/harness.js');
  }
  fs.writeFileSync(OUT, src.replace(ANCHOR, HOOK));
  return 'file://' + OUT;
}

const PHONE = { viewport: { width: 390, height: 844 } };

/** Dismiss whatever ad surface is up. Declines the bonus offer, closes interstitials. */
async function clearAd(p) {
  for (let i = 0; i < 80; i++) {
    if (await p.evaluate(() => document.getElementById('adintro').classList.contains('on'))) {
      await p.click('#introskip'); await p.waitForTimeout(150); continue;
    }
    const on = await p.evaluate(() => document.getElementById('adslot').classList.contains('on'));
    if (!on) return;
    if (await p.evaluate(() => !document.getElementById('adskip').disabled)) {
      await p.click('#adskip'); await p.waitForTimeout(150); return;
    }
    await p.waitForTimeout(200);
  }
}

/** Sit through a rewarded ad so the reward actually lands. */
async function watchAd(p) {
  for (let i = 0; i < 80; i++) {
    if (!await p.evaluate(() => document.getElementById('adslot').classList.contains('on'))) return;
    await p.waitForTimeout(200);
  }
}

/** Kill the player right now, whatever is on screen. Needs the __t hook. */
async function dieNow(p) {
  await p.evaluate(() => { __t.S.count = 0; __t.P.inv = 0; __t.die(); });
  await p.waitForTimeout(120);
}

function reporter() {
  let fails = 0;
  return {
    ok(cond, msg) { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); },
    finish(errs) {
      console.log('\nerrors:', errs && errs.length ? errs.join('\n') : 'none');
      console.log(fails ? fails + ' FAILING' : 'all green');
      return fails;
    }
  };
}

module.exports = { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter };
