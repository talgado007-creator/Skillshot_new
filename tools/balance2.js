const { chromium } = require('playwright');
const { gameUrl, PHONE, clearAd, watchAd, dieNow, reporter } = require('./harness');
const R = reporter(), ok = R.ok;
const K = ['a', 'd', 'w', 's'];



(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(PHONE);
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto(gameUrl());
  await p.waitForTimeout(1000);

  const times = [];
  for (let i = 0; i < 12; i++) {
    await p.evaluate(() => {
      const o = document.getElementById('over');
      (o.classList.contains('on') ? document.getElementById('again') : document.getElementById('play')).click();
    });
    await clearAd(p);
    let cur = null, t = null;
    for (let k = 0; k < 400; k++) {
      // change direction every ~300ms, like a twitchy player with no plan
      const nk = K[(Math.random() * 4) | 0];
      if (cur) await p.keyboard.up(cur);
      await p.keyboard.down(nk); cur = nk;
      await p.waitForTimeout(300);
      const r = await p.evaluate(() => document.getElementById('over').classList.contains('on')
        ? document.getElementById('otime').textContent : null);
      if (r) { t = parseFloat(r); break; }
    }
    if (cur) await p.keyboard.up(cur);
    times.push(t);
  }
  const avg = (times.reduce((a, c) => a + c, 0) / times.length).toFixed(2);
  console.log('random wiggler:', times.join(', '), '  avg', avg);
  R.finish(errs);
  await b.close();
})();
