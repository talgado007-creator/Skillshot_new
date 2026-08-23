const { chromium } = require('playwright');
const { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter } = require('./harness');
const R = reporter(), ok = R.ok;



async function trial(p, mode, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => {
      const m = document.getElementById('menu'), o = document.getElementById('over');
      if (o.classList.contains('on')) document.getElementById('again').click();
      else document.getElementById('play').click();
    });
    await clearAd(p);
    if (mode === 'run') { await p.keyboard.down('d'); }
    // wait for death
    let t = null;
    for (let k = 0; k < 200; k++) {
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => document.getElementById('over').classList.contains('on')
        ? document.getElementById('otime').textContent : null);
      if (r) { t = parseFloat(r); break; }
    }
    if (mode === 'run') await p.keyboard.up('d');
    out.push(t);
  }
  return out;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(PHONE);
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(gameUrl());
  await p.waitForTimeout(1200);

  const still = await trial(p, 'still', 5);
  const run = await trial(p, 'run', 5);
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  console.log('stationary player :', still.join(', '), '  avg', avg(still));
  console.log('holds one direction:', run.join(', '), '  avg', avg(run));
  R.finish(errs);
  await b.close();
})();
